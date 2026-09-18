// Deudas y personas — sprint-2-deudas.md. Sin imports de next/* — ver la
// nota de independencia en sprint-1-movimientos.md §5.1.

import { round2, roundFor } from './money'
import { decimalsFor, type Currency, type Debt, type Person } from './types'

/** "Te deben $X" total (§4.7) — TODAS las pendientes, sin filtrar por fecha.
 *  Es lo que muestra la pantalla de Deudas. Nunca se suma al patrimonio. */
export function pendingTotalUsd(debts: Debt[]): number {
  return round2(debts.filter(d => d.status === 'pendiente').reduce((sum, d) => sum + d.amount_usd, 0))
}

/** Días entre dos fechas ISO, sin pasar por husos horarios. Positivo si
 *  `toISO` es posterior. */
export function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Lo que te deben para la ALERTA de la Home — no lo mismo que el total.
 *  Una deuda suelta (sin `plan_id`) cuenta siempre: no tiene fecha propia,
 *  no hay un "cuándo" que esperar. Una cuota de un plan solo cuenta si ya
 *  venció o vence dentro de `days` días (`incurred_on` es su fecha de
 *  calendario) — no se adelantan cuotas que todavía faltan. */
export function dueDebtUsd(debts: Debt[], todayISO: string, days = 7): number {
  return round2(
    debts
      .filter(d => d.status === 'pendiente')
      .filter(d => d.plan_id == null || daysBetween(todayISO, d.incurred_on) <= days)
      .reduce((sum, d) => sum + d.amount_usd, 0)
  )
}

export interface PersonDebts {
  person: Person
  debts: Debt[]
  pending_usd: number
  /** Días desde la deuda pendiente más vieja de esta persona. `null` si no
   *  tiene pendientes. */
  oldest_days: number | null
}

/** Agrupa las deudas por persona con su total pendiente y la antigüedad de
 *  la más vieja — para la pantalla de Deudas. De la que más debe a la que
 *  menos. Solo incluye personas con al menos una deuda. */
export function groupByPerson(debts: Debt[], people: Person[], todayISO: string): PersonDebts[] {
  const byPerson = new Map<string, Debt[]>()
  for (const d of debts) {
    const list = byPerson.get(d.person_id) ?? []
    list.push(d)
    byPerson.set(d.person_id, list)
  }
  return people
    .filter(p => byPerson.has(p.id))
    .map(person => {
      const list = byPerson.get(person.id) ?? []
      const pendings = list.filter(d => d.status === 'pendiente')
      const oldest = pendings.reduce<string | null>((acc, d) => (acc == null || d.incurred_on < acc ? d.incurred_on : acc), null)
      return {
        person,
        debts: list,
        pending_usd: round2(pendings.reduce((sum, d) => sum + d.amount_usd, 0)),
        oldest_days: oldest ? daysBetween(oldest, todayISO) : null,
      }
    })
    .sort((a, b) => b.pending_usd - a.pending_usd)
}

/** Redondeo HACIA ABAJO a la precisión de la moneda. El epsilon relativo
 *  evita regalar un centavo por persona cuando `x / n` no cierra exacto en
 *  binario (`3.30 / 3` → `1.0999999999999999`). */
export function floorTo(n: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency)
  const scaled = n * factor
  const eps = Math.abs(scaled) * 1e-9 + 1e-9
  return Math.floor(scaled + eps) / factor
}

/** Reparto parejo primitivo: `count` partes que SUMAN `total` exacto en la
 *  precisión de la moneda (la última se queda con el resto). Lo usan los
 *  planes de pago (N cuotas = el capital) y el reparto de un fijo. */
export function splitEven(total: number, count: number, currency: Currency): number[] {
  if (count <= 0) return []
  const each = roundFor(total / count, currency)
  const amounts = Array(count).fill(each)
  amounts[count - 1] = roundFor(total - each * (count - 1), currency)
  return amounts
}

/** Reparto parejo de un gasto compartido — **vos sos participante**
 *  (sprint-2-deudas.md §4.2). `otherCount` es cuánta gente MÁS aparte de
 *  vos. Cada una de esas personas recibe la parte redondeada hacia abajo;
 *  tu parte (`mine`) es el resto, así el redondeo, si lo hay, va a tu favor
 *  y `Σ shares ≤ total`. Es solo el valor por defecto: cada monto se puede
 *  editar, y repartir de más deja `mine` negativo — eso es ganancia. */
export function sharedSplitEven(total: number, otherCount: number, currency: Currency): { shares: number[]; mine: number } {
  if (otherCount <= 0 || !(total > 0)) return { shares: [], mine: roundFor(Math.max(total, 0), currency) }
  const share = floorTo(total / (otherCount + 1), currency)
  return { shares: Array(otherCount).fill(share), mine: roundFor(total - share * otherCount, currency) }
}

/** Tu parte de un gasto compartido dado el reparto actual: lo que sobra
 *  después de las partes de los demás. Negativo = ganancia. */
export function shareBreakdown(
  total: number,
  splitAmounts: number[],
  currency: Currency
): { mine: number; kind: 'pagas' | 'ganas' | 'exacto' } {
  const mine = roundFor(total - splitAmounts.reduce((s, x) => s + x, 0), currency)
  if (mine > 0) return { mine, kind: 'pagas' }
  if (mine < 0) return { mine, kind: 'ganas' }
  return { mine: 0, kind: 'exacto' }
}

/** Cuánto de cada parte de un gasto compartido es "recuperar costo real"
 *  (el resto es ganancia, que se reconoce recién al cobrar). Si repartiste
 *  ≤ lo que pagaste, da 1 y nada cambia. Aplicado en USD a `amount_usd`. */
export function splitPrincipalRatio(expenseAmount: number, totalSplit: number): number {
  return totalSplit > expenseAmount && totalSplit > 0 ? Math.min(1, expenseAmount / totalSplit) : 1
}

/** Lo que de los gastos de un período le corresponde a otros — solo la parte
 *  que es recuperar costo (suma `principal_usd`, nunca el margen) y solo de
 *  deudas NO condonadas (condonar es decidir gastarlo vos). Incluye las
 *  pendientes: la parte de otro no es tu gasto, te la haya pagado o no. */
export function repartidoUsd(monthGastoIds: Set<string>, debts: Debt[]): number {
  return round2(
    debts
      .filter(d => d.status !== 'condonada' && d.origin_transaction_id != null && monthGastoIds.has(d.origin_transaction_id))
      .reduce((sum, d) => sum + d.principal_usd, 0)
  )
}

/** Lo que realmente te costó el mes: gasto bruto menos lo que le toca a otros. */
export function gastoRealUsd(gastoBrutoUsd: number, repartido: number): number {
  return round2(gastoBrutoUsd - repartido)
}

/** El margen (ganancia) en USD de un conjunto de deudas: lo que excede al
 *  costo real. `≥ 0`. */
export function marginUsdOf(debts: Pick<Debt, 'amount_usd' | 'principal_usd'>[]): number {
  return Math.max(0, round2(debts.reduce((s, d) => s + (d.amount_usd - d.principal_usd), 0)))
}

/** Espejo de validateShape() en transactions.ts, para la constraint
 *  fin_debt_origin_shape: sin gasto de origen, el concepto es obligatorio. */
export function validateDebtShape(input: { origin_transaction_id?: string | null; concept?: string | null }): string | null {
  if (input.origin_transaction_id) return null
  if (!input.concept || !input.concept.trim()) return 'Una deuda suelta necesita un concepto — ¿de qué es?'
  return null
}

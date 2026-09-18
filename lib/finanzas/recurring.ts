// "Qué fijos tocan este período" y su estado — sprint-3-fijos.md. Sin
// imports de next/* — ver la nota de independencia en
// Documentos/finanzas/sprint-1-movimientos.md §5.1.

import { round2 } from './money'
import { sharedSplitEven } from './debts'
import type { Currency, Debt, Recurring, RecurringSplit, Transaction } from './types'

export function daysInMonth(year: number, month: number): number {
  // `month` es 1-12; el día 0 del mes siguiente es el último día de `month`.
  return new Date(year, month, 0).getDate()
}

/** El día del mes que le corresponde a este fijo, topeado contra el largo
 *  real de ese mes (§4.2) — un `31` cae el 28 en febrero, nunca se corre
 *  al mes siguiente ni se pierde. */
export function dueDayOf(recurring: Pick<Recurring, 'day_of_month'>, year: number, month: number): number {
  return Math.min(recurring.day_of_month, daysInMonth(year, month))
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dueDateISO(recurring: Pick<Recurring, 'day_of_month'>, year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(dueDayOf(recurring, year, month))}`
}

/** Días entre dos fechas ISO, sin husos. Positivo si `toISO` es posterior. */
export function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Los límites y la fecha de vencimiento de un período dado su año/mes de
 *  referencia. Mensual → ese mes; anual → todo el año, con `due` en el mes
 *  configurado. */
export function periodBounds(
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year'>,
  year: number,
  month: number
): { from: string; to: string; due: string } {
  if (r.frequency === 'anual') {
    const m = r.month_of_year ?? 1
    return { from: `${year}-01-01`, to: `${year}-12-31`, due: dueDateISO(r, year, m) }
  }
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`, due: dueDateISO(r, year, month) }
}

export interface Period {
  year: number
  month: number
  due: string
}

/** El período vigente de un fijo en `todayISO`. Uno mensual siempre tiene
 *  período este mes; uno anual solo en su `month_of_year`. `null` si el fijo
 *  todavía no arrancó (`starts_on` posterior al fin del período), o si es
 *  anual y no le toca este mes. */
export function currentPeriodOf(
  recurring: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year' | 'starts_on'>,
  todayISO: string
): Period | null {
  const [year, month] = todayISO.split('-').map(Number)
  if (recurring.frequency === 'anual' && recurring.month_of_year !== month) return null
  const { to, due } = periodBounds(recurring, year, month)
  if (recurring.starts_on > to) return null
  return { year, month, due }
}

function registeredIn(recurring: Recurring, allTx: Transaction[], from: string, to: string): boolean {
  return allTx.some(tx => tx.recurring_id === recurring.id && tx.date >= from && tx.date <= to)
}

/** Los períodos que faltan registrar, del más viejo al más nuevo, desde
 *  `starts_on` hasta hoy. Un fijo cargado tarde recupera los meses que ya
 *  pasaron; uno que arranca el mes que viene no aparece. Tope de 24 para que
 *  un `starts_on` mal tipeado no genere una lista infinita. */
export function pendingPeriods(recurring: Recurring, allTx: Transaction[], todayISO: string, max = 24): Period[] {
  const [sy, sm] = recurring.starts_on.split('-').map(Number)
  const [ty, tm] = todayISO.split('-').map(Number)
  const out: Period[] = []

  if (recurring.frequency === 'anual') {
    const m = recurring.month_of_year ?? 1
    for (let y = sy; y <= ty && out.length < max; y++) {
      const { from, to, due } = periodBounds(recurring, y, m)
      // El año en curso no cuenta hasta que llega su fecha: no tiene sentido
      // reclamar en agosto una renovación de noviembre.
      if (y === ty && due > todayISO) break
      if (recurring.starts_on > to) continue
      if (!registeredIn(recurring, allTx, from, to)) out.push({ year: y, month: m, due })
    }
    return out
  }

  let total = sy * 12 + (sm - 1)
  const end = ty * 12 + (tm - 1)
  for (; total <= end && out.length < max; total++) {
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    const { from, to, due } = periodBounds(recurring, y, m)
    if (recurring.starts_on > to) continue
    if (!registeredIn(recurring, allTx, from, to)) out.push({ year: y, month: m, due })
  }
  return out
}

export type RecurringStatus = 'pausado' | 'programado' | 'pendiente' | 'vencido' | 'registrado'

export interface RecurringState {
  status: RecurringStatus
  /** El período más viejo sin registrar — lo que se propone registrar. `null`
   *  si no hay nada pendiente. */
  oldest: Period | null
  /** Días de atraso del más viejo pendiente (0 si no está vencido). */
  daysLate: number
  pendingCount: number
}

/** El estado de un fijo hoy. Pausado gana sobre todo; después, si no arrancó
 *  → programado; si tiene pendientes → vencido/pendiente según la fecha; si no
 *  → registrado. */
export function recurringStatus(recurring: Recurring, allTx: Transaction[], todayISO: string): RecurringState {
  if (!recurring.active) return { status: 'pausado', oldest: null, daysLate: 0, pendingCount: 0 }

  const period = currentPeriodOf(recurring, todayISO)
  const pending = pendingPeriods(recurring, allTx, todayISO)

  if (pending.length === 0) {
    // Nada pendiente puede querer decir dos cosas: ya se registró, o todavía
    // no le toca (un anual antes de su mes, o un fijo que arranca después).
    if (!period) return { status: 'programado', oldest: null, daysLate: 0, pendingCount: 0 }
    return { status: 'registrado', oldest: null, daysLate: 0, pendingCount: 0 }
  }

  const oldest = pending[0]
  const late = todayISO > oldest.due
  return {
    status: late ? 'vencido' : 'pendiente',
    oldest,
    daysLate: late ? daysBetween(oldest.due, todayISO) : 0,
    pendingCount: pending.length,
  }
}

/** "N de M" (§4.4) para el encabezado de Fijos y el tile de la Home:
 *  cuántos fijos activos tienen algo que registrar en su período vigente, y
 *  cuántos de esos ya están al día. */
export function pendingCount(recurringList: Recurring[], allTx: Transaction[], todayISO: string): { registered: number; total: number } {
  const states = recurringList.filter(r => r.active).map(r => recurringStatus(r, allTx, todayISO))
  const inPeriod = states.filter(s => s.status !== 'programado')
  const registered = inPeriod.filter(s => s.status === 'registrado').length
  return { registered, total: inPeriod.length }
}

/** ¿Hace falta la alerta de Fijos en la Home? Es una alerta, no un resumen:
 *  solo si hay un fijo vencido, o uno pendiente que vence dentro de `days`
 *  días. Uno que recién vence en 20 días no es urgente y ya se ve completo en
 *  la pantalla de Fijos. Mismo criterio que `dueDebtUsd` (Sprint 2). */
export function fijosNeedAttention(recurringList: Recurring[], allTx: Transaction[], todayISO: string, days = 3): boolean {
  return recurringList.some(r => {
    if (!r.active) return false
    const s = recurringStatus(r, allTx, todayISO)
    if (s.status === 'vencido') return true
    return s.status === 'pendiente' && !!s.oldest && daysBetween(todayISO, s.oldest.due) <= days
  })
}

/** Lo que te deben, en USD, acumulado de todos los períodos de UN fijo
 *  compartido — el "te deben $17" de su fila (§4.3.3). Solo deudas
 *  pendientes cuyo gasto de origen fue generado por este fijo. */
export function openUsdForRecurring(recurring: Recurring, allTx: Transaction[], debts: Debt[]): number {
  const txIds = new Set(allTx.filter(t => t.recurring_id === recurring.id).map(t => t.id))
  if (txIds.size === 0) return 0
  return round2(
    debts
      .filter(d => d.status === 'pendiente' && d.origin_transaction_id != null && txIds.has(d.origin_transaction_id))
      .reduce((sum, d) => sum + d.amount_usd, 0)
  )
}

/** Orden de la lista: vencidos y pendientes primero, después por vencimiento. */
export function sortByStatus(
  items: { recurring: Recurring; state: RecurringState }[]
): { recurring: Recurring; state: RecurringState }[] {
  const rank: Record<RecurringStatus, number> = { vencido: 0, pendiente: 1, programado: 2, registrado: 3, pausado: 4 }
  return [...items].sort((a, b) => {
    const d = rank[a.state.status] - rank[b.state.status]
    if (d !== 0) return d
    const da = a.state.oldest?.due ?? ''
    const db = b.state.oldest?.due ?? ''
    return da < db ? -1 : da > db ? 1 : a.recurring.sort_order - b.recurring.sort_order
  })
}

/** Resuelve el reparto por defecto de una plantilla contra el monto REAL de
 *  este registro (§3.3 / §4.3) — nunca contra el monto de la plantilla.
 *
 *  **Vos sos participante** (igual que `sharedSplitEven`, Sprint 2): las
 *  partes fijas mandan tal cual; lo que sobra se reparte parejo entre los
 *  "parejos" **y vos**, con tu parte como el resto. Filtra montos ≤ 0. */
export function resolveSplitAmounts(
  templateSplits: Pick<RecurringSplit, 'person_id' | 'amount'>[],
  totalAmount: number,
  currency: Currency
): { person_id: string; amount: number }[] {
  const fixed = templateSplits.filter((s): s is { person_id: string; amount: number } => s.amount != null)
  const even = templateSplits.filter(s => s.amount == null)
  const fixedTotal = fixed.reduce((sum, s) => sum + s.amount, 0)
  // Lo que ya está comprometido en partes fijas sale antes de dividir; el
  // resto se reparte entre los parejos + vos (tu parte queda como el sobrante).
  const remaining = Math.max(totalAmount - fixedTotal, 0)
  const evenAmounts = even.length > 0 ? sharedSplitEven(remaining, even.length, currency).shares : []

  return [
    ...fixed.map(s => ({ person_id: s.person_id, amount: s.amount })),
    ...even.map((s, i) => ({ person_id: s.person_id, amount: evenAmounts[i] ?? 0 })),
  ].filter(s => s.amount > 0)
}

// Ahorro — sprint-6-ahorro.md. Sin imports de next/* ni del alias @/ — ver la
// nota de independencia en sprint-1-movimientos.md §5.1.
//
// El saldo de un ahorro y lo que cada cuenta tiene apartado se DERIVAN de los
// movimientos etiquetados (§4.1 / §4.2) — nunca una columna que se pueda
// desincronizar, mismo principio que el saldo de una cuenta y el disponible de
// Presupuesto.
//
// El "mes por organizar" es el mes pasado y solo ese (§0): sin tabla de estado,
// siempre avanza. Qué plan ya fondeó un mes sale de `savings_period` en sus
// aportes.

import { periodRange, periodStart, previousPeriod, toNative } from './budgets'
import { round2, roundFor } from './money'
import { toUsd, usdPerUnit } from './rates'
import type { Currency, RatesMap, SavingsAllocationType, SavingsGoal } from './types'

/* ─── El mes como fecha — re-export, no se duplica ─────────────────────── */

export { periodRange, periodStart, previousPeriod } from './budgets'

/* ─── Movimientos de ahorro ───────────────────────────────────────────── */

/** La forma mínima de un movimiento que estas funciones necesitan. */
export interface SavingsTx {
  account_id: string
  to_account_id: string | null
  type: string
  flow_type: string
  date: string
  amount: number
  amount_usd: number
  to_amount: number | null
  to_amount_usd: number | null
  recurring_id: string | null
  savings_goal_id: string | null
  savings_flow: string | null
  savings_period: string | null
}

/** Lo que ENTRÓ de una transferencia, en su denominación: el lado recibido si
 *  se congeló (cross-currency o comisión declarada), si no el que salió. */
const inUsd = (t: SavingsTx) => t.to_amount_usd ?? t.amount_usd
const inNative = (t: SavingsTx) => t.to_amount ?? t.amount

/* ─── Saldo de un ahorro (§4.1) ───────────────────────────────────────── */

/** `Map<goalId, saldoUsd>`. Aporte suma lo que entró; retiro resta lo que
 *  salió; un traslado NO cambia el saldo del ahorro (solo de billetera). */
export function savingsBalancesUsd(txs: SavingsTx[]): Map<string, number> {
  const out = new Map<string, number>()
  const add = (id: string, d: number) => out.set(id, round2((out.get(id) ?? 0) + d))
  for (const t of txs) {
    if (!t.savings_goal_id || !t.savings_flow) continue
    if (t.savings_flow === 'aporte') add(t.savings_goal_id, inUsd(t))
    else if (t.savings_flow === 'retiro') add(t.savings_goal_id, -t.amount_usd)
  }
  return out
}

/** Saldo de UN ahorro en USD (0 si no tiene movimientos). */
export function savingsBalanceUsd(txs: SavingsTx[], goalId: string): number {
  return savingsBalancesUsd(txs).get(goalId) ?? 0
}

/* ─── Lo apartado por cuenta (§4.2) ───────────────────────────────────── */

/** Cuánto del saldo de cada cuenta está apartado, en la MONEDA DE LA CUENTA
 *  (nunca en USD — pasar por USD y volver arrastra centavos, §4.2). Aporte y
 *  retiro mueven un solo lado; el traslado mueve los dos. Se clampea en 0. */
export function savingsByAccount(txs: SavingsTx[]): Map<string, number> {
  const raw = new Map<string, number>()
  const add = (id: string | null, d: number) => {
    if (!id) return
    raw.set(id, (raw.get(id) ?? 0) + d)
  }
  for (const t of txs) {
    if (!t.savings_goal_id || !t.savings_flow) continue
    if (t.savings_flow === 'aporte') add(t.to_account_id, inNative(t))
    else if (t.savings_flow === 'retiro') add(t.account_id, -t.amount)
    else if (t.savings_flow === 'traslado') {
      add(t.account_id, -t.amount)
      add(t.to_account_id, inNative(t))
    }
  }
  const out = new Map<string, number>()
  for (const [id, v] of raw) out.set(id, Math.max(0, v))
  return out
}

/** Lo mismo en USD, para comparar cuentas entre sí (patrimonio, un total). */
export function savingsByAccountUsd(txs: SavingsTx[]): Map<string, number> {
  const raw = new Map<string, number>()
  const add = (id: string | null, d: number) => {
    if (!id) return
    raw.set(id, (raw.get(id) ?? 0) + d)
  }
  for (const t of txs) {
    if (!t.savings_goal_id || !t.savings_flow) continue
    if (t.savings_flow === 'aporte') add(t.to_account_id, inUsd(t))
    else if (t.savings_flow === 'retiro') add(t.account_id, -t.amount_usd)
    else if (t.savings_flow === 'traslado') {
      add(t.account_id, -t.amount_usd)
      add(t.to_account_id, inUsd(t))
    }
  }
  const out = new Map<string, number>()
  for (const [id, v] of raw) out.set(id, Math.max(0, round2(v)))
  return out
}

/** `Map<goalId, Map<accountId, nativo>>` — cuánto tiene CADA ahorro apartado en
 *  CADA cuenta, en la moneda de la cuenta. El tope del traslado (§4.11) sale de
 *  acá: del auto en Efectivo se mueve lo del auto, no lo de emergencias. */
export function goalBalancesByAccount(txs: SavingsTx[]): Map<string, Map<string, number>> {
  const raw = new Map<string, Map<string, number>>()
  const add = (goal: string, acct: string | null, d: number) => {
    if (!acct) return
    const m = raw.get(goal) ?? new Map<string, number>()
    m.set(acct, (m.get(acct) ?? 0) + d)
    raw.set(goal, m)
  }
  for (const t of txs) {
    if (!t.savings_goal_id || !t.savings_flow) continue
    const g = t.savings_goal_id
    if (t.savings_flow === 'aporte') add(g, t.to_account_id, inNative(t))
    else if (t.savings_flow === 'retiro') add(g, t.account_id, -t.amount)
    else if (t.savings_flow === 'traslado') {
      add(g, t.account_id, -t.amount)
      add(g, t.to_account_id, inNative(t))
    }
  }
  const out = new Map<string, Map<string, number>>()
  for (const [goal, m] of raw) {
    const clamped = new Map<string, number>()
    for (const [acct, v] of m) if (v > 1e-9) clamped.set(acct, v)
    out.set(goal, clamped)
  }
  return out
}

/* ─── Plata libre por cuenta (§4.5, §4.6) ─────────────────────────────── */

export interface AccountBalanceLike {
  id: string
  currency: Currency
  balance: number
}

/** Saldo − apartado, clampeado en 0, en la moneda de cada cuenta. Es de dónde
 *  se puede sacar plata para ahorrar (§4.5) y el tope de un gasto común (§4.6).
 *  No incluye cuentas archivadas. */
export function freeByAccount(accounts: AccountBalanceLike[], txs: SavingsTx[]): Map<string, number> {
  const saved = savingsByAccount(txs)
  const out = new Map<string, number>()
  for (const a of accounts) {
    out.set(a.id, Math.max(0, roundFor(a.balance - (saved.get(a.id) ?? 0), a.currency)))
  }
  return out
}

/* ─── Meta cumplida (§4.8) ────────────────────────────────────────────── */

export function targetAmountUsd(goal: Pick<SavingsGoal, 'target_amount' | 'input_currency'>, rates: RatesMap): number | null {
  if (goal.target_amount == null) return null
  return round2(toUsd(goal.target_amount, goal.input_currency, rates))
}

export function goalReached(balanceUsd: number, targetUsd: number | null): boolean {
  return targetUsd != null && balanceUsd >= targetUsd
}

/* ─── Mes por organizar (§0, §4.5) ────────────────────────────────────── */

/** El mes pasado, y solo ese. Sin tabla de estado: siempre avanza. */
export function pendingSavingsPeriod(todayISO: string): string {
  return previousPeriod(periodStart(todayISO))
}

/** Un plan solo organiza meses que vivió (§4.5). Uno creado en agosto no
 *  ofrece julio. */
export function canSaveForPeriod(goal: Pick<SavingsGoal, 'created_on'>, period: string): boolean {
  return periodStart(goal.created_on) <= period
}

/** De qué meses ya hay un aporte para ese plan (el botón "Ahorrar" se apaga). */
export function savedPeriodsOf(txs: SavingsTx[], goalId: string): Set<string> {
  const out = new Set<string>()
  for (const t of txs) {
    if (t.savings_goal_id === goalId && t.savings_flow === 'aporte' && t.savings_period) {
      out.add(t.savings_period)
    }
  }
  return out
}

/* ─── El sobrante del mes (§4.3) ──────────────────────────────────────── */

/** `ingresoUsd − gastoUsd − Σ aportes de FIJOS de ese mes`. Los aportes de un
 *  fijo (`recurring_id` no nulo) ya guardaron plata ese mes — el reparto no
 *  debe volver a proponerla. Se usa el monto que LLEGÓ. Las transferencias del
 *  propio reparto (fecha de hoy, mes siguiente) y los traslados quedan afuera
 *  por el filtro de tipo/dirección. */
export function surplusUsd(txs: SavingsTx[], period: string, _rates?: RatesMap): number {
  const { from, to } = periodRange(period)
  let ingreso = 0
  let gasto = 0
  let fijoAportes = 0
  for (const t of txs) {
    if (t.savings_flow === 'aporte' && t.recurring_id && t.savings_period === period) {
      fijoAportes += inUsd(t)
      continue
    }
    if (t.flow_type !== 'consumo' || t.date < from || t.date > to) continue
    if (t.type === 'ingreso') ingreso += t.amount_usd
    else if (t.type === 'gasto') gasto += t.amount_usd
  }
  return round2(ingreso - gasto - fijoAportes)
}

/* ─── Propuesta de reparto (§4.4) ─────────────────────────────────────── */

export interface SavingsGoalWithBalance extends SavingsGoal {
  balance_usd: number
  goal_reached: boolean
}

export interface SavingsAllocationLine {
  goal_id: string
  name: string
  currency: Currency
  /** Monto propuesto en la moneda del ahorro. */
  amount: number
  amount_usd: number
  /** true cuando la UI tiene que dejar ajustarlo (fijos sin fondos, §4.4). */
  capped: boolean
}

export interface AllocationResult {
  proposal: SavingsAllocationLine[]
  /** Lo que ningún plan absorbió (sin cajón de sastre). */
  unassignedUsd: number
  insufficientForFixed: boolean
}

function faltaParaMetaUsd(g: SavingsGoalWithBalance, rates: RatesMap): number {
  const t = targetAmountUsd(g, rates)
  if (t == null) return Infinity
  return Math.max(0, round2(t - g.balance_usd))
}

function line(g: SavingsGoalWithBalance, usd: number, rates: RatesMap, nativoExacto?: number): SavingsAllocationLine {
  return {
    goal_id: g.id,
    name: g.name,
    currency: g.input_currency,
    amount: nativoExacto ?? toNative(usd, usdPerUnit(g.input_currency, rates), g.input_currency),
    amount_usd: usd,
    capped: false,
  }
}

/** Fijos primero (topeados por lo que les falta para su meta), porcentuales
 *  sobre lo que queda, y el cajón de sastre se lleva todo el resto ignorando su
 *  propia meta (§0.4). Si los fijos piden más que el sobrante NO se prorratea:
 *  se marca `insufficientForFixed` y la UI deja ajustar a mano (§4.4). */
export function proposeAllocation(goals: SavingsGoalWithBalance[], surplus: number, rates: RatesMap): AllocationResult {
  if (surplus <= 0) return { proposal: [], unassignedUsd: 0, insufficientForFixed: false }

  const vivos = goals.filter(g => !g.archived)
  const catchall = vivos.find(g => g.is_catchall) ?? null
  const enJuego = vivos.filter(g => !g.goal_reached && g.id !== catchall?.id)
  const fixed = enJuego.filter(g => g.allocation_type === 'fixed')
  const pct = enJuego.filter(g => g.allocation_type === 'percent')

  const fixedUsd = fixed.map(g => {
    const pedidoUsd = round2(toUsd(g.allocation_value, g.input_currency, rates))
    const techoUsd = faltaParaMetaUsd(g, rates)
    const usd = round2(Math.min(pedidoUsd, techoUsd))
    return { goal: g, usd, topeado: usd < pedidoUsd }
  })
  const sumFixedUsd = round2(fixedUsd.reduce((s, f) => s + f.usd, 0))

  if (sumFixedUsd > surplus) {
    const zero = (g: SavingsGoalWithBalance): SavingsAllocationLine => ({
      goal_id: g.id, name: g.name, currency: g.input_currency, amount: 0, amount_usd: 0, capped: true,
    })
    return {
      proposal: [
        ...fixedUsd.map(({ goal, usd, topeado }) => ({
          ...line(goal, usd, rates, topeado ? undefined : goal.allocation_value),
          capped: true,
        })),
        ...pct.map(zero),
        ...(catchall ? [zero(catchall)] : []),
      ],
      unassignedUsd: 0,
      insufficientForFixed: true,
    }
  }

  const restUsd = round2(surplus - sumFixedUsd)
  const fixedLines = fixedUsd.map(({ goal, usd, topeado }) => line(goal, usd, rates, topeado ? undefined : goal.allocation_value))

  let asignadoDelResto = 0
  const pctLines = pct.map(g => {
    const cuotaUsd = round2(restUsd * (g.allocation_value / 100))
    const usd = round2(Math.min(cuotaUsd, faltaParaMetaUsd(g, rates)))
    asignadoDelResto = round2(asignadoDelResto + usd)
    return line(g, usd, rates)
  })

  const sobranteUsd = Math.max(0, round2(restUsd - asignadoDelResto))
  if (catchall && sobranteUsd > 0) {
    return { proposal: [...fixedLines, ...pctLines, line(catchall, sobranteUsd, rates)], unassignedUsd: 0, insufficientForFixed: false }
  }
  return { proposal: [...fixedLines, ...pctLines], unassignedUsd: sobranteUsd, insufficientForFixed: false }
}

/* ─── Vista ya resuelta (lo que consume la UI) ────────────────────────── */

export interface SavingsGoalView {
  goal_id: string
  name: string
  currency: Currency
  balance_native: number
  balance_usd: number
  target_native: number | null
  target_usd: number | null
  goal_reached: boolean
  is_catchall: boolean
  archived: boolean
  allocation_type: SavingsAllocationType
  allocation_value: number
  /** Progreso 0–100 hacia la meta (0 si no tiene). */
  progress_pct: number
  /** El aporte que le toca este ciclo, ya resuelto — `null` si no hay nada que
   *  organizar para este plan (ya fondeó, no vivió el mes, mes en rojo). */
  pending_amount_native: number | null
  pending_amount_usd: number | null
  pending_capped: boolean
  /** Dónde está guardada la plata de este ahorro (cuenta → nativo). */
  by_account: { account_id: string; amount: number }[]
}

export interface SavingsOverview {
  goals: SavingsGoalView[]
  /** El mes que se está organizando (siempre el pasado). */
  period: string
  surplus_usd: number
  /** true si hay al menos un plan con "Ahorrar" pendiente para `period`. */
  has_pending: boolean
  unassigned_usd: number
  insufficient_for_fixed: boolean
  total_saved_usd: number
}

/* ─── Validación ─────────────────────────────────────────────────────── */

export function validateGoal(input: {
  name: unknown
  allocation_type: unknown
  allocation_value: unknown
  target_amount?: unknown
  is_catchall?: boolean
}): string | null {
  if (typeof input.name !== 'string' || !input.name.trim()) return 'El ahorro necesita un nombre.'
  // El cajón de sastre no reparte con una regla — sus campos son datos muertos
  // (§0.6). Igual pedimos un tipo/valor placeholder válido para el CHECK.
  if (input.allocation_type !== 'fixed' && input.allocation_type !== 'percent') {
    return 'Elegí si el reparto es un monto fijo o un porcentaje.'
  }
  const v = typeof input.allocation_value === 'number' ? input.allocation_value : NaN
  if (!(v > 0)) return input.allocation_type === 'percent' ? 'El porcentaje tiene que ser mayor a cero.' : 'El monto tiene que ser mayor a cero.'
  if (input.allocation_type === 'percent' && v > 100) return 'El porcentaje no puede pasar de 100.'
  if (input.target_amount != null) {
    const t = typeof input.target_amount === 'number' ? input.target_amount : NaN
    if (!(t > 0)) return 'La meta tiene que ser mayor a cero.'
  }
  return null
}

export const SAVINGS_REASON_LABEL: Record<string, string> = {
  emergencia: 'Emergencia real',
  meta_cumplida: 'Se cumplió la meta',
  cambio_planes: 'Cambio de planes',
  otro: 'Otro',
}

export const ALLOCATION_TYPE_LABEL: Record<SavingsAllocationType, string> = {
  fixed: 'Monto fijo',
  percent: 'Porcentaje del sobrante',
}

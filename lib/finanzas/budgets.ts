// Presupuesto mensual — sprint-5-presupuesto.md. Sin imports de next/* ni
// del alias @/ — ver la nota de independencia en sprint-1-movimientos.md §5.1.
//
// El rollover NO es una configuración fija (no hay `rollover_mode`): es una
// decisión que se toma una vez por mes, por línea, al cerrarlo
// (`fin_budget_closures`). Por eso `carriedInto` mira un solo período hacia
// atrás, no una cadena — el `amount_usd` congelado en el cierre anterior YA
// incluye lo que ese mes recibió a su vez (§4.4).
//
// Cada monto se lleva en DOS denominaciones: la nativa (la moneda de la
// línea, lo que el usuario escribió y ve) y la de USD (lo único en lo que se
// puede sumar y comparar entre líneas de distinta moneda). Nunca se convierte
// una en la otra salvo cuando no hay alternativa (un gasto en otra moneda).

import { round2, roundFor } from './money'
import type { Currency } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** Redondeo en la moneda de la LÍNEA (BTC usa 8 decimales; `round2` lo
 *  dejaba en cero). Los `*_usd` sí van con `round2` — el dólar tiene 2. */
function roundNative(n: number, currency: string): number {
  return roundFor(n, currency as Currency)
}

/* ─── El mes como fecha ('YYYY-MM-01') ─────────────────────────────────── */

export function periodStart(refISO: string): string {
  return `${refISO.slice(0, 7)}-01`
}

export function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  return { from: period, to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` }
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + 1
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) - 1
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

/** '2026-08' → 'Agosto de 2026', con inicial mayúscula. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ─── Monto vigente (herencia del mes anterior) ────────────────────────── */

export interface BudgetPeriodRow {
  id: string
  line_id: string
  period: string
  amount: number
  amount_usd: number
}

export interface BudgetExtensionRow {
  period_id: string
  amount: number
  amount_usd: number
}

/** El monto de una línea para un período: el propio si existe, si no el del
 *  período anterior más reciente que sí tenga fila. `periodRowId` es `null`
 *  cuando se heredó (importa para saber si hay que materializarlo antes de
 *  ampliar). Todo `null` = la línea todavía no tiene ningún monto. */
export function resolvePeriodAmount(
  periods: BudgetPeriodRow[],
  lineId: string,
  period: string
): { periodRowId: string | null; amount: number | null; amountUsd: number | null } {
  const own = periods.find(p => p.line_id === lineId && p.period === period)
  if (own) return { periodRowId: own.id, amount: own.amount, amountUsd: own.amount_usd }

  const prior = periods
    .filter(p => p.line_id === lineId && p.period < period)
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0]

  return { periodRowId: null, amount: prior?.amount ?? null, amountUsd: prior?.amount_usd ?? null }
}

/** Monto original + la suma de sus ampliaciones (§3.4), en las dos
 *  denominaciones. `null` si la línea no tiene monto para el período. */
export function effectiveAmount(
  periods: BudgetPeriodRow[],
  extensions: BudgetExtensionRow[],
  lineId: string,
  period: string,
  lineCurrency: string
): { amount: number; amountUsd: number } | null {
  const r = resolvePeriodAmount(periods, lineId, period)
  if (r.amount == null || r.amountUsd == null) return null
  const own = r.periodRowId ? extensions.filter(e => e.period_id === r.periodRowId) : []
  return {
    amount: roundNative(r.amount + own.reduce((s, e) => s + e.amount, 0), lineCurrency),
    amountUsd: round2(r.amountUsd + own.reduce((s, e) => s + e.amount_usd, 0)),
  }
}

/* ─── Retroactividad de la línea recién creada ────────────────────────── */

export interface BudgetLineLike {
  id: string
  created_on: string
  retroactive: boolean
}

/** Desde qué fecha cuenta el gasto de un período: el día 1, salvo que sea el
 *  período de creación y se haya elegido "arrancar desde hoy" (§4.1) — esa
 *  elección es fija para siempre. */
export function effectiveFromFor(line: BudgetLineLike, period: string): string {
  const { from } = periodRange(period)
  const isCreationPeriod = periodStart(line.created_on) === period
  return isCreationPeriod && !line.retroactive ? line.created_on : from
}

/* ─── Gasto real por categoría ─────────────────────────────────────────── */

export interface BudgetTx {
  id: string
  category_id: string | null
  type: string
  flow_type: string
  amount: number
  currency: string
  amount_usd: number
  date: string
}
export interface BudgetDebtShare {
  origin_transaction_id: string | null
  status: string
  amount: number
  currency: string
  amount_usd: number
  principal_usd: number
}

/** Cuánto se gastó de verdad en un conjunto de categorías (§4.1): bruto −
 *  `principal_usd` de las deudas no condonadas de esos gastos. El nativo se
 *  suma de los montos que ya están en la moneda de la línea; solo lo que está
 *  en otra moneda se convierte con la tasa congelada de la línea. */
export function gastoRealForCategories(
  txs: BudgetTx[],
  debts: BudgetDebtShare[],
  categoryIds: string[],
  from: string,
  to: string,
  lineCurrency: string,
  lineRate: number
): { amount: number; amountUsd: number } {
  const own = new Set(categoryIds)
  const inRange = txs.filter(
    t => t.category_id != null && own.has(t.category_id) && t.type === 'gasto' && t.flow_type === 'consumo' && t.date >= from && t.date <= to
  )
  const txIds = new Set(inRange.map(t => t.id))
  const shares = debts.filter(d => d.status !== 'condonada' && d.origin_transaction_id != null && txIds.has(d.origin_transaction_id))

  const brutoUsd = inRange.reduce((s, t) => s + t.amount_usd, 0)
  const repartidoUsd = shares.reduce((s, d) => s + d.principal_usd, 0)

  const nativeOf = (usd: number, native: number, currency: string) =>
    currency === lineCurrency ? native : toNative(usd, lineRate, lineCurrency)

  const bruto = inRange.reduce((s, t) => s + nativeOf(t.amount_usd, t.amount, t.currency), 0)
  const repartido = shares.reduce((s, d) => {
    const proportion = d.amount_usd > 0 ? d.principal_usd / d.amount_usd : 1
    return s + nativeOf(d.principal_usd, d.amount * proportion, d.currency)
  }, 0)

  return { amount: roundNative(bruto - repartido, lineCurrency), amountUsd: round2(brutoUsd - repartidoUsd) }
}

/* ─── Comprometido: fijos pendientes de esas categorías ────────────────── */

export interface CommittedRecurring {
  category_id: string | null
  active: boolean
  amount: number
  currency: string
  amountUsd: number
  /** Estado de recurringStatus() — solo 'pendiente'/'vencido' comprometen. */
  status: string
}

export function committedForCategories(
  recurring: CommittedRecurring[],
  categoryIds: string[],
  lineCurrency: string,
  lineRate: number
): { amount: number; amountUsd: number } {
  const own = new Set(categoryIds)
  const scoped = recurring.filter(
    r => r.active && (r.status === 'pendiente' || r.status === 'vencido') && r.category_id != null && own.has(r.category_id)
  )
  return {
    amount: roundNative(
      scoped.reduce((s, r) => s + (r.currency === lineCurrency ? r.amount : toNative(r.amountUsd, lineRate, lineCurrency)), 0),
      lineCurrency
    ),
    amountUsd: round2(scoped.reduce((s, r) => s + r.amountUsd, 0)),
  }
}

/* ─── Carry: un solo salto hacia atrás ────────────────────────────────── */

export interface BudgetClosureRow {
  line_id: string
  period: string
  carried: boolean
  amount_usd: number
}

/** Lo que el cierre del mes anterior dejó para este período (§4.4). */
export function carriedInto(closures: BudgetClosureRow[], lineId: string, period: string): number {
  const prev = previousPeriod(period)
  const c = closures.find(x => x.line_id === lineId && x.period === prev)
  return c && c.carried ? c.amount_usd : 0
}

/* ─── Disponible ──────────────────────────────────────────────────────── */

export function availableUsd(params: {
  effectiveUsd: number | null
  gastoRealUsd: number
  committedUsd: number
  carriedUsd: number
}): number | null {
  if (params.effectiveUsd == null) return null
  return round2(params.effectiveUsd + params.carriedUsd - params.gastoRealUsd - params.committedUsd)
}

/** Un valor en USD expresado en la moneda de la línea con SU tasa congelada
 *  (`rate` = USD por 1 unidad nativa → dividir). Así el card entero queda a
 *  una sola tasa coherente. */
export function toNative(usd: number, rate: number, currency: string): number {
  if (!Number.isFinite(rate) || rate <= 0) return roundNative(usd, currency)
  return roundNative(usd / rate, currency)
}

/* ─── Barra de ritmo ──────────────────────────────────────────────────── */

export type BudgetViewMode = 'gastado' | 'disponible'

export function dayOfPeriod(period: string, todayISO: string): { day: number; days: number } {
  const [y, m] = period.split('-').map(Number)
  const days = daysInMonth(y, m)
  const { to } = periodRange(period)
  const isCurrent = todayISO >= period && todayISO <= to
  return { day: isCurrent ? Number(todayISO.slice(8, 10)) : days, days }
}

export interface BudgetBar {
  /** Relleno 0–100, siempre desde la izquierda. */
  fillPct: number
  /** El tramo reservado (fijos sin pagar), pegado a la derecha del relleno. */
  reservedPct: number
  /** La marca del día: fracción del mes transcurrida. Igual en los dos modos. */
  tickPct: number
  over: boolean
  danger: boolean
}

/** En "gastado" la barra se llena a medida que gastás; en "disponible"
 *  arranca llena y se vacía. El tick es el mismo en los dos: la fracción del
 *  mes que ya pasó (§4.8). */
export function budgetBar(params: {
  mode: BudgetViewMode
  spentUsd: number
  availableUsd: number
  capacityUsd: number
  committedUsd: number
  day: number
  days: number
}): BudgetBar {
  const { mode, spentUsd, availableUsd: availUsd, capacityUsd, committedUsd, day, days } = params
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  const pctOf = (n: number) => clamp(capacityUsd > 0 ? (n / capacityUsd) * 100 : 0)
  const tickPct = round2(clamp(days > 0 ? (day / days) * 100 : 0))
  const over = capacityUsd > 0 && spentUsd > capacityUsd
  const reserved = (fillPct: number) => round2(Math.min(pctOf(committedUsd), 100 - fillPct))

  if (mode === 'disponible') {
    const fillPct = round2(pctOf(availUsd))
    return { fillPct, reservedPct: reserved(fillPct), tickPct, over, danger: over || fillPct <= 15 }
  }
  const fillPct = round2(pctOf(spentUsd))
  return { fillPct, reservedPct: reserved(fillPct), tickPct, over, danger: over || fillPct >= 85 }
}

/* ─── Cierres pendientes ──────────────────────────────────────────────── */

/** Los períodos ya terminados de una línea sin fila en `fin_budget_closures`
 *  — la ausencia ES la pregunta pendiente (§4.5). Tope de 24 como Fijos. */
export function needsClosure(
  line: { id: string; created_on: string },
  closures: { line_id: string; period: string }[],
  todayISO: string,
  max = 24
): string[] {
  const out: string[] = []
  let p = periodStart(line.created_on)
  const current = periodStart(todayISO)
  while (p < current && out.length < max) {
    if (!closures.some(c => c.line_id === line.id && c.period === p)) out.push(p)
    p = nextPeriod(p)
  }
  return out
}

/* ─── Vistas ya resueltas (lo que consume la UI) ──────────────────────── */

/** Todo lo que una card de presupuesto necesita para el período vigente, ya
 *  calculado — la UI solo pinta. `null` en los montos = la línea todavía no
 *  tiene presupuesto cargado. */
export interface BudgetLineView {
  line_id: string
  title: string
  currency: Currency
  /** Tasa congelada de la línea (USD por 1 unidad nativa) — para mostrar. */
  rate: number
  category_ids: string[]
  effective_native: number | null
  effective_usd: number | null
  spent_native: number
  spent_usd: number
  committed_native: number
  committed_usd: number
  carried_usd: number
  available_native: number | null
  available_usd: number | null
  bar: BudgetBar
}

/** El tope general — agregado derivado, informativo, nunca bloquea, sin
 *  carry ni cierre (§4.7). */
export interface BudgetGeneralView {
  effective_usd: number
  spent_usd: number
  committed_usd: number
  available_usd: number
  bar: BudgetBar
}

export interface PendingClosure {
  line_id: string
  title: string
  period: string
  available_usd: number
}

/* ─── Validación ──────────────────────────────────────────────────────── */

export function isValidPeriod(period: unknown): period is string {
  return typeof period === 'string' && /^\d{4}-\d{2}-01$/.test(period)
}

export function budgetLineTitle(name: string | null, categoryNames: string[]): string {
  return name?.trim() || categoryNames.join(', ') || 'Sin categoría'
}

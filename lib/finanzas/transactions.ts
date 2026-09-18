// Validación, congelado de tasa y agrupado de movimientos. Sin imports de
// next/* — Documentos/finanzas/sprint-1-movimientos.md §5.1.

import { isValidDate } from './dates'
import { round2, roundFor } from './money'
import { toUsd } from './rates'
import type { Account, Currency, FlowType, RatesMap, Transaction, TransactionType } from './types'

/** Un gasto o una transferencia sacan plata de account_id; un ingreso, no.
 *  Usado para el tope de saldo (§4.5) — que en este sprint vive en el
 *  cliente, pero la fórmula es la misma en cualquier lado que se aplique. */
export function consumesBalance(type: TransactionType): boolean {
  return type === 'gasto' || type === 'transferencia'
}

/** El `flow_type` que le corresponde a un gasto/ingreso según la cuenta de
 *  origen (sprint-7-cuentas-inversion.md §4.1). Una transferencia siempre es
 *  'movimiento' (el trigger `fin_normalize_flow_type` igual lo fuerza); un
 *  gasto/ingreso desde una cuenta de inversión también — es el mercado
 *  moviéndose, no consumo real. El resto, 'consumo'. */
export function flowTypeFor(type: TransactionType, account: Pick<Account, 'is_investment'> | undefined): FlowType {
  if (type === 'transferencia') return 'movimiento'
  if (account?.is_investment) return 'movimiento'
  return 'consumo'
}

/** Igual que `flowTypeFor`, para una edición — pero **nunca** degrada a
 *  'consumo' un 'movimiento' que ya tenía significado. Un cobro de deuda o un
 *  ajuste de inversión son un `gasto`/`ingreso` con `flow_type: 'movimiento'`:
 *  editarles la cuenta o el tipo no debe volverlos consumo real (§4.2). En una
 *  **transferencia**, en cambio, el 'movimiento' es solo el trigger — al
 *  convertirla a gasto/ingreso el `flow_type` se recalcula de cero. Y el
 *  camino inverso siempre vale: mover un gasto común a una cuenta de inversión
 *  lo pasa a 'movimiento'. */
export function flowTypeOnEdit(
  tx: Pick<Transaction, 'type' | 'flow_type'>,
  nextType: TransactionType,
  account: Pick<Account, 'is_investment'> | undefined
): FlowType {
  if (tx.type !== 'transferencia' && tx.flow_type === 'movimiento') return 'movimiento'
  return flowTypeFor(nextType, account)
}

/** ¿Este movimiento es un ajuste de valor de una cuenta de inversión? (§4.7)
 *  Un gasto/ingreso con `flow_type: 'movimiento'` en una cuenta `is_investment`
 *  — la única forma de crear uno es el sheet "Actualizar valor", porque el
 *  quick-add ya no ofrece esas cuentas para gasto/ingreso (§4.6). Se usa para
 *  filtrarlos de las listas visibles y para congelar el toggle de la cuenta. */
export function isInvestmentAdjustment(
  tx: Pick<Transaction, 'type' | 'flow_type'>,
  account: Pick<Account, 'is_investment'> | undefined
): boolean {
  return Boolean(account?.is_investment) && (tx.type === 'gasto' || tx.type === 'ingreso') && tx.flow_type === 'movimiento'
}

/** El movimiento que registra "Actualizar valor" (§4.4): la diferencia entre el
 *  valor tipeado y el saldo de hoy. `null` cuando no cambió nada (el saldo ya
 *  coincide). Un mismo cálculo para el sheet (la diferencia en vivo + el botón
 *  deshabilitado) y para la mutación, así no se pueden desincronizar. */
export function valueUpdateDelta(
  currentBalance: number,
  typedValue: number,
  currency: Currency
): { type: 'ingreso' | 'gasto'; amount: number } | null {
  const delta = roundFor(typedValue - roundFor(currentBalance, currency), currency)
  if (delta === 0) return null
  return { type: delta > 0 ? 'ingreso' : 'gasto', amount: Math.abs(delta) }
}

/** exchange_rate y amount_usd, congelados al momento de escribir (§4.2). */
export function freeze(amount: number, currency: Currency, rates: RatesMap): { exchange_rate: number; amount_usd: number } {
  const exchange_rate = toUsd(1, currency, rates)
  const amount_usd = round2(amount * exchange_rate)
  return { exchange_rate, amount_usd }
}

/** Lo mismo que `freeze`, para el lado que LLEGA de una transferencia con
 *  `to_amount`. Devuelve las columnas con el prefijo `to_` listas para el
 *  insert. `null` cuando no hay `to_amount` (misma moneda sin comisión
 *  declarada). */
export function freezeReceived(
  toAmount: number | null,
  toCurrency: Currency,
  rates: RatesMap
): { to_exchange_rate: number | null; to_amount_usd: number | null } {
  if (toAmount == null) return { to_exchange_rate: null, to_amount_usd: null }
  const { exchange_rate, amount_usd } = freeze(toAmount, toCurrency, rates)
  return { to_exchange_rate: exchange_rate, to_amount_usd: amount_usd }
}

/** Lo que se perdió (comisión, > 0) o se ganó (< 0) en el camino de una
 *  transferencia, en USD — de los dos lados congelados, cada uno a la tasa de
 *  su día, así que no se mueve más. `null` si no aplica (no es transferencia,
 *  o es una fila vieja sin el lado recibido congelado). */
export function transferFeeUsd(tx: Pick<Transaction, 'type' | 'amount_usd' | 'to_amount_usd'>): number | null {
  if (tx.type !== 'transferencia' || tx.to_amount_usd == null) return null
  return round2(tx.amount_usd - tx.to_amount_usd)
}

/** Valida que el movimiento tenga la forma que exige el CHECK de la base
 *  (fin_tx_shape) — defensa en profundidad: da un mensaje legible antes de
 *  que la fila llegue a Postgres, pero el constraint sigue siendo la
 *  garantía real. */
export function validateShape(input: {
  type: TransactionType
  account_id: string
  to_account_id?: string | null
  category_id?: string | null
  amount?: number | null
  to_amount?: number | null
  /** Monedas de origen y destino, para validar la comisión declarada de una
   *  transferencia misma-moneda (lo recibido no puede superar lo enviado). */
  currency?: Currency
  to_currency?: Currency
  date?: string
}): string | null {
  if (input.date != null && !isValidDate(input.date)) return 'La fecha no es válida.'

  if (input.type === 'transferencia') {
    if (!input.to_account_id) return 'Una transferencia necesita una cuenta destino.'
    if (input.to_account_id === input.account_id) return 'La cuenta destino tiene que ser distinta de la de origen.'
    if (input.category_id) return 'Una transferencia no lleva categoría.'
    // Misma moneda: `to_amount` es opcional y sirve para anotar la comisión
    // que se comió el banco/plataforma (mandás 100, llegan 98). Que lleguen
    // más de lo que salió no significa nada — de la misma moneda no aparece
    // plata en el camino. Entre monedas distintas cualquier `to_amount > 0`
    // es válido (es el tipo de cambio efectivo real de esa operación).
    if (
      input.to_amount != null &&
      input.currency != null &&
      input.to_currency != null &&
      input.currency === input.to_currency &&
      input.amount != null &&
      input.to_amount > input.amount
    ) {
      return 'En la misma moneda no puede llegar más de lo que salió.'
    }
    return null
  }
  // gasto o ingreso
  if (input.to_account_id) return `Un ${input.type} no lleva cuenta destino.`
  if (input.to_amount != null) return `Un ${input.type} no lleva "monto recibido".`
  return null
}

/** Cuánto queda disponible en la cuenta de origen, para el tope del cliente
 *  (§4.5). En modo edición, revierte el efecto que el propio movimiento ya
 *  tiene aplicado — si no, subir el monto de un gasto existente sería
 *  imposible una vez que "consumió" su propio tope.
 *
 *  La reversión depende del tipo ORIGINAL, sin importar a qué tipo se esté
 *  editando ahora: un ingreso sumó, así que hay que restarlo antes de
 *  aplicar el nuevo tope; un gasto/transferencia restó, así que hay que
 *  sumarlo. Antes solo se cubría el segundo caso — un ingreso devolvía
 *  `balance` sin tocar, correcto mientras el tipo se mantuviera en
 *  'ingreso', pero al editarlo a 'gasto'/'transferencia' el tope no
 *  restaba lo que ese ingreso ya había sumado, dejando pasar un guardado
 *  que de verdad dejaría la cuenta en negativo. Bug real, revisión del
 *  Sprint 4. */
export function availableFrom(balance: number, editing?: { type: TransactionType; account_id: string; amount: number }, accountId?: string): number {
  if (!editing || editing.account_id !== accountId) return balance
  return consumesBalance(editing.type) ? balance + editing.amount : balance - editing.amount
}

/** Total de gasto/ingreso del mes, en USD. Solo 'gasto'/'ingreso' con
 *  `flow_type = 'consumo'` cuentan como reales (§4.4 del sprint 1, §4.5 del
 *  sprint 2) — las transferencias no consumen, y un cobro de deuda
 *  (`flow_type = 'movimiento'`) es plata que vuelve, no plata nueva. */
export function monthTotals(transactions: Transaction[]): { gasto_usd: number; ingreso_usd: number } {
  let gasto_usd = 0
  let ingreso_usd = 0
  for (const tx of transactions) {
    if (tx.flow_type !== 'consumo') continue
    if (tx.type === 'gasto') gasto_usd += tx.amount_usd
    else if (tx.type === 'ingreso') ingreso_usd += tx.amount_usd
  }
  return { gasto_usd: round2(gasto_usd), ingreso_usd: round2(ingreso_usd) }
}

export interface CategorySpend {
  category_id: string | null
  usd: number
}

export interface CategoryGroup extends CategorySpend {
  transactions: Transaction[]
}

/** Agrupa el gasto real por categoría — mismo filtro que monthTotals() (solo
 *  'gasto' con flow_type='consumo'): un cobro de deuda o una transferencia
 *  no es gasto real y no debe aparecer en el desglose. Ordenado de mayor a
 *  menor gasto; los movimientos de cada grupo, del más reciente al más
 *  antiguo. `category_id: null` agrupa lo que quedó sin categoría — para el
 *  reporte mensual (cada gasto con su categoría y su descripción) y para
 *  cualquier desglose que solo necesite los totales (`categoryBreakdown`). */
export function groupByCategory(transactions: Transaction[]): CategoryGroup[] {
  const byCategory = new Map<string | null, Transaction[]>()
  for (const tx of transactions) {
    if (tx.flow_type !== 'consumo' || tx.type !== 'gasto') continue
    const list = byCategory.get(tx.category_id) ?? []
    list.push(tx)
    byCategory.set(tx.category_id, list)
  }
  return Array.from(byCategory.entries())
    .map(([category_id, txs]) => ({
      category_id,
      usd: round2(txs.reduce((sum, t) => sum + t.amount_usd, 0)),
      transactions: [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }))
    .sort((a, b) => b.usd - a.usd)
}

/** La suma de cada categoría, en USD — la suma de todo esto siempre
 *  coincide con el gasto_usd que devuelve monthTotals() para el mismo
 *  arreglo de transacciones. */
export function categoryBreakdown(transactions: Transaction[]): CategorySpend[] {
  return groupByCategory(transactions).map(({ category_id, usd }) => ({ category_id, usd }))
}

export interface DayGroup {
  date: string
  transactions: Transaction[]
  net_usd: number
}

/** Agrupa por día (más reciente primero) con el neto del día en USD —
 *  gasto resta, ingreso suma, transferencia no participa del neto. Igual
 *  que monthTotals(), solo cuenta `flow_type = 'consumo'`: un cobro de
 *  deuda no debería inflar el neto del día como si fuera ingreso real. */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const byDate = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const list = byDate.get(tx.date) ?? []
    list.push(tx)
    byDate.set(tx.date, list)
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, txs]) => ({
      date,
      transactions: txs,
      net_usd: round2(
        txs.reduce((sum, t) => sum + (t.flow_type !== 'consumo' ? 0 : t.type === 'ingreso' ? t.amount_usd : t.type === 'gasto' ? -t.amount_usd : 0), 0)
      ),
    }))
}

/** Redondea `amount` a la precisión de la moneda antes de guardar. */
export function normalizeAmount(amount: number, currency: Currency): number {
  return roundFor(amount, currency)
}

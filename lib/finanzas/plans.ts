// Planes de pago — sprint-4-planes-de-pago.md. Sin imports de next/* — ver
// la nota de independencia en sprint-1-movimientos.md §5.1.

import { round2 } from './money'
import { dueDateISO } from './recurring'
import { splitEven } from './debts'
import type { Currency, Debt } from './types'

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = month - 1 + delta
  const y = year + Math.floor(total / 12)
  const m = ((total % 12) + 12) % 12
  return { year: y, month: m + 1 }
}

/** Reparto parejo con fechas mensuales, día topeado igual que un fijo
 *  mensual (reutiliza `dueDateISO` del Sprint 3) — la sugerencia que se
 *  ofrece al crear o regenerar un plan, siempre editable antes de
 *  confirmar (§4.1/§0: un solo flujo, sin un "modo manual" aparte). */
export function generateInstallments(total: number, count: number, startDate: string, currency: Currency): { amount: number; date: string }[] {
  const [y, m, d] = startDate.split('-').map(Number)
  const amounts = splitEven(total, count, currency)
  return amounts.map((amount, i) => {
    const { year, month } = addMonths(y, m, i)
    return { amount, date: dueDateISO({ day_of_month: d }, year, month) }
  })
}

/** Interés simple, una sola vez, sobre `base` (capital o restante) — nunca
 *  compuesto (§4.2). `interestRate` en porcentaje (ej. 5 = 5%). */
export function applyInterest(base: number, interestRate: number | null | undefined): number {
  if (!interestRate) return base
  return base * (1 + interestRate / 100)
}

export interface PlanProgress {
  total: number
  resolved: number
  pendingUsd: number
}

/** Todo derivado de las cuotas (`Debt` con este `plan_id`) — el plan en sí
 *  no guarda ningún contador (§0/§4.6). */
export function planProgress(planId: string, debts: Debt[]): PlanProgress {
  const installments = debts.filter(d => d.plan_id === planId)
  const resolved = installments.filter(d => d.status !== 'pendiente').length
  const pendingUsd = round2(installments.filter(d => d.status === 'pendiente').reduce((sum, d) => sum + d.amount_usd, 0))
  return { total: installments.length, resolved, pendingUsd }
}

/** Cuánto queda pendiente de este plan, en su moneda nativa — la base para
 *  regenerar (§4.5): nunca el capital original, siempre lo que de verdad
 *  falta cobrar hoy. */
export function pendingPrincipal(planId: string, debts: Debt[]): number {
  return debts.filter(d => d.plan_id === planId && d.status === 'pendiente').reduce((sum, d) => sum + d.amount, 0)
}

/** El próximo número de cuota libre de este plan — nunca se reutiliza uno
 *  ya usado, ni siquiera de una cuota vieja borrada al regenerar (§4.5). */
export function nextInstallmentNumber(planId: string, debts: Debt[]): number {
  const nums = debts.filter(d => d.plan_id === planId).map(d => d.installment_number ?? 0)
  return (nums.length > 0 ? Math.max(...nums) : 0) + 1
}

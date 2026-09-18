'use client'

import { useState } from 'react'
import { IconCircleCheck, IconTrash } from '@tabler/icons-react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { todayISO } from '@/lib/finanzas/dates'
import { generateInstallments, pendingPrincipal, planProgress } from '@/lib/finanzas/plans'
import type { DebtPlan } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { InstallmentEditor, type InstallmentRow } from './plan-sheet'
import { useFinanzas } from './data-context'

/** Ver, regenerar o borrar un plan de pagos (sprint-4-planes-de-pago.md
 *  §4.4/§4.5/§4.6). Cada cuota es una `Debt` como cualquier otra — cobrar o
 *  condonar reusa `settleDebts`/`waiveDebt` sin cambios (por eso no hay un
 *  "cobrar" acá: se hace desde la fila normal de deudas de <DeudasPage>). */
export function PlanDetailSheet({ open, onClose, plan }: { open: boolean; onClose: () => void; plan: DebtPlan | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={plan ? `Plan · ${plan.concept}` : 'Plan'}>
      {open && plan && <PlanDetail plan={plan} onClose={onClose} />}
    </Sheet>
  )
}

function PlanDetail({ plan, onClose }: { plan: DebtPlan; onClose: () => void }) {
  const { debts, people, rates, activeProfile, hidden, waiveDebt, deleteDebt, deleteDebtPlan, regenerateDebtPlan } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const [regenOpen, setRegenOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [startDate, setStartDate] = useState(todayISO())
  const [rows, setRows] = useState<InstallmentRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const person = people.find(p => p.id === plan.person_id)
  const installments = debts.filter(d => d.plan_id === plan.id).sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
  const progress = planProgress(plan.id, debts)
  const remaining = pendingPrincipal(plan.id, debts)
  // Tiene que ser el espejo EXACTO del guard real de deleteDebtPlan() en
  // data-context.tsx (bloquea solo si alguna cuota no está pendiente) — no
  // "al menos una cuota, y todas pendientes". La diferencia importa en el
  // caso límite de un plan sin ninguna cuota (todas borradas una por una
  // con el tacho de esta misma pantalla): la versión vieja decía
  // `canDelete = false` ahí (por el `length > 0`), escondiendo "Borrar
  // plan" para un plan que el propio deleteDebtPlan() sí borraría sin
  // problema — dejaba el plan huérfano sin ninguna forma de sacarlo desde
  // la UI. Bug real, revisión del Sprint 4 (segunda pasada).
  const canDelete = !installments.some(d => d.status !== 'pendiente')
  const completed = installments.length > 0 && progress.resolved === progress.total

  function openRegen() {
    setError(null)
    setCount(1)
    setStartDate(todayISO())
    setRows(generateInstallments(remaining, 1, todayISO(), plan.currency).map(i => ({ date: i.date, amountRaw: String(i.amount) })))
    setRegenOpen(true)
  }

  function regenerateRows(nextCount: number, nextStartDate: string) {
    setRows(generateInstallments(remaining, nextCount, nextStartDate, plan.currency).map(i => ({ date: i.date, amountRaw: String(i.amount) })))
  }

  async function handleRowAction(action: () => Promise<{ error?: string }>) {
    setError(null)
    const result = await action()
    if (result.error) setError(result.error)
  }

  async function handleDeletePlan() {
    setError(null)
    const result = await deleteDebtPlan(plan.id)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleRegenerate() {
    setError(null)
    if (rows.length === 0) return setError('Elegí al menos una cuota.')
    const installmentsInput = rows.map(r => ({ amount: parseDecimalInput(r.amountRaw) ?? 0, date: r.date }))
    if (installmentsInput.some(i => i.amount <= 0)) return setError('Cada cuota necesita un monto mayor a 0.')
    if (installmentsInput.some(i => !i.date)) return setError('Cada cuota necesita una fecha.')

    setSubmitting(true)
    const result = await regenerateDebtPlan({ plan_id: plan.id, installments: installmentsInput })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    setRegenOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--fz-ink-2)' }}>
        <span>{person?.name ?? '—'}</span>
        <span>
          {progress.resolved}/{progress.total} cuotas
        </span>
      </div>
      <div className="fz-tabular" style={{ fontSize: 22, fontWeight: 700 }}>
        {maskAmount(formatMoney(fromUsd(progress.pendingUsd, displayCurrency, rates), displayCurrency), hidden)}{' '}
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fz-ink-3)' }}>pendiente</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {installments.map(d => (
          <div
            key={d.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              padding: '6px 0',
              borderTop: '1px solid var(--fz-hairline)',
            }}
          >
            <span style={{ width: 20, fontSize: 12, color: 'var(--fz-ink-3)', fontWeight: 700 }}>{d.installment_number}</span>
            <span style={{ flex: 1, minWidth: 0 }} className="fz-truncate">
              {d.incurred_on}
            </span>
            <span className="fz-tabular" style={{ fontWeight: 600 }}>
              {maskAmount(formatMoney(d.amount, d.currency), hidden)}
            </span>
            {d.status === 'pendiente' ? (
              <>
                <button
                  type="button"
                  className="fz-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => handleRowAction(() => waiveDebt(d.id))}
                  aria-label="Condonar"
                  title="Condonar"
                >
                  <IconCircleCheck size={14} />
                </button>
                <button
                  type="button"
                  className="fz-icon-btn"
                  style={{ width: 28, height: 28, color: 'var(--fz-out-text)' }}
                  onClick={() => handleRowAction(() => deleteDebt(d.id))}
                  aria-label="Borrar"
                  title="Borrar"
                >
                  <IconTrash size={14} />
                </button>
              </>
            ) : (
              <span style={{ color: 'var(--fz-ink-3)' }}>{d.status === 'cobrada' ? 'Cobrada' : 'Condonada'}</span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {completed && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fz-ink-2)' }}>Plan completado.</p>}

      {!completed && !regenOpen && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="soft" onClick={openRegen} disabled={remaining <= 0}>
            Regenerar cuotas pendientes
          </Btn>
          {canDelete && (
            <Btn variant="danger" onClick={handleDeletePlan}>
              Borrar plan
            </Btn>
          )}
        </div>
      )}

      {regenOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s3)' }}>
          <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
            <div style={{ flex: 1 }}>
              <label className="fz-field-label" htmlFor="fz-plan-regen-count">
                Cuotas nuevas
              </label>
              <input
                id="fz-plan-regen-count"
                className="fz-input"
                type="number"
                min={1}
                value={count}
                onChange={e => {
                  const n = Math.max(1, Math.trunc(Number(e.target.value)) || 1)
                  setCount(n)
                  regenerateRows(n, startDate)
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="fz-field-label" htmlFor="fz-plan-regen-start">
                Primera cuota nueva
              </label>
              <input
                id="fz-plan-regen-start"
                type="date"
                className="fz-input"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value)
                  regenerateRows(count, e.target.value)
                }}
              />
            </div>
          </div>
          <InstallmentEditor rows={rows} currency={plan.currency} onChange={setRows} />
          <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
            Reemplaza solo las {installments.filter(d => d.status === 'pendiente').length} cuotas pendientes (
            {formatMoney(remaining, plan.currency)}); las cobradas o condonadas quedan igual.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setRegenOpen(false)}>
              Cancelar
            </Btn>
            <Btn variant="primary" block onClick={handleRegenerate} disabled={submitting}>
              {submitting ? 'Guardando…' : 'Confirmar'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

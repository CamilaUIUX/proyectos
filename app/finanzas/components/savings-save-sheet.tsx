'use client'

import { useMemo, useState } from 'react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { periodLabel } from '@/lib/finanzas/budgets'
import { freeByAccount } from '@/lib/finanzas/savings'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** "Ahorrar": fondear UN plan para el mes pasado (sprint-6-ahorro.md §4.5).
 *  El origen sale de la plata libre en la moneda del plan; el destino, por
 *  defecto la misma cuenta (guardar sin mover de banco). */
export function SavingsSaveSheet({ open, onClose, goalId }: { open: boolean; onClose: () => void; goalId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Ahorrar">
      {open && goalId && <SavingsSaveForm key={goalId} goalId={goalId} onClose={onClose} />}
    </Sheet>
  )
}

function SavingsSaveForm({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const { savingsGoals, savingsView, accounts, allTx, saveSavingsForPeriod, hidden } = useFinanzas()
  const goal = savingsGoals.find(g => g.id === goalId)
  const view = savingsView.goals.find(g => g.goal_id === goalId)
  const period = savingsView.period
  const show = (t: string) => maskAmount(t, hidden)

  const free = useMemo(() => freeByAccount(accounts, allTx), [accounts, allTx])
  const options = useMemo(
    () => accounts.filter(a => !a.archived && goal && a.currency === goal.input_currency && (free.get(a.id) ?? 0) > 0),
    [accounts, goal, free]
  )

  const [fromId, setFromId] = useState(() => options[0]?.id ?? '')
  const [toId, setToId] = useState(() => options[0]?.id ?? '')
  const [amountRaw, setAmountRaw] = useState(() => (view?.pending_amount_native != null ? String(view.pending_amount_native) : ''))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!goal || !view) return null

  const fromAccount = accounts.find(a => a.id === fromId)
  const fromFree = fromId ? free.get(fromId) ?? 0 : 0
  const sameCurrencyAccounts = accounts.filter(a => !a.archived && goal.input_currency === a.currency)

  async function handleSubmit() {
    setError(null)
    if (!fromId) return setError('Elegí de dónde sale.')
    const amount = parseDecimalInput(amountRaw)
    if (!amount || amount <= 0) return setError('Ingresá un monto válido.')

    setSubmitting(true)
    const result = await saveSavingsForPeriod({
      goal_id: goalId,
      period,
      from_account_id: fromId,
      to_account_id: toId || fromId,
      amount,
    })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <div style={{ fontWeight: 700 }}>{goal.name}</div>
        <div style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>Organizando {periodLabel(period)}</div>
        {view.pending_amount_native != null && (
          <div style={{ fontSize: 14, marginTop: 6 }}>
            Acordaste guardar{' '}
            <strong className="fz-tabular">{show(formatMoney(view.pending_amount_native, goal.input_currency))}</strong>
            {goal.allocation_type === 'percent' && view.pending_amount_usd != null && (
              <span style={{ color: 'var(--fz-ink-3)' }}> · {goal.allocation_value}% del sobrante</span>
            )}
          </div>
        )}
      </div>

      {options.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>
          No hay plata libre en {goal.input_currency} para guardar este mes. Convertí a {goal.input_currency} con una transferencia
          y volvé.
        </p>
      ) : (
        <>
          <div>
            <label className="fz-field-label" htmlFor="fz-ss-from">
              ¿De dónde sale?
            </label>
            <select
              id="fz-ss-from"
              className="fz-input"
              value={fromId}
              onChange={e => {
                setFromId(e.target.value)
                if (!toId || toId === fromId) setToId(e.target.value)
              }}
            >
              {options.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatMoney(free.get(a.id) ?? 0, a.currency)} libres
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fz-field-label" htmlFor="fz-ss-to">
              ¿En qué cuenta ahorrar?
            </label>
            <select id="fz-ss-to" className="fz-input" value={toId} onChange={e => setToId(e.target.value)}>
              {sameCurrencyAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              {toId === fromId || !toId
                ? 'Se queda en la misma cuenta, apartada de lo que podés gastar.'
                : 'Se transfiere y queda apartada allá.'}
            </p>
          </div>

          <div>
            <label className="fz-field-label" htmlFor="fz-ss-amount">
              ¿Cuánto?
            </label>
            <div className="fz-amount-field">
              <span className="fz-amount-field__code">{goal.input_currency}</span>
              <input id="fz-ss-amount" inputMode="decimal" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} placeholder="0" />
            </div>
            {fromAccount && (
              <button
                type="button"
                className="fz-link"
                style={{ fontSize: 12, marginTop: 4 }}
                onClick={() => setAmountRaw(String(fromFree))}
              >
                MÁX · {fromAccount.name} tiene {show(formatMoney(fromFree, fromAccount.currency))} libres
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting || options.length === 0}>
        {submitting ? 'Guardando…' : 'Ahorrar'}
      </Btn>
    </div>
  )
}

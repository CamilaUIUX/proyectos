'use client'

import { useMemo, useState } from 'react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { toUsd, usdPerUnit } from '@/lib/finanzas/rates'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** El traslado (sprint-6-ahorro.md §4.11): mover lo que un ahorro tiene
 *  apartado de una cuenta a otra distinta. Mueve el saldo real y lo apartado
 *  en las dos cuentas; el saldo del ahorro no cambia. */
export function SavingsMoveSheet({ open, onClose, goalId }: { open: boolean; onClose: () => void; goalId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Mover de cuenta">
      {open && goalId && <SavingsMoveForm key={goalId} goalId={goalId} onClose={onClose} />}
    </Sheet>
  )
}

function SavingsMoveForm({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const { savingsGoals, savingsView, accounts, rates, moveSavings, hidden } = useFinanzas()
  const goal = savingsGoals.find(g => g.id === goalId)
  const view = savingsView.goals.find(g => g.goal_id === goalId)
  const show = (t: string) => maskAmount(t, hidden)

  const byAccount = useMemo(() => new Map((view?.by_account ?? []).map(b => [b.account_id, b.amount])), [view])
  const origins = useMemo(
    () => accounts.filter(a => !a.archived && (byAccount.get(a.id) ?? 0) > 0),
    [accounts, byAccount]
  )

  const [fromId, setFromId] = useState(() => origins[0]?.id ?? '')
  const [toId, setToId] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [toAmountRaw, setToAmountRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!goal || !view) return null

  const fromAccount = accounts.find(a => a.id === fromId)
  const toAccount = accounts.find(a => a.id === toId)
  const cap = fromId ? byAccount.get(fromId) ?? 0 : 0
  const crossCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency
  const destinations = accounts.filter(a => !a.archived && a.id !== fromId)

  const amount = parseDecimalInput(amountRaw) ?? 0
  const suggestedTo =
    crossCurrency && amount > 0
      ? (toUsd(amount, fromAccount!.currency, rates) / usdPerUnit(toAccount!.currency, rates)).toFixed(toAccount!.currency === 'BTC' ? 8 : 2)
      : ''

  async function handleSubmit() {
    setError(null)
    if (!fromId || !toId) return setError('Elegí las dos cuentas.')
    if (fromId === toId) return setError('Tienen que ser distintas.')
    const amt = parseDecimalInput(amountRaw)
    if (!amt || amt <= 0) return setError('Ingresá un monto válido.')
    const toAmt = crossCurrency ? parseDecimalInput(toAmountRaw || suggestedTo) : null

    setSubmitting(true)
    const result = await moveSavings({
      goal_id: goalId,
      from_account_id: fromId,
      to_account_id: toId,
      amount: amt,
      to_amount: toAmt,
    })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
        {goal.name} · mueve la plata guardada de una cuenta a otra sin tocar el saldo del ahorro.
      </div>

      {origins.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>Este ahorro todavía no tiene plata apartada en ninguna cuenta.</p>
      ) : (
        <>
          <div>
            <label className="fz-field-label" htmlFor="fz-sm-from">
              Desde
            </label>
            <select id="fz-sm-from" className="fz-input" value={fromId} onChange={e => setFromId(e.target.value)}>
              {origins.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatMoney(byAccount.get(a.id) ?? 0, a.currency)} de este ahorro
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fz-field-label" htmlFor="fz-sm-to">
              Hacia
            </label>
            <select id="fz-sm-to" className="fz-input" value={toId} onChange={e => setToId(e.target.value)}>
              <option value="">Elegí una cuenta</option>
              {destinations.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fz-field-label" htmlFor="fz-sm-amount">
              ¿Cuánto?
            </label>
            <div className="fz-amount-field">
              <span className="fz-amount-field__code">{fromAccount?.currency ?? goal.input_currency}</span>
              <input id="fz-sm-amount" inputMode="decimal" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} placeholder="0" />
            </div>
            {fromAccount && (
              <button type="button" className="fz-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setAmountRaw(String(cap))}>
                MÁX · {show(formatMoney(cap, fromAccount.currency))}
              </button>
            )}
          </div>

          {crossCurrency && (
            <div>
              <label className="fz-field-label" htmlFor="fz-sm-to-amount">
                ¿Cuánto llegó a {toAccount!.name}?
              </label>
              <div className="fz-amount-field">
                <span className="fz-amount-field__code">{toAccount!.currency}</span>
                <input
                  id="fz-sm-to-amount"
                  inputMode="decimal"
                  value={toAmountRaw}
                  onChange={e => setToAmountRaw(e.target.value)}
                  placeholder={suggestedTo || '0'}
                />
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting || origins.length === 0}>
        {submitting ? 'Moviendo…' : 'Mover'}
      </Btn>
    </div>
  )
}

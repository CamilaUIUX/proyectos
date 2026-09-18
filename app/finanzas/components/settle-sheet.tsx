'use client'

import { useState } from 'react'
import { marginUsdOf } from '@/lib/finanzas/debts'
import { formatMoney, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { fromUsd, toUsd, usdPerUnit } from '@/lib/finanzas/rates'
import { decimalsFor, type Debt } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Cobra una o varias deudas de una persona a la vez (sprint-2-deudas.md
 * §4.3). `debts` ya viene filtrado por el que llama: misma persona, misma
 * moneda, todas pendientes — settleDebts() en data-context.tsx igual lo
 * revalida antes de escribir. */
export function SettleSheet({
  open,
  onClose,
  personName,
  debts,
}: {
  open: boolean
  onClose: () => void
  personName: string
  debts: Debt[]
}) {
  const { activeAccounts, rates, activeProfile, settleDebts } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const [selected, setSelected] = useState<Set<string>>(() => new Set(debts.map(d => d.id)))
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '')
  const [amountRaw, setAmountRaw] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debtCurrency = debts[0]?.currency ?? 'USD'
  const selectedDebts = debts.filter(d => selected.has(d.id))
  const selectedTotal = selectedDebts.reduce((sum, d) => sum + d.amount, 0)
  const marginUsd = marginUsdOf(selectedDebts)

  const account = activeAccounts.find(a => a.id === accountId)
  const accountCurrency = account?.currency ?? debtCurrency

  // Sugerido (origen → USD → cuenta destino), igual criterio que el
  // "monto recibido" de una transferencia entre monedas en el quick-add.
  const suggested = account
    ? (toUsd(selectedTotal, debtCurrency, rates) / usdPerUnit(accountCurrency, rates)).toFixed(decimalsFor(accountCurrency))
    : ''
  const amountDisplay = amountTouched ? amountRaw : suggested

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    if (selectedDebts.length === 0) return setError('Elegí al menos una deuda.')
    if (!accountId) return setError('Elegí una cuenta.')
    const amount = parseDecimalInput(amountDisplay)
    if (!amount || amount <= 0) return setError('Ingresa el monto recibido.')

    setSubmitting(true)
    const result = await settleDebts({ debtIds: selectedDebts.map(d => d.id), account_id: accountId, amount, date })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Cobrar a ${personName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {debts.map(d => (
            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
              <span style={{ flex: 1, minWidth: 0 }} className="fz-truncate">
                {d.concept ?? 'Gasto compartido'}
              </span>
              <span className="fz-tabular" style={{ fontWeight: 600 }}>
                {formatMoney(d.amount, d.currency)}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="fz-field-label" htmlFor="fz-settle-account">
            Cuenta donde entra la plata
          </label>
          <select
            id="fz-settle-account"
            className="fz-input"
            value={accountId}
            onChange={e => {
              setAccountId(e.target.value)
              setAmountTouched(false)
            }}
          >
            {activeAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="fz-field-label" htmlFor="fz-settle-amount">
            Monto recibido
          </label>
          <div className="fz-amount-field">
            <span className="fz-amount-field__code">{accountCurrency}</span>
            <input
              id="fz-settle-amount"
              inputMode="decimal"
              value={amountDisplay}
              onChange={e => {
                setAmountTouched(true)
                setAmountRaw(e.target.value)
              }}
            />
          </div>
          {!amountTouched && <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>Sugerido con la tasa de hoy.</p>}
          {marginUsd > 0 && (
            <p style={{ fontSize: 12, color: 'var(--fz-in-text)', marginTop: 4 }}>
              ≈ {formatMoney(fromUsd(marginUsd, displayCurrency, rates), displayCurrency)} de esto es ganancia (repartiste por encima del costo) y cuenta como ingreso real.
            </p>
          )}
        </div>

        <div>
          <label className="fz-field-label" htmlFor="fz-settle-date">
            Fecha
          </label>
          <input id="fz-settle-date" type="date" className="fz-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
            {error}
          </p>
        )}

        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : 'Confirmar cobro'}
        </Btn>
      </div>
    </Sheet>
  )
}

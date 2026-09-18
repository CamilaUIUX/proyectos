'use client'

import { useState } from 'react'
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { valueUpdateDelta } from '@/lib/finanzas/transactions'
import type { AccountWithBalance } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** "Actualizar valor" de una cuenta de inversión (sprint-7-cuentas-inversion.md
 *  §4.4): un solo campo — el valor de hoy — precargado con el saldo actual, con
 *  la diferencia en vivo. Sin tipo, cuenta, categoría ni fecha. Sin modo
 *  edición: corregir uno pasado es volver a abrir esto con el número correcto. */
export function AccountValueSheet({ open, onClose, account }: { open: boolean; onClose: () => void; account: AccountWithBalance | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Actualizar valor">
      {open && account && <AccountValueForm key={account.id} account={account} onClose={onClose} />}
    </Sheet>
  )
}

function AccountValueForm({ account, onClose }: { account: AccountWithBalance; onClose: () => void }) {
  const { setAccountValue, hidden } = useFinanzas()
  const [raw, setRaw] = useState(String(account.balance))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = parseDecimalInput(raw)
  const resolved = target == null ? null : valueUpdateDelta(account.balance, target, account.currency)
  const show = (t: string) => maskAmount(t, hidden)

  async function handleSubmit() {
    setError(null)
    if (target == null) return setError('Ingresá un valor.')
    if (!resolved) return
    setSubmitting(true)
    const result = await setAccountValue(account.id, target)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
        {account.name} · saldo de hoy {show(formatMoney(account.balance, account.currency))}
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-av-value">
          ¿Cuánto hay en tu inversión hoy?
        </label>
        <div className="fz-amount-field">
          <span className="fz-amount-field__code">{account.currency}</span>
          <input id="fz-av-value" inputMode="decimal" value={raw} onChange={e => setRaw(e.target.value)} placeholder="0" autoFocus />
        </div>
        {resolved && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 6,
              fontSize: 13,
              fontWeight: 600,
              color: resolved.type === 'ingreso' ? 'var(--fz-in-text)' : 'var(--fz-out-text)',
            }}
          >
            {resolved.type === 'ingreso' ? <IconArrowUpRight size={15} /> : <IconArrowDownRight size={15} />}
            {show(formatMoney(resolved.amount, account.currency))} desde el saldo actual
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
          Se registra la diferencia como un ajuste — no cuenta como gasto ni ingreso del mes, pero el saldo sí se mueve.
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting || !resolved}>
        {submitting ? 'Guardando…' : 'Guardar valor'}
      </Btn>
    </div>
  )
}

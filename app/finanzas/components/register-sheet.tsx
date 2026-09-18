'use client'

import { useMemo, useState } from 'react'
import { formatMoney, maskAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { dueDateISO, resolveSplitAmounts } from '@/lib/finanzas/recurring'
import type { Recurring } from '@/lib/finanzas/types'
import { CategoryIcon } from './category-icon'
import { SplitEditor, type SplitRow } from './split-editor'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Confirma el registro de un fijo para el período `year`/`month` (el más
 * viejo sin registrar) — precargado con cuenta (la última usada), monto,
 * categoría y la fecha topeada del día que corresponde, todo editable
 * (sprint-3-fijos.md §4.3). */
export function RegisterSheet({
  open,
  onClose,
  recurring,
  year,
  month,
}: {
  open: boolean
  onClose: () => void
  recurring: Recurring
  year: number
  month: number
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Registrar "${recurring.name}"`}>
      {open && <RegisterForm recurring={recurring} year={year} month={month} onClose={onClose} />}
    </Sheet>
  )
}

function RegisterForm({ recurring, year, month, onClose }: { recurring: Recurring; year: number; month: number; onClose: () => void }) {
  const { activeAccounts, categories, recurringSplitsByTemplate, savingsGoals, savingsByAccount, registerRecurring, updateRecurring, hidden } =
    useFinanzas()

  const isSavings = recurring.savings_goal_id != null
  const savingsGoal = savingsGoals.find(g => g.id === recurring.savings_goal_id)

  // Solo cuentas de la misma moneda que la plantilla (§0: sin conversión
  // cross-currency al registrar un fijo).
  // Una cuenta de inversión no paga fijos — sus movimientos son ajustes de
  // valor, no gasto real (sprint-7 §4.10).
  const matchingAccounts = activeAccounts.filter(a => a.currency === recurring.currency && !a.is_investment)
  const defaultAccountId = matchingAccounts.find(a => a.id === recurring.account_id)?.id ?? matchingAccounts[0]?.id ?? ''
  const defaultToAccountId = matchingAccounts.find(a => a.id === recurring.to_account_id)?.id ?? matchingAccounts[0]?.id ?? ''

  const [accountId, setAccountId] = useState(defaultAccountId)
  const [toAccountId, setToAccountId] = useState(defaultToAccountId)
  const [amountRaw, setAmountRaw] = useState(String(recurring.amount))
  const [categoryId, setCategoryId] = useState<string | null>(recurring.category_id)
  const [date, setDate] = useState(dueDateISO(recurring, year, month))
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsForce, setNeedsForce] = useState(false)
  const show = (t: string) => maskAmount(t, hidden)
  // D4 · Registrar un mes más caro NO cambia el monto de la plantilla salvo
  // que lo pidas — un precio que se actualiza solo porque un mes pagaste de
  // más hace desconfiar de la app.
  const [updateTemplate, setUpdateTemplate] = useState(false)

  const templateSplits = recurringSplitsByTemplate.get(recurring.id) ?? []
  const isShared = !isSavings && recurring.type === 'gasto' && templateSplits.length > 0

  const amount = parseDecimalInput(amountRaw) ?? 0
  const account = matchingAccounts.find(a => a.id === accountId)
  // Piso de ahorro (§4.6): ni un gasto ni un aporte de fijo pueden salir de lo
  // que ya está apartado en la cuenta de origen.
  const apartado = account ? savingsByAccount.get(account.id) ?? 0 : 0
  const available = account ? Math.max(0, roundFor(account.balance - apartado, account.currency)) : 0
  const consumes = recurring.type === 'gasto' || isSavings
  const over = consumes && amount > available + 1e-9

  // B2 · Las partes "pareja" se re-resuelven en vivo contra el monto EDITADO
  // (Spotify subió a $12.99 → a cada uno le toca un poco más), no una sola
  // vez contra el default de la plantilla. Se congelan solo cuando el usuario
  // edita el reparto a mano — mismo patrón que el "monto recibido" del quick-add.
  const resolvedSplits = useMemo<SplitRow[]>(() => {
    if (!isShared) return []
    return resolveSplitAmounts(templateSplits, amount || recurring.amount, recurring.currency).map(r => ({
      person_id: r.person_id,
      amountRaw: String(r.amount),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShared, amount, recurring.amount, recurring.currency, recurring.id])
  const [manualSplits, setManualSplits] = useState<SplitRow[] | null>(null)
  const splits = manualSplits ?? resolvedSplits

  const categoryOptions = categories.filter(c => c.kind === (recurring.type === 'ingreso' ? 'ingreso' : 'gasto') && !c.archived)

  async function submit(force: boolean) {
    setError(null)
    if (!amount || amount <= 0) return setError('Ingresa un monto válido.')
    if (!accountId) return setError('Elegí una cuenta.')
    if (isSavings && !toAccountId) return setError('Elegí a qué cuenta de ahorro entra.')
    if (over) return setError(`El monto supera el disponible (${formatMoney(available, recurring.currency)}).`)

    setSubmitting(true)
    const result = await registerRecurring({
      recurring_id: recurring.id,
      date,
      account_id: accountId,
      category_id: isSavings ? null : categoryId,
      amount,
      description: description.trim() || null,
      splits: isShared ? splits.map(s => ({ person_id: s.person_id, amount: parseDecimalInput(s.amountRaw) ?? 0 })) : undefined,
      to_account_id: isSavings ? toAccountId : null,
      force,
    })
    setSubmitting(false)
    if (result.alreadyRegistered) {
      setNeedsForce(true)
      setError('Este fijo ya tiene un movimiento en este período.')
      return
    }
    if (result.error) return setError(result.error)
    if (updateTemplate && amount !== recurring.amount) {
      await updateRecurring(recurring.id, { amount }) // no fatal si falla — el registro ya quedó
    }
    onClose()
  }

  const amountChanged = amount > 0 && amount !== recurring.amount

  if (matchingAccounts.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--fz-ink-2)' }}>
        No tenés ninguna cuenta activa en {recurring.currency}. Creá una desde Cuentas para poder registrar este fijo.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      {isSavings && (
        <p style={{ fontSize: 13, color: 'var(--fz-save-text)', fontWeight: 600 }}>
          Aporte a {savingsGoal?.name ?? 'un ahorro'} — genera una transferencia, no un gasto.
        </p>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-reg-account">
          {isSavings ? 'Sale de' : 'Cuenta'}
        </label>
        <select id="fz-reg-account" className="fz-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          {matchingAccounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </select>
      </div>

      {isSavings && (
        <div>
          <label className="fz-field-label" htmlFor="fz-reg-to-account">
            ¿A qué cuenta de ahorro entra?
          </label>
          <select id="fz-reg-to-account" className="fz-input" value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
            {matchingAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {toAccountId === accountId && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              Se queda en la misma cuenta, apartada de lo que podés gastar.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-reg-amount">
          Monto
        </label>
        <div className="fz-amount-field">
          <span className="fz-amount-field__code">{recurring.currency}</span>
          <input id="fz-reg-amount" inputMode="decimal" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} autoFocus />
        </div>
        {consumes && account && (
          <div className={`fz-amount-hint${over ? ' fz-amount-hint--over' : ''}`}>
            <span>
              Disponible {show(formatMoney(available, recurring.currency))}
              {apartado > 1e-9 && <span style={{ color: 'var(--fz-ink-3)' }}> · {show(formatMoney(apartado, recurring.currency))} en ahorros</span>}
            </span>
            <button type="button" className="fz-link" onClick={() => setAmountRaw(String(available))}>
              MAX
            </button>
          </div>
        )}
        {amountChanged && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6 }}>
            <input type="checkbox" checked={updateTemplate} onChange={e => setUpdateTemplate(e.target.checked)} />
            Cambiar también el monto del fijo a {formatMoney(amount, recurring.currency)}
          </label>
        )}
      </div>

      {!isSavings && (
        <div>
          <label className="fz-field-label">Categoría</label>
          <div className="fz-chip-row">
            {categoryOptions.map(c => (
              <button
                key={c.id}
                type="button"
                className="fz-chip"
                data-active={categoryId === c.id}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              >
                <CategoryIcon icon={c.icon} name={c.name} size="sm" />
                {c.name}
              </button>
            ))}
            {categoryOptions.length === 0 && <span style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>Sin categorías todavía.</span>}
          </div>
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-reg-date">
          Fecha
        </label>
        <input id="fz-reg-date" type="date" className="fz-input" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {isShared && (
        <div>
          <label className="fz-field-label">Reparto</label>
          <SplitEditor total={amount} currency={recurring.currency} splits={splits} onChange={setManualSplits} />
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-reg-desc">
          Descripción (opcional)
        </label>
        <input
          id="fz-reg-desc"
          className="fz-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={recurring.name}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {needsForce ? (
        <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
          <button type="button" className="fz-link" onClick={onClose}>
            Cancelar
          </button>
          <Btn variant="primary" block onClick={() => submit(true)} disabled={submitting || over}>
            {submitting ? 'Guardando…' : 'Registrar igual'}
          </Btn>
        </div>
      ) : (
        <Btn variant="primary" block onClick={() => submit(false)} disabled={submitting || over}>
          {submitting ? 'Guardando…' : 'Registrar'}
        </Btn>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { ALLOCATION_TYPE_LABEL } from '@/lib/finanzas/savings'
import { CURRENCIES, type Currency, type SavingsAllocationType } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Crear o editar un ahorro — nombre, moneda, regla de reparto, meta opcional
 *  y el cajón de sastre (sprint-6-ahorro.md §4.9). La moneda se congela con el
 *  primer movimiento. */
export function SavingsGoalSheet({ open, onClose, editingId }: { open: boolean; onClose: () => void; editingId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Editar ahorro' : 'Nuevo ahorro'}>
      {open && <SavingsGoalForm key={editingId ?? 'new'} editingId={editingId} onClose={onClose} />}
    </Sheet>
  )
}

function SavingsGoalForm({ editingId, onClose }: { editingId: string | null; onClose: () => void }) {
  const { savingsGoals, savingsView, allTx, createSavingsGoal, updateSavingsGoal, deleteSavingsGoal, hidden } = useFinanzas()

  const editing = editingId ? savingsGoals.find(g => g.id === editingId) ?? null : null
  const hasMovements = editing ? allTx.some(t => t.savings_goal_id === editing.id) : false

  const [name, setName] = useState(editing?.name ?? '')
  const [currency, setCurrency] = useState<Currency>(editing?.input_currency ?? 'USD')
  const [isCatchall, setIsCatchall] = useState(editing?.is_catchall ?? false)
  const [allocationType, setAllocationType] = useState<SavingsAllocationType>(editing?.allocation_type ?? 'fixed')
  const [allocationRaw, setAllocationRaw] = useState(editing ? String(editing.allocation_value) : '')
  const [targetRaw, setTargetRaw] = useState(editing?.target_amount != null ? String(editing.target_amount) : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre.')
    const target = targetRaw.trim() ? parseDecimalInput(targetRaw) : null
    if (targetRaw.trim() && (!target || target <= 0)) return setError('La meta tiene que ser un monto válido.')

    // El cajón de sastre no reparte con una regla propia — igual guardamos un
    // placeholder para el CHECK (§0.6).
    let allocationValue = 1
    if (!isCatchall) {
      const v = parseDecimalInput(allocationRaw)
      if (!v || v <= 0) return setError(allocationType === 'percent' ? 'Poné un porcentaje.' : 'Poné un monto.')
      if (allocationType === 'percent' && v > 100) return setError('El porcentaje no puede pasar de 100.')
      allocationValue = v
    }

    setSubmitting(true)
    let result: { error?: string }
    if (editing) {
      result = await updateSavingsGoal(editing.id, {
        name: name.trim(),
        allocation_type: allocationType,
        allocation_value: allocationValue,
        target_amount: target,
        is_catchall: isCatchall,
        ...(hasMovements ? {} : { input_currency: currency }),
      })
    } else {
      result = await createSavingsGoal({
        name: name.trim(),
        input_currency: currency,
        allocation_type: allocationType,
        allocation_value: allocationValue,
        target_amount: target,
        is_catchall: isCatchall,
      })
    }
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleDelete() {
    if (!editing) return
    setSubmitting(true)
    const result = await deleteSavingsGoal(editing.id)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  const otherCatchall = savingsGoals.find(g => g.is_catchall && !g.archived && g.id !== editingId)
  const savedView = editing ? savingsView.goals.find(g => g.goal_id === editing.id) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <label className="fz-field-label" htmlFor="fz-sg-name">
          Nombre
        </label>
        <input id="fz-sg-name" className="fz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Emergencia" />
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ width: 120 }}>
          <label className="fz-field-label" htmlFor="fz-sg-currency">
            Moneda
          </label>
          <select
            id="fz-sg-currency"
            className="fz-input"
            value={currency}
            disabled={hasMovements}
            onChange={e => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {hasMovements && (
          <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', alignSelf: 'end', flex: 1 }}>
            Ya tiene movimientos — la moneda queda fija.
          </p>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={isCatchall}
          onChange={e => setIsCatchall(e.target.checked)}
        />
        Acá va lo que sobre del reparto
        {otherCatchall && isCatchall && (
          <span style={{ color: 'var(--fz-ink-3)' }}> (reemplaza a {otherCatchall.name})</span>
        )}
      </label>

      {!isCatchall && (
        <div>
          <label className="fz-field-label">Cuánto se le aporta cada mes</label>
          <div className="fz-chip-row" style={{ marginBottom: 8 }}>
            {(['fixed', 'percent'] as const).map(t => (
              <button
                key={t}
                type="button"
                className="fz-chip"
                data-active={allocationType === t}
                onClick={() => setAllocationType(t)}
              >
                {ALLOCATION_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="fz-amount-field">
            <span className="fz-amount-field__code">{allocationType === 'percent' ? '%' : currency}</span>
            <input
              inputMode="decimal"
              value={allocationRaw}
              onChange={e => setAllocationRaw(e.target.value)}
              placeholder={allocationType === 'percent' ? '30' : '0'}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
            {allocationType === 'percent'
              ? 'Del sobrante del mes, después de cubrir los de monto fijo.'
              : 'Sale primero del sobrante; si no alcanza, la app te pregunta.'}
          </p>
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-sg-target">
          Meta (opcional)
        </label>
        <div className="fz-amount-field">
          <span className="fz-amount-field__code">{currency}</span>
          <input id="fz-sg-target" inputMode="decimal" value={targetRaw} onChange={e => setTargetRaw(e.target.value)} placeholder="0" />
        </div>
        {editing && targetRaw.trim() && savedView && (
          <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
            Llevás {maskAmount(formatMoney(savedView.balance_native, currency), hidden)} guardado — al llegar a la meta sale del
            reparto automático.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
        {editing && (
          <button
            type="button"
            className="fz-icon-btn"
            style={{ color: 'var(--fz-out-text)' }}
            onClick={handleDelete}
            disabled={submitting}
            aria-label="Borrar ahorro"
          >
            <IconTrash size={18} />
          </button>
        )}
        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear ahorro'}
        </Btn>
      </div>
    </div>
  )
}

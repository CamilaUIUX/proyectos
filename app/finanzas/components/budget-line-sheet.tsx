'use client'

import { useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { periodStart, resolvePeriodAmount } from '@/lib/finanzas/budgets'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { CategoryIcon } from './category-icon'
import { useFinanzas } from './data-context'

/** Crear o editar una línea de presupuesto — 1..N categorías de gasto, monto
 * y moneda, y (solo al crear) si cuenta lo ya gastado este mes
 * (sprint-5-presupuesto.md §4.1). */
export function BudgetLineSheet({ open, onClose, editingId }: { open: boolean; onClose: () => void; editingId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Editar presupuesto' : 'Nuevo presupuesto'}>
      {open && <BudgetLineForm key={editingId ?? 'new'} editingId={editingId} onClose={onClose} />}
    </Sheet>
  )
}

function BudgetLineForm({ editingId, onClose }: { editingId: string | null; onClose: () => void }) {
  const {
    categories,
    budgetLines,
    budgetLineCategories,
    budgetPeriods,
    createBudgetLine,
    updateBudgetLine,
    deleteBudgetLine,
    setBudgetPeriodAmount,
  } = useFinanzas()

  const editing = editingId ? budgetLines.find(l => l.id === editingId) ?? null : null
  const period = periodStart(todayISO())

  const gastoCats = categories.filter(c => c.kind === 'gasto' && !c.archived)
  const takenByOthers = new Set(budgetLineCategories.filter(lc => lc.line_id !== editingId).map(lc => lc.category_id))

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(editing ? budgetLineCategories.filter(lc => lc.line_id === editing.id).map(lc => lc.category_id) : [])
  )
  const [name, setName] = useState(editing?.name ?? '')
  const [currency, setCurrency] = useState<Currency>(editing?.input_currency ?? 'USD')
  const [retroactive, setRetroactive] = useState(true)
  const [amountRaw, setAmountRaw] = useState(() => {
    if (!editing) return ''
    const r = resolvePeriodAmount(budgetPeriods, editing.id, period)
    return r.amount != null ? String(r.amount) : ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleCat(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setError(null)
    const ids = [...selected]
    if (ids.length === 0) return setError('Elegí al menos una categoría.')
    const amount = parseDecimalInput(amountRaw)
    if (!amount || amount <= 0) return setError('Ingresá un monto válido.')

    setSubmitting(true)
    let result: { error?: string }
    if (editing) {
      result = await updateBudgetLine(editing.id, { name, categoryIds: ids })
      if (!result.error) result = await setBudgetPeriodAmount(editing.id, period, amount)
    } else {
      result = await createBudgetLine({ name: name || null, categoryIds: ids, input_currency: currency, amount, retroactive })
    }
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleDelete() {
    if (!editing) return
    setSubmitting(true)
    const result = await deleteBudgetLine(editing.id)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <label className="fz-field-label">Categorías</label>
        <div className="fz-chip-row">
          {gastoCats.map(c => {
            const disabled = takenByOthers.has(c.id) && !selected.has(c.id)
            return (
              <button
                key={c.id}
                type="button"
                className="fz-chip"
                data-active={selected.has(c.id)}
                disabled={disabled}
                title={disabled ? 'Ya está en otro presupuesto' : undefined}
                style={disabled ? { opacity: 0.4 } : undefined}
                onClick={() => toggleCat(c.id)}
              >
                <CategoryIcon icon={c.icon} name={c.name} size="sm" />
                {c.name}
              </button>
            )
          })}
        </div>
        {selected.size > 1 && (
          <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
            Se presupuestan juntas bajo un solo tope — poné un alias abajo así no se listan como{' '}
            {[...selected].map(id => categories.find(c => c.id === id)?.name).join(', ')}.
          </p>
        )}
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-bl-name">
          Alias (opcional)
        </label>
        <input id="fz-bl-name" className="fz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Gustos" />
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-bl-amount">
            Monto {editing ? 'de este mes' : 'mensual'}
          </label>
          <div className="fz-amount-field">
            <span className="fz-amount-field__code">{currency}</span>
            <input id="fz-bl-amount" inputMode="decimal" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} placeholder="0" />
          </div>
        </div>
        {!editing && (
          <div style={{ width: 110 }}>
            <label className="fz-field-label" htmlFor="fz-bl-currency">
              Moneda
            </label>
            <select id="fz-bl-currency" className="fz-input" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {editing && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: -8 }}>
          Editar este mes no toca los meses anteriores. El mes que viene arranca con este monto.
        </p>
      )}

      {!editing && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={retroactive} onChange={e => setRetroactive(e.target.checked)} />
          Contar lo que ya gastaste este mes en estas categorías
        </label>
      )}

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
            aria-label="Borrar presupuesto"
          >
            <IconTrash size={18} />
          </button>
        )}
        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear presupuesto'}
        </Btn>
      </div>
    </div>
  )
}

'use client'

import { IconX } from '@tabler/icons-react'
import type { Currency } from '@/lib/finanzas/types'
import { PersonPicker } from './person-picker'
import { useFinanzas } from './data-context'

/** Fila del reparto por defecto de una plantilla — a diferencia de
 * <SplitEditor> (Sprint 2, usado en un registro concreto), acá cada
 * persona alterna entre "parte pareja" (se resuelve recién al registrar,
 * contra el monto real de ese período) o un monto fijo propio
 * (sprint-3-fijos.md §3.3). */
export interface TemplateSplitRow {
  person_id: string
  even: boolean
  amountRaw: string
}

function TemplateSplitRowView({
  row,
  currency,
  onToggleEven,
  onAmountChange,
  onRemove,
}: {
  row: TemplateSplitRow
  currency: Currency
  onToggleEven: () => void
  onAmountChange: (raw: string) => void
  onRemove: () => void
}) {
  const { people } = useFinanzas()
  const person = people.find(p => p.id === row.person_id)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }} className="fz-truncate">
        {person?.name ?? '—'}
      </span>
      <button type="button" className="fz-chip" data-active={row.even} onClick={onToggleEven}>
        Parte pareja
      </button>
      {!row.even && (
        <div className="fz-amount-field" style={{ flex: '0 0 120px' }}>
          <span className="fz-amount-field__code">{currency}</span>
          <input inputMode="decimal" value={row.amountRaw} onChange={e => onAmountChange(e.target.value)} />
        </div>
      )}
      <button type="button" className="fz-icon-btn" style={{ width: 32, height: 32 }} onClick={onRemove} aria-label="Quitar">
        <IconX size={14} />
      </button>
    </div>
  )
}

export function RecurringSplitEditor({
  currency,
  splits,
  onChange,
}: {
  currency: Currency
  splits: TemplateSplitRow[]
  onChange: (rows: TemplateSplitRow[]) => void
}) {
  function addPerson(personId: string) {
    if (splits.some(s => s.person_id === personId)) return
    onChange([...splits, { person_id: personId, even: true, amountRaw: '' }])
  }
  function removePerson(personId: string) {
    onChange(splits.filter(s => s.person_id !== personId))
  }
  function toggleEven(personId: string) {
    onChange(splits.map(s => (s.person_id === personId ? { ...s, even: !s.even } : s)))
  }
  function setAmount(personId: string, raw: string) {
    onChange(splits.map(s => (s.person_id === personId ? { ...s, amountRaw: raw } : s)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PersonPicker value={null} onChange={id => id && addPerson(id)} placeholder="Agregar persona…" />
      {splits.map(s => (
        <TemplateSplitRowView
          key={s.person_id}
          row={s}
          currency={currency}
          onToggleEven={() => toggleEven(s.person_id)}
          onAmountChange={raw => setAmount(s.person_id, raw)}
          onRemove={() => removePerson(s.person_id)}
        />
      ))}
      {splits.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          El monto exacto de cada quien se decide al confirmar cada registro — esto es solo el reparto por defecto.
        </p>
      )}
    </div>
  )
}

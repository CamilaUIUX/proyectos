'use client'

import { IconX } from '@tabler/icons-react'
import { sharedSplitEven, shareBreakdown } from '@/lib/finanzas/debts'
import { formatMoney, parseDecimalInput } from '@/lib/finanzas/money'
import type { Currency } from '@/lib/finanzas/types'
import { PersonPicker } from './person-picker'
import { useFinanzas } from './data-context'

export interface SplitRow {
  person_id: string
  amountRaw: string
}

function PersonAmountRow({
  personId,
  amountRaw,
  currency,
  onAmountChange,
  onRemove,
}: {
  personId: string
  amountRaw: string
  currency: Currency
  onAmountChange: (raw: string) => void
  onRemove: () => void
}) {
  const { people } = useFinanzas()
  const person = people.find(p => p.id === personId)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0 }} className="fz-truncate">
        {person?.name ?? '—'}
      </span>
      <div className="fz-amount-field" style={{ flex: '0 0 140px' }}>
        <span className="fz-amount-field__code">{currency}</span>
        <input inputMode="decimal" value={amountRaw} onChange={e => onAmountChange(e.target.value)} />
      </div>
      <button type="button" className="fz-icon-btn" style={{ width: 32, height: 32 }} onClick={onRemove} aria-label="Quitar">
        <IconX size={14} />
      </button>
    </div>
  )
}

/** Reparto de un gasto compartido: agregar personas (con creación inline
 * vía <PersonPicker>), reparto parejo por defecto **contándote a vos**
 * (sprint-2-deudas.md §4.2), cada monto editable — sin exigir que sume el
 * total. Repartir de más deja tu parte negativa: eso es ganancia. */
export function SplitEditor({
  total,
  currency,
  splits,
  onChange,
}: {
  total: number
  currency: Currency
  splits: SplitRow[]
  onChange: (rows: SplitRow[]) => void
}) {
  function redistribute(personIds: string[]) {
    if (personIds.length === 0) {
      onChange([])
      return
    }
    const { shares } = sharedSplitEven(total, personIds.length, currency)
    onChange(personIds.map((pid, i) => ({ person_id: pid, amountRaw: String(shares[i] ?? 0) })))
  }

  function addPerson(personId: string) {
    if (splits.some(s => s.person_id === personId)) return
    redistribute([...splits.map(s => s.person_id), personId])
  }

  function removePerson(personId: string) {
    redistribute(splits.filter(s => s.person_id !== personId).map(s => s.person_id))
  }

  function setAmount(personId: string, raw: string) {
    onChange(splits.map(s => (s.person_id === personId ? { ...s, amountRaw: raw } : s)))
  }

  const splitAmounts = splits.map(s => parseDecimalInput(s.amountRaw) ?? 0)
  const { mine, kind } = shareBreakdown(total, splitAmounts, currency)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PersonPicker value={null} onChange={id => id && addPerson(id)} placeholder="Agregar persona…" />
      {splits.map(s => (
        <PersonAmountRow
          key={s.person_id}
          personId={s.person_id}
          amountRaw={s.amountRaw}
          currency={currency}
          onAmountChange={raw => setAmount(s.person_id, raw)}
          onRemove={() => removePerson(s.person_id)}
        />
      ))}
      {splits.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          {kind === 'ganas' ? (
            <>
              Ganás <strong style={{ color: 'var(--fz-in-text)' }}>{formatMoney(Math.abs(mine), currency)}</strong> — repartiste más de lo
              que salió
            </>
          ) : (
            <>
              Tu parte: <strong style={{ color: 'var(--fz-ink)' }}>{formatMoney(mine, currency)}</strong>
            </>
          )}
        </p>
      )}
    </div>
  )
}

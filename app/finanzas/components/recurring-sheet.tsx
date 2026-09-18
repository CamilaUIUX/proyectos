'use client'

import { useState } from 'react'
import { parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { CATEGORY_ICON_MAP, CURRENCIES, type Currency, type Recurring, type RecurringFrequency, type TransactionType } from '@/lib/finanzas/types'
import { Btn, Segmented, Sheet } from './ui'
import { RecurringSplitEditor, type TemplateSplitRow } from './recurring-split-editor'
import { useFinanzas } from './data-context'

const ICON_OPTIONS = Object.keys(CATEGORY_ICON_MAP)
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Crear/editar una plantilla de fijo — incluye el reparto por defecto si
 * es un gasto compartido (sprint-3-fijos.md §0/§3.3). */
export function RecurringSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Recurring | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar fijo' : 'Nuevo fijo'}>
      {/* Se monta fresco cada apertura — mismo criterio que <DebtForm> del
       * Sprint 2, evita tener que resetear campos a mano con un efecto. */}
      {open && <RecurringForm key={editing?.id ?? 'new'} editing={editing} onClose={onClose} />}
    </Sheet>
  )
}

function RecurringForm({ editing, onClose }: { editing: Recurring | null; onClose: () => void }) {
  const { categories, savingsGoals, recurringSplitsByTemplate, createRecurring, updateRecurring, setRecurringSplits } = useFinanzas()
  const isEditing = Boolean(editing)

  const [name, setName] = useState(editing?.name ?? '')
  const [icon, setIcon] = useState(editing?.icon ?? ICON_OPTIONS[0])
  const [type, setType] = useState<TransactionType>(editing?.type ?? 'gasto')
  const [amountRaw, setAmountRaw] = useState(editing ? String(editing.amount) : '')
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? 'USD')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null)
  const [frequency, setFrequency] = useState<RecurringFrequency>(editing?.frequency ?? 'mensual')
  const [dayOfMonth, setDayOfMonth] = useState(editing ? String(editing.day_of_month) : '1')
  const [monthOfYear, setMonthOfYear] = useState(editing?.month_of_year ?? new Date().getMonth() + 1)
  const [startsOn, setStartsOn] = useState(editing?.starts_on ?? todayISO())
  const [note, setNote] = useState(editing?.note ?? '')
  const [savingsGoalId, setSavingsGoalId] = useState<string | null>(editing?.savings_goal_id ?? null)
  const isSavings = savingsGoalId != null
  const [shared, setShared] = useState(() => (editing ? (recurringSplitsByTemplate.get(editing.id)?.length ?? 0) > 0 : false))
  const activeGoals = savingsGoals.filter(g => !g.archived || g.id === editing?.savings_goal_id)
  const [splits, setSplits] = useState<TemplateSplitRow[]>(() => {
    if (!editing) return []
    const existing = recurringSplitsByTemplate.get(editing.id) ?? []
    return existing.map(s => ({ person_id: s.person_id, even: s.amount == null, amountRaw: s.amount != null ? String(s.amount) : '' }))
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categoryOptions = categories.filter(c => c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto') && !c.archived)

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre.')
    const amount = parseDecimalInput(amountRaw)
    if (!amount || amount <= 0) return setError('Ingresa un monto válido.')
    const day = Number.parseInt(dayOfMonth, 10)
    if (!day || day < 1 || day > 31) return setError('El día tiene que estar entre 1 y 31.')
    // Sin este chequeo, una persona con "parte pareja" destildada pero sin
    // monto tipeado mandaba `amount: 0` a fin_recurring_splits — Postgres
    // lo rechaza (CHECK amount > 0), pero isPgError() no traduce ese
    // mensaje y el usuario veía el error crudo de la base. Bug real de la
    // revisión del Sprint 3.
    if (shared && type === 'gasto') {
      for (const s of splits) {
        if (!s.even && !((parseDecimalInput(s.amountRaw) ?? 0) > 0)) {
          return setError('Cada persona con monto fijo en el reparto necesita un monto válido — o marcala como "parte pareja".')
        }
      }
    }

    if (isSavings && !activeGoals.some(g => g.id === savingsGoalId)) return setError('Elegí a qué ahorro aporta.')

    setSubmitting(true)
    const payload = {
      name: name.trim(),
      icon,
      type,
      amount,
      currency,
      category_id: isSavings ? null : categoryId,
      frequency,
      day_of_month: day,
      month_of_year: frequency === 'anual' ? monthOfYear : null,
      starts_on: startsOn,
      note: note.trim() || null,
      savings_goal_id: savingsGoalId,
      to_account_id: isSavings ? editing?.to_account_id ?? null : null,
    }
    // Ramas separadas (no un `result` compartido): updateRecurring() y
    // createRecurring() devuelven formas distintas (esta última trae `id`),
    // y TS no puede angostar una unión de las dos según de qué rama vino.
    let recurringId: string | undefined
    if (isEditing && editing) {
      const result = await updateRecurring(editing.id, payload)
      if (result.error) {
        setSubmitting(false)
        return setError(result.error)
      }
      recurringId = editing.id
    } else {
      const result = await createRecurring(payload)
      if (result.error) {
        setSubmitting(false)
        return setError(result.error)
      }
      recurringId = result.id
    }
    // El reparto solo tiene sentido en un gasto (§2: "sin reparto en un
    // fijo de ingreso, no tiene sentido compartir algo que cobrás"). Se
    // manda igual cuando `type === 'ingreso'` (con lista vacía) y no solo
    // cuando es gasto: si una plantilla compartida se pasa a ingreso al
    // editarla, hay que borrar el reparto viejo, no dejarlo huérfano en la
    // base — bug real encontrado al escribir este formulario.
    if (recurringId) {
      const splitPayload =
        type === 'gasto' && shared && !isSavings
          ? splits.map(s => ({ person_id: s.person_id, amount: s.even ? null : (parseDecimalInput(s.amountRaw) ?? 0) }))
          : []
      const splitResult = await setRecurringSplits(recurringId, splitPayload)
      if (splitResult.error) {
        setSubmitting(false)
        return setError(`El fijo se guardó, pero no se pudo guardar el reparto: ${splitResult.error}`)
      }
    }
    setSubmitting(false)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <Segmented
        value={type}
        onChange={v => {
          setType(v)
          setCategoryId(null)
          if (v === 'ingreso') {
            setShared(false)
            setSavingsGoalId(null)
          }
        }}
        options={[
          { value: 'gasto', label: 'Gasto' },
          { value: 'ingreso', label: 'Ingreso' },
        ]}
      />

      <div>
        <label className="fz-field-label" htmlFor="fz-rec-name">
          Nombre
        </label>
        <input id="fz-rec-name" className="fz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Alquiler" />
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-rec-icon">
          Ícono
        </label>
        <select id="fz-rec-icon" className="fz-input" value={icon} onChange={e => setIcon(e.target.value)}>
          {ICON_OPTIONS.map(slug => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-rec-amount">
            Monto
          </label>
          <input
            id="fz-rec-amount"
            className="fz-input"
            inputMode="decimal"
            value={amountRaw}
            onChange={e => setAmountRaw(e.target.value)}
            placeholder="0"
          />
        </div>
        <div style={{ width: 110 }}>
          <label className="fz-field-label" htmlFor="fz-rec-currency">
            Moneda
          </label>
          <select id="fz-rec-currency" className="fz-input" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: -8 }}>
        Es solo un default — se puede editar cada vez que lo registrás, sin tocar la plantilla.
      </p>

      {type === 'gasto' && activeGoals.length > 0 && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={isSavings}
              onChange={e => {
                if (e.target.checked) {
                  setSavingsGoalId(activeGoals[0].id)
                  setCategoryId(null)
                  setShared(false)
                  setSplits([])
                } else {
                  setSavingsGoalId(null)
                }
              }}
            />
            Es un aporte a un ahorro
          </label>
          {isSavings && (
            <select
              className="fz-input"
              style={{ marginTop: 8 }}
              value={savingsGoalId ?? ''}
              onChange={e => setSavingsGoalId(e.target.value || null)}
            >
              {activeGoals.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {isSavings && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              Cada mes genera una transferencia a tu ahorro, no un gasto. La cuenta de ahorro se elige al registrarlo.
            </p>
          )}
        </div>
      )}

      {!isSavings && (
        <div>
          <label className="fz-field-label" htmlFor="fz-rec-category">
            Categoría (opcional)
          </label>
          <select id="fz-rec-category" className="fz-input" value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value || null)}>
            <option value="">Sin categoría</option>
            {categoryOptions.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="fz-field-label">Frecuencia</label>
        <Segmented
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'mensual', label: 'Mensual' },
            { value: 'anual', label: 'Anual' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-rec-day">
            Día del mes
          </label>
          <input
            id="fz-rec-day"
            className="fz-input"
            inputMode="numeric"
            value={dayOfMonth}
            onChange={e => setDayOfMonth(e.target.value.replace(/\D/g, ''))}
            placeholder="1-31"
          />
        </div>
        {frequency === 'anual' && (
          <div style={{ flex: 1 }}>
            <label className="fz-field-label" htmlFor="fz-rec-month">
              Mes
            </label>
            <select id="fz-rec-month" className="fz-input" value={monthOfYear} onChange={e => setMonthOfYear(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {frequency === 'mensual' && Number(dayOfMonth) === 31 && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: -8 }}>
          En los meses más cortos cae el último día del mes, nunca se corre al siguiente.
        </p>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-rec-starts">
          Desde
        </label>
        <input id="fz-rec-starts" type="date" className="fz-input" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
          Desde qué período aplica. En el pasado, recuperás los meses que ya pasaron; en el futuro, no lo pide hasta que llegue.
        </p>
      </div>

      {type === 'gasto' && !isSavings && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={shared}
              onChange={e => {
                setShared(e.target.checked)
                if (!e.target.checked) setSplits([])
              }}
            />
            Es compartido
          </label>
          {shared && (
            <div style={{ marginTop: 8 }}>
              <RecurringSplitEditor currency={currency} splits={splits} onChange={setSplits} />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-rec-note">
          Nota (opcional)
        </label>
        <input id="fz-rec-note" className="fz-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Ej. vence el 5" />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear fijo'}
      </Btn>
    </div>
  )
}

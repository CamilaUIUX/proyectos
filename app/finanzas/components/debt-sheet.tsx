'use client'

import { useState } from 'react'
import { parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { PersonPicker } from './person-picker'
import { useFinanzas } from './data-context'

/** Alta de una deuda suelta — nunca toca ninguna cuenta (sprint-2-deudas.md
 * §4.1). Sin modo edición todavía: corregir una deuda mal cargada es
 * borrarla y volver a crearla, mismo criterio que "Actualizar valor" del
 * repo de referencia para no sumar complejidad sin un caso real que la pida. */
export function DebtSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Nueva deuda">
      {/* Solo se monta mientras está abierto: así el formulario siempre
       * arranca en blanco, sin un efecto que lo tenga que resetear a mano
       * (mismo criterio que <QuickAddForm> en quick-add.tsx). */}
      {open && <DebtForm onClose={onClose} />}
    </Sheet>
  )
}

function DebtForm({ onClose }: { onClose: () => void }) {
  const { createDebt } = useFinanzas()
  const [personId, setPersonId] = useState<string | null>(null)
  const [concept, setConcept] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [incurredOn, setIncurredOn] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!personId) return setError('Elegí o creá una persona.')
    if (!concept.trim()) return setError('¿De qué es esta deuda?')
    const amount = parseDecimalInput(amountRaw)
    if (!amount || amount <= 0) return setError('Ingresa un monto válido.')

    setSubmitting(true)
    const result = await createDebt({ person_id: personId, concept: concept.trim(), amount, currency, incurred_on: incurredOn })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    // Sin reset manual de campos: cerrar desmonta <DebtForm> (ver
    // <DebtSheet> arriba), así que la próxima apertura ya arranca en blanco.
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <label className="fz-field-label">Persona</label>
        <PersonPicker value={personId} onChange={setPersonId} />
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-debt-concept">
          ¿De qué es?
        </label>
        <input
          id="fz-debt-concept"
          className="fz-input"
          value={concept}
          onChange={e => setConcept(e.target.value)}
          placeholder="Ej. Le presté para el taxi"
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-debt-amount">
            Monto
          </label>
          <input
            id="fz-debt-amount"
            className="fz-input"
            inputMode="decimal"
            value={amountRaw}
            onChange={e => setAmountRaw(e.target.value)}
            placeholder="0"
          />
        </div>
        <div style={{ width: 110 }}>
          <label className="fz-field-label" htmlFor="fz-debt-currency">
            Moneda
          </label>
          <select id="fz-debt-currency" className="fz-input" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-debt-date">
          Fecha
        </label>
        <input id="fz-debt-date" type="date" className="fz-input" value={incurredOn} onChange={e => setIncurredOn(e.target.value)} />
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Guardando…' : 'Registrar deuda'}
      </Btn>
    </div>
  )
}

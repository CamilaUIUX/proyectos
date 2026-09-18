'use client'

import { useState } from 'react'
import { IconInfoCircle } from '@tabler/icons-react'
import { formatMoney, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { applyInterest, generateInstallments } from '@/lib/finanzas/plans'
import type { Currency, Debt } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

export interface InstallmentRow {
  date: string
  amountRaw: string
}

/** Filas de cuota editables con su total corriente — mismo criterio que
 *  <SplitEditor> (split-editor.tsx): la sugerencia se recalcula entera
 *  cuando cambia un parámetro de arriba (cuotas, interés, fecha), pero cada
 *  monto y cada fecha quedan editables a mano después de eso (sprint-4-planes-de-pago.md
 *  §0: un solo flujo, siempre editable, sin un "modo manual" aparte). Se
 *  reutiliza también desde <PlanDetailSheet> para regenerar. */
export function InstallmentEditor({
  rows,
  currency,
  onChange,
}: {
  rows: InstallmentRow[]
  currency: Currency
  onChange: (rows: InstallmentRow[]) => void
}) {
  function setRow(i: number, patch: Partial<InstallmentRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const sum = rows.reduce((acc, r) => acc + (parseDecimalInput(r.amountRaw) ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 20, fontSize: 12, color: 'var(--fz-ink-3)', fontWeight: 700 }}>{i + 1}</span>
          <input
            type="date"
            className="fz-input"
            style={{ flex: '0 0 148px' }}
            value={r.date}
            onChange={e => setRow(i, { date: e.target.value })}
          />
          <div className="fz-amount-field" style={{ flex: 1 }}>
            <span className="fz-amount-field__code">{currency}</span>
            <input inputMode="decimal" value={r.amountRaw} onChange={e => setRow(i, { amountRaw: e.target.value })} />
          </div>
        </div>
      ))}
      {rows.length > 0 && <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>Suman: {formatMoney(sum, currency)}</p>}
    </div>
  )
}

function suggestRows(base: number, count: number, startDate: string, currency: Currency): InstallmentRow[] {
  if (count <= 0 || !startDate) return []
  return generateInstallments(base, count, startDate, currency).map(inst => ({ date: inst.date, amountRaw: String(inst.amount) }))
}

/** Convierte una deuda suelta y pendiente en un plan de cuotas
 *  (sprint-4-planes-de-pago.md §4.1/§4.3). Solo se ofrece desde <DeudasPage>
 *  para deudas sin `plan_id` ni `origin_transaction_id` — createDebtPlan()
 *  en data-context.tsx igual lo revalida antes de escribir. */
export function PlanSheet({ open, onClose, debt }: { open: boolean; onClose: () => void; debt: Debt | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Planificar en cuotas">
      {/* Solo se monta mientras está abierto, mismo criterio que <DebtForm> —
       * así el formulario siempre arranca en blanco. */}
      {open && debt && <PlanForm debt={debt} onClose={onClose} />}
    </Sheet>
  )
}

function PlanForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const { createDebtPlan } = useFinanzas()
  const [count, setCount] = useState(3)
  const [interestRaw, setInterestRaw] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [rows, setRows] = useState<InstallmentRow[]>(() => suggestRows(debt.amount, 3, todayISO(), debt.currency))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interestRate = parseDecimalInput(interestRaw)
  const totalWithInterest = roundFor(applyInterest(debt.amount, interestRate), debt.currency)

  function regenerate(nextCount: number, nextInterestRaw: string, nextStartDate: string) {
    const nextInterest = parseDecimalInput(nextInterestRaw)
    const nextTotal = roundFor(applyInterest(debt.amount, nextInterest), debt.currency)
    setRows(suggestRows(nextTotal, nextCount, nextStartDate, debt.currency))
  }

  async function handleSubmit() {
    setError(null)
    if (rows.length === 0) return setError('Elegí al menos una cuota.')
    const installments = rows.map(r => ({ amount: parseDecimalInput(r.amountRaw) ?? 0, date: r.date }))
    if (installments.some(i => i.amount <= 0)) return setError('Cada cuota necesita un monto mayor a 0.')
    if (installments.some(i => !i.date)) return setError('Cada cuota necesita una fecha.')

    setSubmitting(true)
    const result = await createDebtPlan({ debt_id: debt.id, installments })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    // Sin reset manual: cerrar desmonta <PlanForm> (ver <PlanSheet> arriba).
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <p style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>
        {debt.concept} · {formatMoney(debt.amount, debt.currency)}
      </p>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-plan-count">
            Cuotas
          </label>
          <input
            id="fz-plan-count"
            className="fz-input"
            type="number"
            min={1}
            value={count}
            onChange={e => {
              const n = Math.max(1, Math.trunc(Number(e.target.value)) || 1)
              setCount(n)
              regenerate(n, interestRaw, startDate)
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-plan-interest">
            Interés % (opcional)
          </label>
          <input
            id="fz-plan-interest"
            className="fz-input"
            inputMode="decimal"
            value={interestRaw}
            onChange={e => {
              setInterestRaw(e.target.value)
              regenerate(count, e.target.value, startDate)
            }}
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-plan-start">
          Primera cuota
        </label>
        <input
          id="fz-plan-start"
          type="date"
          className="fz-input"
          value={startDate}
          onChange={e => {
            setStartDate(e.target.value)
            regenerate(count, interestRaw, e.target.value)
          }}
        />
      </div>

      {interestRate ? (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <IconInfoCircle size={14} /> Con interés: {formatMoney(totalWithInterest, debt.currency)} en total, una sola vez (no compuesto).
        </p>
      ) : null}

      <InstallmentEditor rows={rows} currency={debt.currency} onChange={setRows} />

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Guardando…' : 'Crear plan'}
      </Btn>
    </div>
  )
}

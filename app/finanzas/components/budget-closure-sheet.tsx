'use client'

import { useState } from 'react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { periodLabel } from '@/lib/finanzas/budgets'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** La pregunta de fin de mes, una línea a la vez (sprint-5-presupuesto.md
 * §4.5): "¿llevás el sobrante / sobregasto al mes que viene, o se queda así?".
 * Encadena las que haya pendientes. */
export function BudgetClosureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { budgetView, closeBudgetPeriod, rates, activeProfile, hidden } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => maskAmount(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency), hidden)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = budgetView.pendingClosures[0]

  async function answer(carried: boolean) {
    if (!next) return
    setError(null)
    setSubmitting(true)
    const result = await closeBudgetPeriod(next.line_id, next.period, carried)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    // No cerramos el sheet: si quedan más, se muestra la siguiente; si no,
    // budgetView.pendingClosures queda vacío y el efecto de abajo cierra.
    if (budgetView.pendingClosures.length <= 1) onClose()
  }

  if (!open) return null

  return (
    <Sheet open={open} onClose={onClose} title={next ? 'Cerrar el mes' : 'Todo al día'}>
      {!next ? (
        <p style={{ fontSize: 14, color: 'var(--fz-ink-2)' }}>No queda ningún mes por cerrar.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
              {periodLabel(next.period)} — {next.title}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {next.available_usd >= 0
                ? `Te sobraron ${fmtUsd(next.available_usd)}`
                : `Te pasaste ${fmtUsd(Math.abs(next.available_usd))}`}
            </div>
          </div>

          {error && (
            <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
            <Btn variant="primary" block onClick={() => answer(true)} disabled={submitting}>
              {next.available_usd >= 0 ? 'Llevar al mes que viene' : 'Restar al mes que viene'}
            </Btn>
            <Btn variant="soft" block onClick={() => answer(false)} disabled={submitting}>
              {next.available_usd >= 0 ? 'Que quede así' : 'Que no afecte nada'}
            </Btn>
          </div>

          {budgetView.pendingClosures.length > 1 && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', textAlign: 'center' }}>
              Quedan {budgetView.pendingClosures.length - 1} más
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

'use client'

import { useMemo } from 'react'
import { IconArrowsExchange, IconEdit, IconMinus } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { SAVINGS_REASON_LABEL } from '@/lib/finanzas/savings'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Detalle de un ahorro: saldo, progreso a la meta, dónde está guardada la
 *  plata, el historial de aportes/retiros, y los accesos a editar, mover de
 *  cuenta y retirar (sprint-6-ahorro.md §7). */
export function SavingsDetailSheet({
  open,
  onClose,
  goalId,
  onEdit,
  onMove,
}: {
  open: boolean
  onClose: () => void
  goalId: string | null
  onEdit: () => void
  onMove: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="">
      {open && goalId && <SavingsDetail goalId={goalId} onClose={onClose} onEdit={onEdit} onMove={onMove} />}
    </Sheet>
  )
}

function SavingsDetail({
  goalId,
  onClose,
  onEdit,
  onMove,
}: {
  goalId: string
  onClose: () => void
  onEdit: () => void
  onMove: () => void
}) {
  const { savingsGoals, savingsView, accounts, allTx, openQuickAdd, rates, activeProfile, hidden } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))
  const goal = savingsGoals.find(g => g.id === goalId)
  const view = savingsView.goals.find(g => g.goal_id === goalId)
  const show = (t: string) => maskAmount(t, hidden)
  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name ?? '—'

  const history = useMemo(
    () =>
      allTx
        .filter(t => t.savings_goal_id === goalId && t.savings_flow)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 20),
    [allTx, goalId]
  )

  if (!goal || !view) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{goal.name}</span>
          <span className="fz-tabular" style={{ fontSize: 18, fontWeight: 700 }}>
            {show(formatMoney(view.balance_native, goal.input_currency))}
          </span>
        </div>
        {view.target_native != null && (
          <>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--fz-tint-neutral)', overflow: 'hidden', marginTop: 8 }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${view.progress_pct}%`,
                  background: view.goal_reached ? 'var(--fz-in)' : 'var(--fz-accent)',
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              {view.goal_reached ? 'Meta cumplida · ' : ''}
              meta {show(formatMoney(view.target_native, goal.input_currency))}
              {goal.input_currency !== displayCurrency && view.target_usd != null && ` (≈ ${fmtUsd(view.target_usd)})`}
            </div>
          </>
        )}
        <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: view.target_native != null ? 2 : 4 }}>
          {goal.is_catchall
            ? 'Recibe lo que sobre del reparto'
            : goal.allocation_type === 'percent'
              ? `${goal.allocation_value}% del sobrante cada mes`
              : `${show(formatMoney(goal.allocation_value, goal.input_currency))} por mes`}
        </div>
      </div>

      {view.by_account.length > 0 && (
        <div>
          <div className="fz-field-label">Dónde está guardado</div>
          {view.by_account.map(b => (
            <div key={b.account_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span>{accountName(b.account_id)}</span>
              <span className="fz-tabular">{show(formatMoney(b.amount, accounts.find(a => a.id === b.account_id)?.currency ?? goal.input_currency))}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
        <Btn size="sm" variant="soft" onClick={onEdit}>
          <IconEdit size={15} /> Editar
        </Btn>
        <Btn size="sm" variant="soft" onClick={onMove}>
          <IconArrowsExchange size={15} /> Mover
        </Btn>
        <Btn
          size="sm"
          variant="soft"
          onClick={() => {
            onClose()
            openQuickAdd({ lockType: 'gasto' })
          }}
        >
          <IconMinus size={15} /> Retirar
        </Btn>
      </div>

      {history.length > 0 && (
        <div>
          <div className="fz-field-label">Movimientos</div>
          {history.map(t => {
            const isAporte = t.savings_flow === 'aporte'
            const isTraslado = t.savings_flow === 'traslado'
            const label = isAporte ? 'Aporte' : isTraslado ? 'Traslado' : `Retiro · ${t.savings_reason ? SAVINGS_REASON_LABEL[t.savings_reason] : ''}`
            const amt = t.to_amount_usd ?? t.amount_usd
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--fz-hairline)' }}>
                <span style={{ color: 'var(--fz-ink-2)' }}>
                  {t.date.slice(5)} · {label}
                </span>
                <span
                  className="fz-tabular"
                  style={{ color: isAporte ? 'var(--fz-in-text)' : isTraslado ? 'var(--fz-ink-3)' : 'var(--fz-out-text)' }}
                >
                  {isAporte ? '+' : isTraslado ? '' : '−'}
                  {fmtUsd(isAporte ? amt : t.amount_usd)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { IconPigMoney, IconPlus } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { periodLabel } from '@/lib/finanzas/budgets'
import type { SavingsGoalView } from '@/lib/finanzas/savings'
import { Btn, EmptyState, Panel } from '../components/ui'
import { SavingsGoalSheet } from '../components/savings-goal-sheet'
import { SavingsSaveSheet } from '../components/savings-save-sheet'
import { SavingsMoveSheet } from '../components/savings-move-sheet'
import { SavingsDetailSheet } from '../components/savings-detail-sheet'
import { useFinanzas } from '../components/data-context'

export default function AhorroPage() {
  const { loading, error, savingsView, rates, activeProfile, hidden } = useFinanzas()
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [saveSheet, setSaveSheet] = useState<string | null>(null)
  const [moveSheet, setMoveSheet] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const show = (t: string) => maskAmount(t, hidden)
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))
  const visible = savingsView.goals.filter(g => !g.archived)
  // Sprint 10 §4.5 — mismo fin_savings_goals, mismo mecanismo: solo el
  // título cambia de tono en un perfil de negocio (reinversión, no ahorro personal).
  const negocio = activeProfile?.tipo === 'negocio'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{negocio ? 'Fondos de ahorro' : 'Ahorro'}</h1>
        <Btn size="sm" onClick={() => setGoalSheet({ open: true, id: null })}>
          <IconPlus size={16} /> {negocio ? 'Nuevo fondo' : 'Nuevo ahorro'}
        </Btn>
      </div>

      {error ? (
        <EmptyState icon={<IconPigMoney size={22} />} title={`No se pudo cargar ${negocio ? 'Fondos de ahorro' : 'Ahorro'}`} message={error} />
      ) : !loading && visible.length === 0 ? (
        <EmptyState
          icon={<IconPigMoney size={22} />}
          title={negocio ? 'Sin fondos todavía' : 'Sin ahorros todavía'}
          message={
            negocio
              ? 'Creá un fondo y, al cerrar cada mes, la app te propone cuánto apartar para reinvertir.'
              : 'Creá un ahorro y, al cerrar cada mes, la app te propone cuánto apartar según tu regla.'
          }
        />
      ) : (
        <>
          {savingsView.has_pending && (
            <Panel style={{ borderLeft: '3px solid var(--fz-save)' }}>
              <div style={{ fontWeight: 700, color: 'var(--fz-save-text)' }}>
                {negocio ? 'Es hora de organizar tus fondos' : 'Es hora de organizar tus ahorros'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fz-ink-2)', marginTop: 2 }}>
                {periodLabel(savingsView.period)} ya terminó. Guardá lo que dejó en cada plan
                {savingsView.surplus_usd > 0 && <> · sobrante {fmtUsd(savingsView.surplus_usd)}</>}.
              </div>
            </Panel>
          )}

          {savingsView.insufficient_for_fixed && (
            <p style={{ fontSize: 13, color: 'var(--fz-out-text)', fontWeight: 600 }}>
              El sobrante no alcanza para todos los aportes de monto fijo — ajustá los montos al guardar.
            </p>
          )}

          <Panel>
            {visible.map(g => (
              <GoalCard
                key={g.goal_id}
                view={g}
                onOpen={() => setDetailId(g.goal_id)}
                onSave={() => setSaveSheet(g.goal_id)}
              />
            ))}
          </Panel>

          {savingsView.unassigned_usd > 0 && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
              Sobran {fmtUsd(savingsView.unassigned_usd)} sin asignar. Marcá un ahorro como el que recibe lo
              que sobra para que no quede suelto.
            </p>
          )}
        </>
      )}

      <SavingsGoalSheet open={goalSheet.open} editingId={goalSheet.id} onClose={() => setGoalSheet({ open: false, id: null })} />
      <SavingsSaveSheet open={saveSheet != null} goalId={saveSheet} onClose={() => setSaveSheet(null)} />
      <SavingsMoveSheet open={moveSheet != null} goalId={moveSheet} onClose={() => setMoveSheet(null)} />
      <SavingsDetailSheet
        open={detailId != null}
        goalId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={() => {
          const id = detailId
          setDetailId(null)
          setGoalSheet({ open: true, id })
        }}
        onMove={() => {
          const id = detailId
          setDetailId(null)
          setMoveSheet(id)
        }}
      />
    </div>
  )
}

function GoalCard({ view, onOpen, onSave }: { view: SavingsGoalView; onOpen: () => void; onSave: () => void }) {
  const { hidden } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const pending = view.pending_amount_native != null && view.pending_amount_native > 0

  return (
    <div style={{ borderTop: '1px solid var(--fz-hairline)', padding: 'var(--fz-s3) 0' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={e => {
          if (e.key === 'Enter') onOpen()
        }}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, minWidth: 0 }} className="fz-truncate">
            {view.name}
            {view.goal_reached && (
              <span style={{ fontSize: 11, color: 'var(--fz-in-text)', fontWeight: 600 }}> · Meta cumplida</span>
            )}
          </span>
          <span className="fz-tabular" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {show(formatMoney(view.balance_native, view.currency))}
            {view.target_native != null && (
              <span style={{ color: 'var(--fz-ink-3)', fontWeight: 400 }}> / {show(formatMoney(view.target_native, view.currency))}</span>
            )}
          </span>
        </div>

        {view.target_native != null && (
          <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--fz-tint-neutral)', overflow: 'hidden', margin: '6px 0' }}>
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
        )}

        <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: view.target_native != null ? 0 : 4 }}>
          {view.is_catchall
            ? 'Recibe lo que sobre del reparto'
            : view.allocation_type === 'percent'
              ? `${view.allocation_value}% del sobrante`
              : `${show(formatMoney(view.allocation_value, view.currency))} por mes`}
        </div>
      </div>

      {pending && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>
            Acordaste {show(formatMoney(view.pending_amount_native!, view.currency))}
            {view.pending_capped && ' (ajustá al guardar)'}
          </span>
          <button
            type="button"
            className="fz-btn fz-btn--sm"
            style={{ background: 'var(--fz-save-tint)', color: 'var(--fz-save-text)' }}
            onClick={onSave}
          >
            Ahorrar
          </button>
        </div>
      )}
    </div>
  )
}

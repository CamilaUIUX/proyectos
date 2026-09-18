'use client'

import { useMemo, useState } from 'react'
import { IconCalendarPlus, IconEdit, IconPlayerPause, IconPlayerPlay, IconPlus, IconTrash, IconUsersGroup } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { todayISO } from '@/lib/finanzas/dates'
import { openUsdForRecurring, recurringStatus, sortByStatus, type RecurringState } from '@/lib/finanzas/recurring'
import type { Recurring } from '@/lib/finanzas/types'
import { Btn, EmptyState, Panel } from '../components/ui'
import { CategoryIcon } from '../components/category-icon'
import { RecurringSheet } from '../components/recurring-sheet'
import { RegisterSheet } from '../components/register-sheet'
import { useFinanzas } from '../components/data-context'

function stateLabel(state: RecurringState): string | null {
  if (state.status === 'vencido') {
    const extra = state.pendingCount > 1 ? ` · +${state.pendingCount - 1} sin registrar` : ''
    return `venció hace ${state.daysLate} ${state.daysLate === 1 ? 'día' : 'días'}${extra}`
  }
  if (state.status === 'pendiente' && state.oldest) {
    const extra = state.pendingCount > 1 ? ` · +${state.pendingCount - 1} sin registrar` : ''
    return `vence el ${state.oldest.due.slice(8)}${extra}`
  }
  if (state.status === 'programado') return 'todavía no arrancó'
  return null
}

function RecurringRow({
  recurring,
  state,
  sharedCount,
  openUsd,
  onRegister,
  onEdit,
  onPause,
  onDelete,
}: {
  recurring: Recurring
  state: RecurringState
  sharedCount: number
  openUsd: number
  onRegister?: () => void
  onEdit: () => void
  onPause: () => void
  onDelete: () => void
}) {
  const { rates, activeProfile, hidden } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const extra = stateLabel(state)
  const overdue = state.status === 'vencido'
  return (
    <div className="fz-tx-row">
      <CategoryIcon icon={recurring.icon} name={recurring.name} />
      <div className="fz-tx-row__body">
        <div className="fz-tx-row__title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="fz-truncate">{recurring.name}</span>
          {sharedCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--fz-ink-3)', fontWeight: 400 }}>
              <IconUsersGroup size={12} />
              {sharedCount}
            </span>
          )}
        </div>
        <div className="fz-tx-row__subtitle">
          {maskAmount(formatMoney(recurring.amount, recurring.currency), hidden)} ·{' '}
          {recurring.frequency === 'mensual' ? `día ${recurring.day_of_month}` : 'anual'}
          {!recurring.active && ' · pausado'}
          {openUsd > 0 && (
            <span style={{ color: 'var(--fz-accent)' }}> · te deben {maskAmount(formatMoney(fromUsd(openUsd, displayCurrency, rates), displayCurrency), hidden)}</span>
          )}
          {extra && (
            <>
              {' · '}
              <span style={{ color: overdue ? 'var(--fz-out-text)' : 'var(--fz-ink-3)', fontWeight: overdue ? 700 : 400 }}>{extra}</span>
            </>
          )}
        </div>
      </div>
      {onRegister && (
        <Btn size="sm" onClick={onRegister}>
          Registrar
        </Btn>
      )}
      <button type="button" className="fz-icon-btn" onClick={onEdit} aria-label="Editar">
        <IconEdit size={16} />
      </button>
      <button type="button" className="fz-icon-btn" onClick={onPause} aria-label={recurring.active ? 'Pausar' : 'Reanudar'}>
        {recurring.active ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
      </button>
      <button type="button" className="fz-icon-btn" style={{ color: 'var(--fz-out-text)' }} onClick={onDelete} aria-label="Borrar">
        <IconTrash size={16} />
      </button>
    </div>
  )
}

export default function FijosPage() {
  const { loading, error, recurring, recurringSplitsByTemplate, debts, allTx, updateRecurring, deleteRecurring } = useFinanzas()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [registerTarget, setRegisterTarget] = useState<{ recurring: Recurring; year: number; month: number } | null>(null)
  const [showPaused, setShowPaused] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const today = todayISO()
  const withState = useMemo(
    () => recurring.map(r => ({ recurring: r, state: recurringStatus(r, allTx, today) })),
    [recurring, allTx, today]
  )

  const pending = sortByStatus(withState.filter(x => x.state.status === 'vencido' || x.state.status === 'pendiente'))
  const registered = withState.filter(x => x.state.status === 'registrado')
  const scheduled = withState.filter(x => x.state.status === 'programado')
  const paused = withState.filter(x => x.state.status === 'pausado')

  const doneCount = registered.length
  const dueCount = pending.length + registered.length

  function openCreate() {
    setEditing(null)
    setSheetOpen(true)
  }
  function openEdit(r: Recurring) {
    setEditing(r)
    setSheetOpen(true)
  }
  function openRegister(r: Recurring, state: RecurringState) {
    if (!state.oldest) return
    setRegisterTarget({ recurring: r, year: state.oldest.year, month: state.oldest.month })
  }
  async function handlePauseToggle(r: Recurring) {
    const result = await updateRecurring(r.id, { active: !r.active })
    if (result.error) setActionError(result.error)
  }
  async function handleDelete(r: Recurring) {
    const result = await deleteRecurring(r.id)
    if (result.error) setActionError(result.error)
  }

  const renderRow = (x: { recurring: Recurring; state: RecurringState }, canRegister: boolean) => (
    <RecurringRow
      key={x.recurring.id}
      recurring={x.recurring}
      state={x.state}
      sharedCount={recurringSplitsByTemplate.get(x.recurring.id)?.length ?? 0}
      openUsd={openUsdForRecurring(x.recurring, allTx, debts)}
      onRegister={canRegister ? () => openRegister(x.recurring, x.state) : undefined}
      onEdit={() => openEdit(x.recurring)}
      onPause={() => handlePauseToggle(x.recurring)}
      onDelete={() => handleDelete(x.recurring)}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Fijos</h1>
        <Btn size="sm" onClick={openCreate}>
          <IconPlus size={16} /> Nuevo
        </Btn>
      </div>

      <Panel>
        <div style={{ fontSize: 13, color: 'var(--fz-ink-2)', fontWeight: 600 }}>Este período</div>
        <div className="fz-tabular" style={{ fontSize: 22, fontWeight: 700 }}>
          {doneCount} de {dueCount} registrados
        </div>
      </Panel>

      <Panel>
        {error ? (
          <EmptyState icon={<IconCalendarPlus size={22} />} title="No se pudieron cargar los fijos" message={error} />
        ) : !loading && recurring.length === 0 ? (
          <EmptyState
            icon={<IconCalendarPlus size={22} />}
            title="Sin fijos todavía"
            message="Creá el primero — alquiler, una suscripción, lo que se repita."
          />
        ) : (
          <>
            {actionError && (
              <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {actionError}
              </p>
            )}
            {pending.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fz-ink-2)', marginBottom: 6 }}>Pendientes</div>
                {pending.map(x => renderRow(x, true))}
              </div>
            )}
            {registered.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fz-ink-2)', marginBottom: 6 }}>Ya registrados</div>
                {registered.map(x => renderRow(x, false))}
              </div>
            )}
            {scheduled.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fz-ink-2)', marginBottom: 6 }}>Programados / otro mes</div>
                {scheduled.map(x => renderRow(x, false))}
              </div>
            )}
          </>
        )}
      </Panel>

      {paused.length > 0 && (
        <div>
          <button type="button" className="fz-link" onClick={() => setShowPaused(v => !v)}>
            {showPaused ? 'Ocultar pausados' : `Ver pausados (${paused.length})`}
          </button>
          {showPaused && <Panel style={{ marginTop: 'var(--fz-s3)' }}>{paused.map(x => renderRow(x, false))}</Panel>}
        </div>
      )}

      <RecurringSheet open={sheetOpen} onClose={() => setSheetOpen(false)} editing={editing} />
      {registerTarget && (
        <RegisterSheet
          open
          onClose={() => setRegisterTarget(null)}
          recurring={registerTarget.recurring}
          year={registerTarget.year}
          month={registerTarget.month}
        />
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { IconChartBar, IconPlus } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { periodLabel } from '@/lib/finanzas/budgets'
import type { BudgetBar as BudgetBarT, BudgetGeneralView, BudgetLineView } from '@/lib/finanzas/budgets'
import { Btn, EmptyState, Panel } from '../components/ui'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { BudgetClosureSheet } from '../components/budget-closure-sheet'
import { useFinanzas } from '../components/data-context'

function Bar({ bar }: { bar: BudgetBarT }) {
  const color = bar.danger ? 'var(--fz-out)' : 'var(--fz-accent)'
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--fz-tint-neutral)', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ position: 'absolute', inset: 0, width: `${bar.fillPct}%`, background: color, borderRadius: 999 }} />
      {bar.reservedPct > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${bar.fillPct}%`,
            width: `${bar.reservedPct}%`,
            background: 'repeating-linear-gradient(45deg, var(--fz-tint-neutral-fg) 0 3px, transparent 3px 6px)',
            opacity: 0.5,
          }}
        />
      )}
      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${bar.tickPct}% - 1px)`, width: 2, background: 'var(--fz-ink)' }} />
    </div>
  )
}

function LineCard({ view }: { view: BudgetLineView }) {
  const { hidden, budgetViewMode, rates, activeProfile } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))
  const cur = view.currency
  const noAmount = view.effective_usd == null

  const bigValue = budgetViewMode === 'disponible' ? view.available_native : view.spent_native
  const bigLabel = budgetViewMode === 'disponible' ? 'disponible' : 'gastado'

  return (
    <div style={{ borderTop: '1px solid var(--fz-hairline)', padding: 'var(--fz-s3) 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, minWidth: 0 }} className="fz-truncate">
          {view.title}
        </span>
        {noAmount ? (
          <span style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>sin monto</span>
        ) : (
          <span className="fz-tabular" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {show(formatMoney(view.spent_native, cur))} / {show(formatMoney(view.effective_native ?? 0, cur))}
          </span>
        )}
      </div>

      {!noAmount && <Bar bar={view.bar} />}

      <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {!noAmount && bigValue != null && (
          <span style={{ color: view.bar.danger ? 'var(--fz-out-text)' : 'var(--fz-ink-2)', fontWeight: 600 }}>
            {show(formatMoney(bigValue, cur))} {bigLabel}
          </span>
        )}
        {view.committed_usd > 0 && <span>comprometido {show(formatMoney(view.committed_native, cur))}</span>}
        {view.carried_usd !== 0 && <span>{view.carried_usd > 0 ? 'llevado' : 'restado'} del mes pasado {fmtUsd(Math.abs(view.carried_usd))}</span>}
        {cur !== displayCurrency && view.effective_usd != null && <span>≈ {fmtUsd(view.effective_usd)}</span>}
      </div>
    </div>
  )
}

function GeneralCard({ general }: { general: BudgetGeneralView }) {
  const { hidden, budgetViewMode, rates, activeProfile } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))
  const big = budgetViewMode === 'disponible' ? general.available_usd : general.spent_usd
  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>General</span>
        <span className="fz-tabular" style={{ fontWeight: 700 }}>
          {fmtUsd(general.spent_usd)} / {fmtUsd(general.effective_usd)}
        </span>
      </div>
      <Bar bar={general.bar} />
      <div style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
        <span style={{ color: general.bar.danger ? 'var(--fz-out-text)' : 'var(--fz-ink-2)', fontWeight: 600 }}>
          {fmtUsd(big)} {budgetViewMode === 'disponible' ? 'disponible' : 'gastado'}
        </span>
        {' · '}informativo, no bloquea
      </div>
    </Panel>
  )
}

export default function PresupuestoPage() {
  const { loading, error, budgetView, categories } = useFinanzas()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [closureOpen, setClosureOpen] = useState(false)
  const [actionError] = useState<string | null>(null)

  const categoriesWithLine = useMemo(() => {
    const s = new Set<string>()
    for (const v of budgetView.lines) for (const id of v.category_ids) s.add(id)
    return s
  }, [budgetView])
  const missingCategories = categories.filter(c => c.kind === 'gasto' && !c.archived && !categoriesWithLine.has(c.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          Presupuesto <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fz-ink-3)' }}>· {periodLabel(budgetView.period)}</span>
        </h1>
        <Btn
          size="sm"
          onClick={() => {
            setEditingId(null)
            setSheetOpen(true)
          }}
        >
          <IconPlus size={16} /> Nuevo
        </Btn>
      </div>

      {actionError && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {actionError}
        </p>
      )}

      {budgetView.pendingClosures.length > 0 && (
        <Panel style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Tenés {budgetView.pendingClosures.length} {budgetView.pendingClosures.length === 1 ? 'mes' : 'meses'} por cerrar
          </span>
          <Btn size="sm" variant="soft" onClick={() => setClosureOpen(true)}>
            Revisar
          </Btn>
        </Panel>
      )}

      {error ? (
        <EmptyState icon={<IconChartBar size={22} />} title="No se pudo cargar el presupuesto" message={error} />
      ) : !loading && budgetView.lines.length === 0 ? (
        <EmptyState
          icon={<IconChartBar size={22} />}
          title="Sin presupuesto todavía"
          message="Poné un tope a una categoría (o a un grupo de categorías) para empezar a controlar el mes."
        />
      ) : (
        <>
          {budgetView.general && <GeneralCard general={budgetView.general} />}
          <Panel>
            {budgetView.lines.map(v => (
              <div
                key={v.line_id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setEditingId(v.line_id)
                  setSheetOpen(true)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setEditingId(v.line_id)
                    setSheetOpen(true)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <LineCard view={v} />
              </div>
            ))}
          </Panel>
        </>
      )}

      {missingCategories.length > 0 && budgetView.lines.length > 0 && (
        <button
          type="button"
          className="fz-link"
          onClick={() => {
            setEditingId(null)
            setSheetOpen(true)
          }}
        >
          + Agregar presupuesto a {missingCategories.length} {missingCategories.length === 1 ? 'categoría' : 'categorías'} más
        </button>
      )}

      <BudgetLineSheet open={sheetOpen} onClose={() => setSheetOpen(false)} editingId={editingId} />
      <BudgetClosureSheet open={closureOpen} onClose={() => setClosureOpen(false)} />
    </div>
  )
}

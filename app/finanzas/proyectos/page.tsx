'use client'

import { useState } from 'react'
import { IconBriefcase, IconPlus } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import type { ProjectComparisonRow } from '@/lib/finanzas/projects'
import type { Currency } from '@/lib/finanzas/types'
import { Btn, EmptyState, Panel } from '../components/ui'
import { ProjectSheet } from '../components/project-sheet'
import { useFinanzas } from '../components/data-context'

/** Lista de proyectos + "Comparar" (sprint-10-perfiles-de-negocio.md §4.4) —
 *  una sola pantalla, sin ruta [id]: cada card ya muestra lo que hace falta
 *  (ganancia neta + progreso), y tocarla abre el sheet para editar/archivar
 *  (mismo criterio que Ahorro con `<GoalCard>`). La tabla de abajo es la
 *  misma `projectsView`, ya ordenada por ganancia — no hay un cálculo aparte
 *  para "comparar". */
export default function ProyectosPage() {
  const { loading, error, projectsView, activeProfile, hidden } = useFinanzas()
  const [sheet, setSheet] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [showArchived, setShowArchived] = useState(false)

  const displayCurrency = activeProfile?.display_currency ?? 'USD'

  const active = projectsView.filter(r => !r.project.archived)
  const archived = projectsView.filter(r => r.project.archived)

  if (error) {
    return <EmptyState icon={<IconBriefcase size={22} />} title="No se pudo cargar Proyectos" message={error} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Proyectos</h1>
        <Btn size="sm" onClick={() => setSheet({ open: true, id: null })}>
          <IconPlus size={16} /> Nuevo proyecto
        </Btn>
      </div>

      {!loading && active.length === 0 ? (
        <EmptyState
          icon={<IconBriefcase size={22} />}
          title="Sin proyectos todavía"
          message="Un proyecto es un trabajo puntual — creá uno con su objetivo y etiquetale movimientos desde el quick-add."
        />
      ) : (
        <Panel>
          {active.map(row => (
            <ProjectCard key={row.project.id} row={row} displayCurrency={displayCurrency} hidden={hidden} onOpen={() => setSheet({ open: true, id: row.project.id })} />
          ))}
        </Panel>
      )}

      {active.length > 1 && (
        <Panel>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Comparar</h2>
          <CompareTable rows={active} displayCurrency={displayCurrency} hidden={hidden} />
        </Panel>
      )}

      {archived.length > 0 && (
        <>
          <button type="button" className="fz-link" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Ocultar archivados' : `Ver archivados (${archived.length})`}
          </button>
          {showArchived && (
            <Panel>
              {archived.map(row => (
                <ProjectCard
                  key={row.project.id}
                  row={row}
                  displayCurrency={displayCurrency}
                  hidden={hidden}
                  onOpen={() => setSheet({ open: true, id: row.project.id })}
                />
              ))}
            </Panel>
          )}
        </>
      )}

      <ProjectSheet open={sheet.open} editingId={sheet.id} onClose={() => setSheet({ open: false, id: null })} />
    </div>
  )
}

function ProjectCard({
  row,
  displayCurrency,
  hidden,
  onOpen,
}: {
  row: ProjectComparisonRow
  displayCurrency: Currency
  hidden: boolean
  onOpen: () => void
}) {
  const { rates } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const fmt = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency, { signed: true }))
  const fmtPlain = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))
  const pct = Math.min(100, Math.max(0, row.pct))
  const over = row.pct > 100

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter') onOpen()
      }}
      style={{ borderTop: '1px solid var(--fz-hairline)', padding: 'var(--fz-s3) 0', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, minWidth: 0 }} className="fz-truncate">
          {row.project.name}
          {row.project.archived && <span style={{ fontSize: 11, color: 'var(--fz-ink-3)', fontWeight: 400 }}> · archivado</span>}
        </span>
        <span
          className="fz-tabular"
          style={{ fontWeight: 700, whiteSpace: 'nowrap', color: row.gananciaUsd >= 0 ? 'var(--fz-in-text)' : 'var(--fz-out-text)' }}
        >
          {fmt(row.gananciaUsd)}
        </span>
      </div>

      <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'var(--fz-tint-neutral)', overflow: 'hidden', margin: '6px 0' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: over ? 'var(--fz-out)' : 'var(--fz-accent)', borderRadius: 999 }} />
      </div>

      <div style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
        Gastado {fmtPlain(row.gastoUsd)} de {fmtPlain(row.targetUsd)}
        {over && ' · superado'}
      </div>
    </div>
  )
}

function CompareTable({
  rows,
  displayCurrency,
  hidden,
}: {
  rows: ProjectComparisonRow[]
  displayCurrency: Currency
  hidden: boolean
}) {
  const { rates } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const fmt = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency, { signed: true }))

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fz-tabular" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--fz-ink-3)', fontWeight: 600 }}>
            <th style={{ padding: '4px 8px 4px 0' }}>Proyecto</th>
            <th style={{ padding: '4px 8px', textAlign: 'right' }}>Ganancia neta</th>
            <th style={{ padding: '4px 0', textAlign: 'right' }}>% del objetivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.project.id} style={{ borderTop: '1px solid var(--fz-hairline)' }}>
              <td style={{ padding: '6px 8px 6px 0' }} className="fz-truncate">
                {row.project.name}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: row.gananciaUsd >= 0 ? 'var(--fz-in-text)' : 'var(--fz-out-text)', fontWeight: 700 }}>
                {fmt(row.gananciaUsd)}
              </td>
              <td style={{ padding: '6px 0', textAlign: 'right' }}>{row.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

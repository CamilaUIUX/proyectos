'use client'

import Link from 'next/link'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { fijosNeedAttention, pendingCount } from '@/lib/finanzas/recurring'
import { todayISO } from '@/lib/finanzas/dates'
import { moreItemsFor, type NavItem } from '../components/nav-items'
import { useFinanzas } from '../components/data-context'

/** Índice de las secciones que no entran en la tab bar (sprint-6-ahorro.md
 *  §0.1). Se arma desde `moreItemsFor(tipo)`, así que sumar una pantalla en
 *  nav-items la trae acá sin tocar este archivo. En escritorio la sidebar ya
 *  lista todo — esta ruta queda como índice redundante pero válido. */
export default function MasPage() {
  const { loading, activeRecurring, allTx, pendingDebtUsd, dueDebtUsd, budgetView, savingsView, projectsView, activeProfile, rates, hidden } = useFinanzas()
  const show = (t: string) => maskAmount(t, hidden)
  const today = todayISO()
  const moreItems = moreItemsFor(activeProfile?.tipo ?? 'personal')
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))

  const meta: Record<string, { text: string; alert?: boolean } | undefined> = {}
  if (!loading) {
    if (pendingDebtUsd > 0) {
      meta['/finanzas/deudas'] = { text: `${fmtUsd(pendingDebtUsd)} por cobrar`, alert: dueDebtUsd > 0 }
    }

    const { registered, total } = pendingCount(activeRecurring, allTx, today)
    if (fijosNeedAttention(activeRecurring, allTx, today)) meta['/finanzas/fijos'] = { text: `${registered} de ${total} registrados`, alert: true }
    else if (total > registered) meta['/finanzas/fijos'] = { text: `${registered} de ${total} registrados` }

    if (budgetView.pendingClosures.length > 0) {
      meta['/finanzas/presupuesto'] = {
        text: `${budgetView.pendingClosures.length} ${budgetView.pendingClosures.length === 1 ? 'mes' : 'meses'} por cerrar`,
        alert: true,
      }
    }

    if (savingsView.has_pending) meta['/finanzas/ahorro'] = { text: 'Mes por organizar', alert: true }
    else if (savingsView.goals.length > 0) meta['/finanzas/ahorro'] = { text: fmtUsd(savingsView.total_saved_usd) }

    const activeProjects = projectsView.filter(p => !p.project.archived)
    if (activeProjects.length > 0) {
      meta['/finanzas/proyectos'] = { text: `${activeProjects.length} activo${activeProjects.length === 1 ? '' : 's'}` }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Más</h1>
        <p style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>Todo lo que no entra en la barra</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 'var(--fz-s3)',
        }}
      >
        {moreItems.map(item => (
          <MoreCard key={item.href} item={item} meta={meta[item.href]} />
        ))}
      </div>
    </div>
  )
}

function MoreCard({ item, meta }: { item: NavItem; meta?: { text: string; alert?: boolean } }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className="fz-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 'var(--fz-s3)',
        aspectRatio: '1 / 1',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--fz-tint-neutral)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} stroke={1.9} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }} className="fz-truncate">
          {item.label}
        </div>
        <div
          className="fz-truncate fz-tabular"
          style={{
            fontSize: 12,
            marginTop: 2,
            fontWeight: meta ? 600 : 400,
            color: meta?.alert ? 'var(--fz-out-text)' : 'var(--fz-ink-3)',
          }}
        >
          {meta?.text ?? item.description}
        </div>
      </div>
    </Link>
  )
}

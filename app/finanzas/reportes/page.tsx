'use client'

import { useMemo, useState } from 'react'
import { IconReceipt2 } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { currentMonthKey } from '@/lib/finanzas/dates'
import { groupByCategory } from '@/lib/finanzas/transactions'
import { EmptyState, Panel, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/category-icon'
import { TxRow } from '../components/tx-row'
import { useFinanzas } from '../components/data-context'

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

/** Reporte mensual: el gasto real del mes elegido, dividido por categoría —
 *  cada una con su % del total y la lista de sus movimientos (con lo que se
 *  escribió en cada uno), para poder mirar hacia atrás un mes ya cerrado y
 *  no solo "este mes" como la Home. Mismo filtro que <CategoryPie> de la
 *  Home (groupByCategory: gasto + flow_type='consumo'), así que el total de
 *  acá siempre coincide con "Gastos del mes · bruto" cuando el mes elegido
 *  es el actual. */
export default function ReportesPage() {
  const { loading, error, feedTx, categories, rates, activeProfile, hidden, openQuickAdd } = useFinanzas()
  const [month, setMonth] = useState(currentMonthKey())
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const show = (text: string) => maskAmount(text, hidden)
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency))

  const monthTx = useMemo(() => feedTx.filter(t => t.date.slice(0, 7) === month), [feedTx, month])
  const groups = useMemo(() => groupByCategory(monthTx), [monthTx])
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const total = useMemo(() => groups.reduce((sum, g) => sum + g.usd, 0), [groups])

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s6)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Reporte mensual</h1>
        <EmptyState icon={<IconReceipt2 size={24} />} title="No se pudo cargar el reporte" message={error} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--fz-s2)', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Reporte mensual</h1>
        <input type="month" className="fz-input" style={{ width: 'auto' }} value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fz-ink-2)', textTransform: 'capitalize' }}>Gastado en {monthLabel(month)}</div>
        {loading ? <Skeleton w={160} h={36} /> : <div className="fz-tabular" style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>{fmtUsd(total)}</div>}
      </Panel>

      {loading ? (
        <Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
          </div>
        </Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<IconReceipt2 size={22} />}
            title="No hay gastos en este mes"
            message="Elegí otro mes o registrá un gasto para verlo acá."
          />
        </Panel>
      ) : (
        groups.map(g => {
          const category = g.category_id ? categoryById.get(g.category_id) : undefined
          const pct = total > 0 ? (g.usd / total) * 100 : 0
          return (
            <Panel key={g.category_id ?? 'sin-categoria'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fz-s3)', marginBottom: 'var(--fz-s2)' }}>
                <CategoryIcon icon={category?.icon} name={category?.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fz-truncate" style={{ fontSize: 15, fontWeight: 700 }}>
                    {category?.name ?? 'Sin categoría'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
                    {g.transactions.length} {g.transactions.length === 1 ? 'movimiento' : 'movimientos'} · {pct.toFixed(0)}%
                  </div>
                </div>
                <div className="fz-tabular" style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{fmtUsd(g.usd)}</div>
              </div>
              {g.transactions.map(tx => (
                <TxRow key={tx.id} tx={tx} onClick={() => openQuickAdd({ editing: tx })} />
              ))}
            </Panel>
          )
        })
      )}
    </div>
  )
}

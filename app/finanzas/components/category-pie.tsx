'use client'

import { useMemo } from 'react'
import { IconChartPie } from '@tabler/icons-react'
import { categoryBreakdown } from '@/lib/finanzas/transactions'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { colorForIndex, OTHER_COLOR } from '@/lib/finanzas/palette'
import type { Category, RatesMap, Transaction } from '@/lib/finanzas/types'
import { CategoryIcon } from './category-icon'
import { EmptyState, Panel, SectionTitle, Skeleton } from './ui'

// Como mucho 6 porciones con color propio — pasado eso, la lectura de un pie
// se degrada (dataviz: "7-8 es el techo, después se pliega a 'Otras'"). Se
// queda corto a propósito del techo documentado para que "Otras" tenga
// siempre un tamaño que valga la pena mostrar.
const MAX_SLICES = 6
const RADIUS = 50
const STROKE = 18
const CIRC = 2 * Math.PI * RADIUS
// Separación visible entre porciones (dataviz: "2px de aire entre rellenos
// adyacentes"), restada del largo de cada arco antes de dibujarlo.
const GAP = 3

interface Slice {
  key: string
  name: string
  icon: string | null
  usd: number
  pct: number
  color: string
}

/** Gasto por categoría del mes en curso, en una dona SVG (sin librería de
 *  charting) + leyenda. Usa el mismo filtro que categoryBreakdown()
 *  (gasto + flow_type='consumo'), así que el total del centro siempre
 *  coincide con "Gastos del mes · bruto" del panel de arriba — nunca un
 *  segundo cálculo del mismo número que se pueda desincronizar. */
export function CategoryPie({
  monthTx,
  categories,
  rates,
  hidden,
  loading,
}: {
  monthTx: Transaction[]
  categories: Category[]
  rates: RatesMap
  hidden: boolean
  loading: boolean
}) {
  const show = (text: string) => maskAmount(text, hidden)
  // A pedido: este gráfico siempre muestra en bolivianos, sin importar la
  // moneda de visualización del perfil (a diferencia del resto de la Home).
  const fmtUsd = (usd: number) => show(formatMoney(fromUsd(usd, 'BOB', rates), 'BOB'))

  // Color estable por categoría: por su posición entre las categorías de
  // GASTO (ya vienen ordenadas por sort_order desde data-context), nunca
  // por cuánto se gastó este mes en particular — así una categoría no
  // cambia de color de un mes a otro solo porque el ranking se movió.
  const colorByCategoryId = useMemo(() => {
    const gastoCategories = categories.filter(c => c.kind === 'gasto')
    return new Map(gastoCategories.map((c, i) => [c.id, colorForIndex(i)]))
  }, [categories])
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const { total, slices } = useMemo(() => {
    const raw = categoryBreakdown(monthTx)
    const total = raw.reduce((sum, r) => sum + r.usd, 0)
    if (total <= 0) return { total, slices: [] as Slice[] }

    const top = raw.slice(0, MAX_SLICES)
    const restUsd = raw.slice(MAX_SLICES).reduce((sum, r) => sum + r.usd, 0)

    const slices: Slice[] = top.map(r => {
      const category = r.category_id ? categoryById.get(r.category_id) : undefined
      return {
        key: r.category_id ?? 'sin-categoria',
        name: category?.name ?? 'Sin categoría',
        icon: category?.icon ?? null,
        usd: r.usd,
        pct: (r.usd / total) * 100,
        color: (r.category_id && colorByCategoryId.get(r.category_id)) || OTHER_COLOR,
      }
    })
    if (restUsd > 0) {
      slices.push({ key: 'otras', name: 'Otras', icon: null, usd: restUsd, pct: (restUsd / total) * 100, color: OTHER_COLOR })
    }
    return { total, slices }
  }, [monthTx, categoryById, colorByCategoryId])

  if (loading) {
    return (
      <Panel>
        <SectionTitle title="Gastos por categoría" href="/finanzas/reportes" actionLabel="Ver reporte" />
        <div className="fz-pie-layout">
          <Skeleton w={160} h={160} radius={999} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 220 }}>
            <Skeleton w="100%" h={20} />
            <Skeleton w="100%" h={20} />
            <Skeleton w="100%" h={20} />
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionTitle title="Gastos por categoría" href="/finanzas/reportes" actionLabel="Ver reporte" />
      {total <= 0 ? (
        <EmptyState
          icon={<IconChartPie size={22} />}
          title="Todavía no hay gastos este mes"
          message="Cuando registres uno, acá vas a ver en qué se te va la plata."
        />
      ) : (
        <div className="fz-pie-layout">
          <div className="fz-donut-wrap">
            <svg viewBox="0 0 120 120" width={160} height={160}>
              <g transform="rotate(-90 60 60)">
                {(() => {
                  let offset = 0
                  return slices.map(s => {
                    const dash = (s.pct / 100) * CIRC
                    const node = (
                      <circle
                        key={s.key}
                        cx={60}
                        cy={60}
                        r={RADIUS}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={`${Math.max(dash - GAP, 0)} ${CIRC}`}
                        strokeDashoffset={-offset}
                      />
                    )
                    offset += dash
                    return node
                  })
                })()}
              </g>
            </svg>
            <div className="fz-donut-center">
              <div className="fz-tabular" style={{ fontSize: 17, fontWeight: 700 }}>
                {fmtUsd(total)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fz-ink-3)' }}>gastado</div>
            </div>
          </div>
          <div className="fz-legend-list">
            {slices.map(s => (
              <div key={s.key} className="fz-legend-row">
                <span className="fz-legend-dot" style={{ background: s.color }} />
                <CategoryIcon icon={s.icon} name={s.name} size="sm" />
                <span className="fz-legend-name fz-truncate">{s.name}</span>
                <span className="fz-legend-value fz-tabular">
                  {s.pct.toFixed(0)}% · {fmtUsd(s.usd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navItemsFor, isNavActive } from './nav-items'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { CURRENCY_META, RATE_CURRENCIES } from '@/lib/finanzas/types'

/** Navegación de escritorio: sidebar fija +, al pie, la tarjeta de tipo de
 * cambio — el slot que en la referencia ocupa "Upgrade to Pro" (§3 de
 * contexto_ui_finanzas.md del repo de referencia). Solo lectura: editar la
 * tasa vive en Ajustes. */
export function Sidebar() {
  const pathname = usePathname()
  const { rates, activeProfile } = useFinanzas()
  const items = navItemsFor(activeProfile?.tipo ?? 'personal')

  return (
    <aside className="fz-sidebar">
      <div className="fz-sidebar__brand">Finanzas</div>

      <nav className="fz-sidebar__nav">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="fz-sidebar__link" data-active={isNavActive(pathname, item.href)}>
            <item.icon size={19} stroke={1.8} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="fz-sidebar__rate-card">
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fz-ink-2)' }}>Tipo de cambio</span>
        {RATE_CURRENCIES.map(cur => (
          <div key={cur} className="fz-sidebar__rate-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CurrencyIcon currency={cur} size={20} /> {cur}
            </span>
            <span className="fz-tabular" style={{ fontWeight: 600 }}>
              {/* decimalsFor() es la precisión de un MONTO en esa moneda (8
               * para BTC); una tasa de cambio necesita la suya propia —
               * CURRENCY_META[cur].decimals (4 para USDT/USDC, 2 para BOB
               * y BTC). Usar la de monto acá mostraba "1" en vez de
               * "1.0000" para USDT, y "65000.12345678" para BTC en vez de
               * "65000.12" — bug real encontrado en la revisión del Sprint 1. */}
              {rates[cur].toLocaleString('en-US', { maximumFractionDigits: CURRENCY_META[cur].decimals })}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}

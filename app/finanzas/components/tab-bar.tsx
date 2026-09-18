'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconPlus } from '@tabler/icons-react'
import { MORE_ITEM, moreItemsFor, navItemsFor, isNavActive } from './nav-items'
import { useFinanzas } from './data-context'

/** "Más" queda marcado también cuando estás en una de sus secciones (Deudas,
 *  Fijos, …), no solo en /finanzas/mas. */
function isTabActive(pathname: string | null, href: string, moreItems: { href: string }[]) {
  if (href === MORE_ITEM.href) {
    return isNavActive(pathname, MORE_ITEM.href) || moreItems.some(i => isNavActive(pathname, i.href))
  }
  return isNavActive(pathname, href)
}

/** Tab bar flotante liquid-glass, solo móvil (ver theme.css .fz-tabbar).
 * 5 slots: Inicio · Movimientos · (+) · Más · Ajustes — el (+) abre el
 * quick-add desde cualquier pantalla, sin selector de tipo. "Más"
 * (sprint-6-ahorro.md §0.1) agrupa Deudas · Fijos · Presupuesto · Ahorro ·
 * Cuentas (y Proyectos en un perfil `negocio`, sprint-10 §4.1); Cuentas
 * salió de la tab bar para hacerle lugar. */
export function TabBar() {
  const pathname = usePathname()
  const { openQuickAdd, activeProfile } = useFinanzas()
  const tipo = activeProfile?.tipo ?? 'personal'
  const moreItems = moreItemsFor(tipo)
  const destinations = navItemsFor(tipo).filter(item => item.mobileTab === true)
  const tabItems = [...destinations.slice(0, 2), MORE_ITEM, ...destinations.slice(2)]
  const [left, right] = [tabItems.slice(0, 2), tabItems.slice(2)]

  return (
    <nav className="fz-tabbar" aria-label="Navegación de Finanzas">
      {left.map(item => (
        <Link key={item.href} href={item.href} className="fz-tabbar__item" data-active={isTabActive(pathname, item.href, moreItems)}>
          <item.icon size={22} stroke={1.8} />
          <span>{item.label}</span>
        </Link>
      ))}

      <button
        type="button"
        className="fz-tabbar__fab"
        onClick={() => openQuickAdd()}
        aria-label="Nuevo movimiento"
      >
        <IconPlus size={24} stroke={2.2} />
      </button>

      {right.map(item => (
        <Link key={item.href} href={item.href} className="fz-tabbar__item" data-active={isTabActive(pathname, item.href, moreItems)}>
          <item.icon size={22} stroke={1.8} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}

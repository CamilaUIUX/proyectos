import {
  IconHome2,
  IconArrowsLeftRight,
  IconCalendarRepeat,
  IconChartBar,
  IconChartPie,
  IconDots,
  IconPigMoney,
  IconBriefcase,
  IconWallet,
  IconSettings,
  IconUsersGroup,
  type Icon,
} from '@tabler/icons-react'

export interface NavItem {
  href: string
  label: string
  icon: Icon
  /** true = ocupa una de las 4 ranuras de destino de la tab bar de móvil.
   *  Todo lo demás cae en la pantalla "Más" (sprint-6-ahorro.md §0.1) — no
   *  hay que tocar <MasScreen> para sumar una sección, alcanza con no marcar
   *  `mobileTab`. */
  mobileTab?: boolean
  /** La bajada de la card en /finanzas/mas. La tab bar y la sidebar solo
   *  muestran el label. */
  description?: string
}

export type ProfileTipo = 'personal' | 'negocio'

/** Los destinos reales, en el orden de la sidebar de escritorio. "Más" NO
 *  está acá: no es una sección, es la puerta a las que no entran en la tab
 *  bar — en escritorio la sidebar ya las lista todas.
 *
 *  Función de `tipo` desde el Sprint 10 (perfiles de negocio), no una
 *  constante — antes de eso el nav era el mismo para cualquier perfil.
 *  `negocio` suma "Proyectos" y relabela "Ahorro" a "Fondos de ahorro"
 *  (mismo `fin_savings_goals` de siempre, solo cambia el nombre y el copy —
 *  sprint-10-perfiles-de-negocio.md §4.5). */
export function navItemsFor(tipo: ProfileTipo): NavItem[] {
  const negocio = tipo === 'negocio'
  return [
    { href: '/finanzas', label: 'Inicio', icon: IconHome2, mobileTab: true },
    { href: '/finanzas/movimientos', label: 'Movimientos', icon: IconArrowsLeftRight, mobileTab: true },
    {
      href: '/finanzas/deudas',
      label: 'Deudas',
      icon: IconUsersGroup,
      description: 'Lo que te deben, venga de donde venga',
    },
    {
      href: '/finanzas/fijos',
      label: 'Fijos',
      icon: IconCalendarRepeat,
      description: 'Lo que pagás todos los meses',
    },
    {
      href: '/finanzas/presupuesto',
      label: 'Presupuesto',
      icon: IconChartBar,
      description: 'Cuánto te queda por categoría, y en general',
    },
    {
      href: '/finanzas/reportes',
      label: 'Reportes',
      icon: IconChartPie,
      description: 'El gasto de cualquier mes, dividido por categoría',
    },
    ...(negocio
      ? [
          {
            href: '/finanzas/proyectos',
            label: 'Proyectos',
            icon: IconBriefcase,
            description: 'Ganancia neta de cada trabajo puntual, y compararlos entre sí',
          },
        ]
      : []),
    {
      href: '/finanzas/ahorro',
      label: negocio ? 'Fondos de ahorro' : 'Ahorro',
      icon: IconPigMoney,
      description: negocio
        ? 'El sobrante de cada mes, apartado para reinvertir'
        : 'El sobrante de cada mes, repartido en tus ahorros',
    },
    {
      href: '/finanzas/cuentas',
      label: 'Cuentas',
      icon: IconWallet,
      description: 'Dónde está tu plata',
    },
    { href: '/finanzas/ajustes', label: 'Ajustes', icon: IconSettings, mobileTab: true },
  ]
}

/** El acceso a "Más" en la tab bar de móvil. Vive fuera de `navItemsFor` porque
 *  no es un destino real (la sidebar de escritorio no lo muestra). */
export const MORE_ITEM: NavItem = { href: '/finanzas/mas', label: 'Más', icon: IconDots }

/** Lo que se lista como cards dentro de /finanzas/mas — todo lo que no entra
 *  en la tab bar. */
export function moreItemsFor(tipo: ProfileTipo): NavItem[] {
  return navItemsFor(tipo).filter(i => i.mobileTab !== true)
}

/** "¿Este link está activo?" — vivía copiado igual en <TabBar> y
 * <Sidebar> (hallazgo repetido en las revisiones de Sprint 2 y Sprint 3):
 * justo lo que este archivo existe para evitar. Inicio es exacto porque
 * cualquier otra ruta empieza con "/finanzas" también. */
export function isNavActive(pathname: string | null, href: string): boolean {
  return href === '/finanzas' ? pathname === '/finanzas' : (pathname?.startsWith(href) ?? false)
}

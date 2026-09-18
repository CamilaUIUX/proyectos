'use client'

import {
  IconToolsKitchen2,
  IconCar,
  IconHome,
  IconBolt,
  IconDeviceMobile,
  IconHeartbeat,
  IconMovie,
  IconPackage,
  IconBriefcase,
  IconDeviceLaptop,
  IconGift,
  IconCoins,
  IconArrowsExchange,
  type Icon,
  type IconProps,
} from '@tabler/icons-react'

// Slug -> componente de ícono. Ver lib/finanzas/types.ts (CATEGORY_ICON_MAP)
// para la tabla equivalente en texto — se mantienen sincronizados a mano
// porque son 12 entradas fijas, no vale la pena una indirección extra.
const ICONS: Record<string, Icon> = {
  comida: IconToolsKitchen2,
  transporte: IconCar,
  vivienda: IconHome,
  servicios: IconBolt,
  suscripciones: IconDeviceMobile,
  salud: IconHeartbeat,
  ocio: IconMovie,
  otros_gasto: IconPackage,
  sueldo: IconBriefcase,
  freelance: IconDeviceLaptop,
  extraordinario: IconGift,
  otros_ingreso: IconCoins,
}

/** Chip cuadrado (squircle) en tinte neutro con un ícono de línea — nunca
 * a color, nunca emoji (contexto_ui_finanzas.md §13-15 del repo de
 * referencia). Único fallback: la inicial del nombre. */
export function CategoryIcon({
  icon,
  name,
  size = 'md',
  iconProps,
}: {
  icon?: string | null
  name?: string
  size?: 'sm' | 'md'
  iconProps?: IconProps
}) {
  const Cmp = (icon && ICONS[icon]) || null
  const px = size === 'sm' ? 16 : 20
  return (
    <div className={`fz-icon-chip${size === 'sm' ? ' fz-icon-chip--sm' : ''}`}>
      {Cmp ? (
        <Cmp size={px} stroke={1.8} {...iconProps} />
      ) : (
        <span style={{ fontSize: size === 'sm' ? 12 : 14, fontWeight: 700 }}>
          {(name ?? '?').charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

/** Chip para una transferencia — no es categoría, así que no pasa por el
 * mapa de arriba, pero usa el mismo tinte neutro (misma familia visual). */
export function TransferIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className={`fz-icon-chip${size === 'sm' ? ' fz-icon-chip--sm' : ''}`}>
      <IconArrowsExchange size={size === 'sm' ? 16 : 20} stroke={1.8} />
    </div>
  )
}

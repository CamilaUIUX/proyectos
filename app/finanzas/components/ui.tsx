'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'

export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`fz-panel ${className}`} style={style}>
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  href,
  onAction,
  actionLabel = 'Ver todas',
}: {
  title: string
  href?: string
  onAction?: () => void
  actionLabel?: string
}) {
  return (
    <div className="fz-section-title">
      <h2 className="fz-truncate">{title}</h2>
      {href && (
        <Link href={href} className="fz-truncate">
          {actionLabel}
        </Link>
      )}
      {onAction && (
        <button type="button" className="fz-link" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function Btn({
  children,
  variant = 'primary',
  size,
  block,
  className = '',
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'soft' | 'ghost' | 'danger'
  size?: 'sm'
  block?: boolean
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'fz-btn',
    `fz-btn--${variant}`,
    size === 'sm' ? 'fz-btn--sm' : '',
    block ? 'fz-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  )
}

export function Skeleton({ w, h = 16, radius }: { w: string | number; h?: number; radius?: number }) {
  return (
    <div
      className="fz-skel"
      style={{ width: w, height: h, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="fz-empty">
      <div className="fz-empty__icon">{icon}</div>
      <p style={{ fontWeight: 700, color: 'var(--fz-ink)' }}>{title}</p>
      {message && <p style={{ fontSize: 13 }}>{message}</p>}
      {action}
    </div>
  )
}

/** Bottom sheet en móvil, modal centrado en desktop — mismo componente,
 * mismo contenido (contexto_ui_finanzas.md §6 del repo de referencia). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fz-overlay" onClick={onClose}>
      <div className="fz-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="fz-sheet__handle" />
        {title && <div className="fz-sheet__title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="fz-segmented" role="tablist">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          data-active={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

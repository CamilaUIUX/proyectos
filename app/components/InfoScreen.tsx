'use client'

import type { ReactNode } from 'react'

/** Pantalla centrada de una sola tarjeta, para estados que bloquean toda la
 *  página (configuración pendiente, sin acceso, etc.) — mismo tratamiento
 *  visual que usa AuthGate, para no inventar un estilo nuevo por caso. */
export function InfoScreen({ label, message, action }: { label: string; message: ReactNode; action?: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-6">
      <div className="ed-module max-w-md p-6 flex flex-col gap-3">
        <span className="ed-label">{label}</span>
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">{message}</p>
        {action}
      </div>
    </div>
  )
}

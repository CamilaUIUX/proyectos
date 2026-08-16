'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/components/AuthProvider'
import { InfoScreen } from '@/app/components/InfoScreen'

/** /admin es solo para administradores. Va dentro de AuthGate, así que aquí
 *  ya hay sesión iniciada — solo falta confirmar el rol. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { accessReady, isAdmin } = useAuth()

  if (!accessReady) return null

  if (!isAdmin) {
    return (
      <InfoScreen
        label="Sin acceso"
        message="Esta sección es solo para administradores."
        action={<Link href="/" className="ed-btn ed-btn--quiet self-start">Volver al Hub</Link>}
      />
    )
  }

  return <>{children}</>
}

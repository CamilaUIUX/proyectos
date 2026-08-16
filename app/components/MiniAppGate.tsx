'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/components/AuthProvider'
import { InfoScreen } from '@/app/components/InfoScreen'

/** Cierra una mini-app a quien no tenga acceso otorgado (o no sea admin).
 *  Va en el layout.tsx de cada mini-app, dentro de AuthGate — así que aquí
 *  ya hay sesión iniciada, solo falta confirmar el acceso a ESTE slug. */
export function MiniAppGate({ slug, children }: { slug: string; children: ReactNode }) {
  const { accessReady, hasAppAccess } = useAuth()

  // Evita el parpadeo de "sin acceso" mientras se resuelven el perfil y la
  // lista de accesos.
  if (!accessReady) return null

  if (!hasAppAccess(slug)) {
    return (
      <InfoScreen
        label="Sin acceso"
        message="Tu cuenta no tiene acceso a esta aplicación. Si crees que deberías tenerlo, pide a un administrador que te lo dé desde /admin."
        action={<Link href="/" className="ed-btn ed-btn--quiet self-start">Volver al Hub</Link>}
      />
    )
  }

  return <>{children}</>
}

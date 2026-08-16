'use client'

import { useAuth, useAuthedUser } from '@/app/components/AuthProvider'

/**
 * Correo, rol y cerrar sesión: vive en el layout raíz, no dentro de cada
 * mini-app, porque el login ya es de todo el sitio y no solo de Daily.
 * Solo se monta cuando hay sesión (AuthGate la coloca junto a `children`).
 */
export default function AccountBar() {
  const { user, isAdmin } = useAuthedUser()
  const { signOut } = useAuth()

  return (
    <div className="flex justify-end px-6 sm:px-10 lg:px-16 pt-6">
      <div className="ed-module flex items-center gap-3 px-4 py-2.5">
        <span className="ed-label truncate max-w-[40vw] hidden sm:inline">{user.email}</span>
        {isAdmin && <span className="ed-chip ed-chip--accent shrink-0">Admin</span>}
        <button onClick={signOut} className="ed-btn ed-btn--quiet shrink-0">Salir</button>
      </div>
    </div>
  )
}

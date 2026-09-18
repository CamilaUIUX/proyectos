'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FinanzasDataProvider, useFinanzas } from './data-context'
import { Sidebar } from './sidebar'
import { TabBar } from './tab-bar'
import { QuickAdd } from './quick-add'

/** Arma el árbol de la mini-app: provider de datos + sidebar (desktop) +
 * tab bar (móvil) + quick-add, siempre montados alrededor de `children`.
 * Cliente porque los providers y el estado de navegación lo requieren — el
 * layout.tsx que lo envuelve puede quedar como server component porque
 * <MiniAppGate> ya es 'use client' por su cuenta. */
export function FinanzasShell({ children }: { children: ReactNode }) {
  return (
    <FinanzasDataProvider>
      <FzRoot>{children}</FzRoot>
    </FinanzasDataProvider>
  )
}

// Separado de FinanzasShell porque `useFinanzas()` necesita estar DEBAJO del
// provider, no en el mismo componente que lo monta. `data-accent` se pinta
// en el primer render, sin useEffect — `activeAccent` ya sale de
// localStorage en el estado inicial de FinanzasDataProvider (sprint-8 §4.10).
function FzRoot({ children }: { children: ReactNode }) {
  const { activeAccent } = useFinanzas()
  return (
    <div id="fz-root" className="fz-shell" data-accent={activeAccent}>
      {/* useSearchParams() pide un límite de Suspense propio en el router de
       * Next — no bloquea el resto del árbol, que no depende de la URL. */}
      <Suspense fallback={null}>
        <ProfileDeepLink />
      </Suspense>
      <div className="fz-content">
        <Sidebar />
        <main className="fz-main">{children}</main>
      </div>
      <TabBar />
      <QuickAdd />
    </div>
  )
}

/** Sprint 9 · Notificaciones §4.4 — un aviso de un perfil que no es el
 * activo lleva `?p={profileId}` en la url de destino. Se lee UNA vez al
 * montar, cambia de perfil si hace falta, y limpia el parámetro — nunca
 * queda un link interno de la app que lo use (§0: es la única excepción a
 * "sin perfil en la URL" del Sprint 8, acotada a este único punto de
 * entrada). `switchProfile` ya sabe caer al default en silencio si `p` no
 * es válido (mismo mecanismo que un `fz:profile` corrupto, sprint-8 §4.1),
 * así que no hace falta validarlo aparte acá. */
function ProfileDeepLink() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { activeProfileId, switchProfile } = useFinanzas()

  useEffect(() => {
    const p = searchParams.get('p')
    if (!p || p === activeProfileId) return
    switchProfile(p)
    const url = new URL(window.location.href)
    url.searchParams.delete('p')
    router.replace(`${url.pathname}${url.search}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}

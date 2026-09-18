'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker de Finanzas (`public/finanzas/sw.js`).
 *
 * Se monta desde el layout de la mini-app, no desde el del Hub: el scope
 * queda en `/finanzas/`, así que ni el portal ni las otras mini-apps quedan
 * bajo un service worker que no pidieron.
 *
 * No renderiza nada y falla en silencio: sin soporte de service workers, o en
 * ventana privada, la app funciona igual — solo se pierde el modo offline.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/finanzas/sw.js', { scope: '/finanzas/' }).catch(() => {})
  }, [])

  return null
}

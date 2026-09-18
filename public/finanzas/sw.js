/**
 * Service worker de Finanzas.
 *
 * Vive en /finanzas/ y no en la raíz a propósito: su scope queda limitado a la
 * mini-app. El Hub y las demás mini-apps no quedan bajo un service worker que
 * no pidieron.
 *
 * Hace lo mínimo:
 *  - toma el control sin esperar (skipWaiting + claim)
 *  - un caché de "app shell" para que /finanzas abra estando sin señal
 *    (network-first: si hay red, gana la red; si no, se sirve lo último bueno)
 *  - deja lista la recepción de push para cuando exista la feature de
 *    Notificaciones (roadmap ítem 10). Hoy no llega ningún push.
 *
 * El pintado instantáneo de los datos NO lo hace este SW — lo resuelve el
 * snapshot en localStorage de data-context.tsx.
 */

const CACHE = 'fz-shell-v1'
const SHELL = ['/finanzas', '/finanzas/movimientos', '/finanzas/cuentas', '/finanzas/deudas', '/finanzas/fijos', '/finanzas/ajustes']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/finanzas')) return

  // Network-first: la red manda cuando hay; el caché es solo el respaldo
  // offline. Así nunca se sirve una versión vieja teniendo señal.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req)
        if (req.mode === 'navigate' || SHELL.includes(url.pathname)) {
          const cache = await caches.open(CACHE)
          cache.put(req, fresh.clone()).catch(() => {})
        }
        return fresh
      } catch {
        const cached = await caches.match(req)
        if (cached) return cached
        if (req.mode === 'navigate') {
          const home = await caches.match('/finanzas')
          if (home) return home
        }
        throw new Error('offline y sin caché')
      }
    })(),
  )
})

// ── Push (inerte hasta que exista la feature de Notificaciones) ──────────
self.addEventListener('push', (event) => {
  let data = { title: 'Finanzas', body: '', url: '/finanzas' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* payload no-JSON: mostrar algo genérico */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/finanzas/icon-192.png',
      badge: '/finanzas/icon-192.png',
      tag: data.url,
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const dest = event.notification.data?.url || '/finanzas'
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of open) {
        if (c.url.includes('/finanzas')) {
          await c.focus()
          if ('navigate' in c) await c.navigate(dest)
          return
        }
      }
      await self.clients.openWindow(dest)
    })(),
  )
})

'use client'

import { useEffect, useState } from 'react'
import { Btn } from './ui'
import { useFinanzas } from './data-context'

/** iPhone/iPad. iPadOS 13+ se reporta como "Macintosh" con soporte táctil —
 *  sin ese segundo chequeo, un iPad quedaría clasificado como escritorio. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** ¿La PWA ya está instalada (agregada a la pantalla de inicio)? En iOS
 *  Safari, `Notification.requestPermission()` no falla si no lo está —
 *  simplemente no hace nada, y un botón que no hace nada es peor que no
 *  tener botón (sprint-9-notificaciones.md §7 "El caso iPhone"). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

/** La `applicationServerKey` de `pushManager.subscribe()` va en bytes, no en
 *  el string base64url que entrega `web-push generate-vapid-keys`. */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out as BufferSource
}

/** Activar/desactivar push en ESTE dispositivo — vive en Ajustes →
 *  Notificaciones. El service worker ya está registrado desde el layout
 *  (`<ServiceWorker>`, Sprint 1); acá solo falta pedir permiso, suscribirse,
 *  y guardar la suscripción (sprint-9 §5, §7 UI). */
export function PushSetup() {
  const { pushSubscriptions, subscribeToPush, unsubscribeFromPush } = useFinanzas()
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Leer `Notification.permission` y la suscripción del navegador no se
    // puede disparar sin un efecto — misma excepción legítima que ya usa el
    // montaje de `load()` en data-context.tsx.
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setThisEndpoint(sub?.endpoint ?? null))
      .catch(() => {
        /* sin service worker activo todavía (recién instalado) — se
         * resuelve solo en la próxima visita, no es un error que mostrar. */
      })
  }, [])

  const thisDeviceSubscribed = thisEndpoint != null && pushSubscriptions.some(s => s.endpoint === thisEndpoint)
  const otherDevices = pushSubscriptions.filter(s => s.endpoint !== thisEndpoint).length

  async function handleActivate() {
    setError(null)
    setBusy(true)
    try {
      const vapidKey = process.env.NEXT_PUBLIC_FINANZAS_VAPID_KEY
      if (!vapidKey) throw new Error('Falta configurar la clave pública VAPID (NEXT_PUBLIC_FINANZAS_VAPID_KEY).')
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const json = subscription.toJSON()
      const result = await subscribeToPush({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      })
      if (result.error) {
        // La suscripción del navegador ya se creó — si guardarla falla, no
        // dejamos al navegador pensando que está suscripto sin que la base
        // lo sepa (nadie le mandaría nada, pero tampoco podría reactivar
        // limpio después).
        await subscription.unsubscribe().catch(() => {})
        throw new Error(result.error)
      }
      setThisEndpoint(subscription.endpoint)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar. Probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate() {
    if (!thisEndpoint) return
    setError(null)
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      await subscription?.unsubscribe()
      const result = await unsubscribeFromPush(thisEndpoint)
      if (result.error) throw new Error(result.error)
      setThisEndpoint(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar. Probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (permission === 'unsupported') {
    return <p style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>Este navegador no soporta notificaciones push.</p>
  }

  // iOS sin instalar: el botón no hace nada si se lo muestra — se ofrecen
  // las instrucciones en su lugar (§7 "El caso iPhone").
  if (isIOS() && !isStandalone()) {
    return (
      <div className="fz-panel" style={{ background: 'var(--fz-tint-neutral)' }}>
        <p style={{ fontWeight: 700, marginBottom: 4 }}>Instalá Finanzas primero</p>
        <p style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>
          En iPhone, las notificaciones solo llegan si la app está agregada a tu pantalla de inicio: tocá{' '}
          <strong>Compartir</strong> y despues <strong>&quot;Agregar a inicio&quot;</strong>. Volvé a esta pantalla desde ese ícono.
        </p>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <p style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
        Tenés las notificaciones bloqueadas para este sitio. Se reactivan desde la configuración del navegador (el ícono junto a la
        dirección, o Ajustes del sistema en el celular).
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {thisDeviceSubscribed ? (
        <>
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            Activadas en este dispositivo
            {otherDevices > 0 && <span style={{ color: 'var(--fz-ink-3)', fontWeight: 400 }}> · {otherDevices} más activado{otherDevices === 1 ? '' : 's'}</span>}
          </p>
          <Btn variant="soft" onClick={handleDeactivate} disabled={busy}>
            {busy ? 'Desactivando…' : 'Desactivar en este dispositivo'}
          </Btn>
        </>
      ) : (
        <>
          {pushSubscriptions.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
              Activadas en {pushSubscriptions.length} otro{pushSubscriptions.length === 1 ? '' : 's'} dispositivo{pushSubscriptions.length === 1 ? '' : 's'}.
            </p>
          )}
          <Btn variant="primary" onClick={handleActivate} disabled={busy}>
            {busy ? 'Activando…' : 'Activar notificaciones'}
          </Btn>
        </>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}
    </div>
  )
}

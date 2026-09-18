// web-push + claves VAPID desde secretos de la Edge Function
// (sprint-9-notificaciones.md §5). La clave PÚBLICA es la misma que
// NEXT_PUBLIC_FINANZAS_VAPID_KEY en .env.local (segura de exponer al
// cliente); la PRIVADA vive únicamente acá — nunca en el repo, nunca en el
// cliente.
//
// Configurar con:
//   supabase secrets set FINANZAS_VAPID_PUBLIC_KEY=...
//   supabase secrets set FINANZAS_VAPID_PRIVATE_KEY=...
//   supabase secrets set FINANZAS_VAPID_SUBJECT=mailto:tu-correo@dominio.com

import webpush from 'npm:web-push@3.6.7'

const publicKey = Deno.env.get('FINANZAS_VAPID_PUBLIC_KEY') ?? ''
const privateKey = Deno.env.get('FINANZAS_VAPID_PRIVATE_KEY') ?? ''
const subject = Deno.env.get('FINANZAS_VAPID_SUBJECT') ?? 'mailto:soporte@example.com'

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushPayload {
  title: string
  body: string
  url?: string | null
}

export type PushResult = { ok: true } | { ok: false; statusCode?: number; gone: boolean }

/** `gone: true` en un 404/410 — el dispositivo dejó de existir, quien llama
 *  debe borrar la fila de `fin_push_subscriptions` (§4.7). Cualquier otro
 *  error no borra nada: se reintenta en la corrida siguiente. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!publicKey || !privateKey) {
    return { ok: false, gone: false }
  }
  try {
    await webpush.sendNotification(target, JSON.stringify(payload))
    return { ok: true }
  } catch (err) {
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err ? (err as { statusCode?: number }).statusCode : undefined
    return { ok: false, statusCode, gone: statusCode === 404 || statusCode === 410 }
  }
}

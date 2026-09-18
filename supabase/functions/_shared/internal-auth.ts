// requireInternal — verifica que la llamada venga de pg_cron (vía pg_net),
// nunca del cliente ni de un JWT de usuario (sprint-9-notificaciones.md
// §0.3 a). El secreto es FIN_CRON_SECRET, no la service role key: si se
// filtra, lo peor que permite es pedir que se evalúen notificaciones — no
// da acceso a la base. Vive como secreto de la Edge Function
// (`supabase secrets set FIN_CRON_SECRET=...`), y el mismo valor va en
// Vault (`fin_cron_secret`) para que el `cron.schedule` de schema.sql §19.7
// lo mande en el header `x-cron-secret`.

/** `null` si la llamada es válida; si no, la `Response` que hay que
 *  devolver tal cual. */
export function requireInternal(req: Request): Response | null {
  const expected = Deno.env.get('FIN_CRON_SECRET')
  if (!expected) {
    // Secreto no configurado en la Edge Function — nadie puede autenticarse
    // todavía. Es un error de despliegue, no un intento no autorizado real,
    // pero la respuesta de afuera tiene que ser igual (no dar pistas).
    return new Response(JSON.stringify({ error: 'not configured' }), { status: 500 })
  }
  const got = req.headers.get('x-cron-secret')
  if (!got || got !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }
  return null
}

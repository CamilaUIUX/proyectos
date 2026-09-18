// Evalúa los cinco tipos de aviso (sprint-9-notificaciones.md §4.2) y manda
// — la invoca únicamente pg_cron vía pg_net cada 15 minutos (schema.sql
// §19.7). Nunca la llama el cliente.
//
// Reusa lib/finanzas/ bridgeado a ../_shared/finanzas/ (scripts/
// build-edge-shared.mjs) — no reimplementa ninguna decisión de negocio,
// solo decide A QUIÉN evaluar y QUÉ hacer con el resultado (mandar,
// registrar, limpiar suscripciones muertas).
//
// ⚠️ Si tocaste lib/finanzas/, correr `node scripts/build-edge-shared.mjs`
// y volver a deployar ANTES de confiar en esta corrida — no hay suite de
// tests que lo verifique por vos (sprint-9 §0).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireInternal } from '../_shared/internal-auth.ts'
import { sendPush, type PushTarget } from '../_shared/push.ts'
import {
  DEFAULT_NOTIF_PREFS,
  evaluateAhorro,
  evaluateCuotasDePlan,
  evaluateDeudas,
  evaluateFijos,
  evaluatePresupuesto,
  evaluateRecordarAnotar,
  localDateISO,
  type NotificationCandidate,
} from '../_shared/finanzas/notifications.ts'
import { buildRatesMap } from '../_shared/finanzas/rates.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Mismo tope que `load()` en data-context.tsx — el límite conocido del
// Sprint 2 (más de ~2000 movimientos históricos deja afuera a los más
// viejos) aplica igual acá; no es nuevo de este sprint.
const TX_LIMIT = 2000

interface UserRow {
  user_id: string
}

Deno.serve(async req => {
  const denied = requireInternal(req)
  if (denied) return denied

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const nowUtcISO = new Date().toISOString()

  // Solo usuarios con al menos un dispositivo suscripto — sin eso, evaluar
  // no sirve de nada (nadie a quien mandarle el resultado).
  const { data: userRows, error: usersError } = await supabase
    .from('fin_push_subscriptions')
    .select('user_id')
  if (usersError) return new Response(JSON.stringify({ error: usersError.message }), { status: 500 })

  const userIds = [...new Set(((userRows ?? []) as UserRow[]).map(r => r.user_id))]
  const results: Record<string, unknown> = {}

  for (const userId of userIds) {
    try {
      results[userId] = await processUser(supabase, userId, nowUtcISO)
    } catch (err) {
      results[userId] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return new Response(JSON.stringify({ processed: userIds.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// `supabase` queda sin tipar a propósito: es el cliente de
// `https://esm.sh/@supabase/supabase-js@2` — Deno-only, sin tipos que este
// repo pueda resolver (supabase/functions está excluido de tsconfig.json).
async function processUser(supabase: any, userId: string, nowUtcISO: string) {
  const [
    profilesRes,
    prefsRes,
    subsRes,
    recurringRes,
    txRes,
    debtsRes,
    peopleRes,
    categoriesRes,
    budgetLinesRes,
    budgetLineCategoriesRes,
    budgetPeriodsRes,
    budgetExtensionsRes,
    budgetClosuresRes,
    savingsGoalsRes,
    ratesRes,
  ] = await Promise.all([
    supabase.from('fin_profiles').select('*').eq('user_id', userId),
    supabase.from('fin_notif_prefs').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('fin_push_subscriptions').select('*').eq('user_id', userId),
    supabase.from('fin_recurring').select('*').eq('user_id', userId),
    supabase.from('fin_transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(TX_LIMIT),
    supabase.from('fin_debts').select('*').eq('user_id', userId),
    supabase.from('fin_people').select('*').eq('user_id', userId),
    supabase.from('fin_categories').select('*').eq('user_id', userId),
    supabase.from('fin_budget_lines').select('*').eq('user_id', userId),
    supabase.from('fin_budget_line_categories').select('*'),
    supabase.from('fin_budget_periods').select('*').eq('user_id', userId),
    supabase.from('fin_budget_extensions').select('*'),
    supabase.from('fin_budget_closures').select('*').eq('user_id', userId),
    supabase.from('fin_savings_goals').select('*').eq('user_id', userId),
    // Mismas 4 monedas que ya siembra load() en data-context.tsx —
    // buildRatesMap() rellena con FALLBACK_RATES lo que falte.
    supabase.from('fin_rates').select('currency, rate').eq('user_id', userId),
  ])

  const profiles = profilesRes.data ?? []
  const profileNames = new Map<string, string>(profiles.map((p: { id: string; name: string }) => [p.id, p.name]))
  const notifyByProfile = new Map<string, boolean>(profiles.map((p: { id: string; notify: boolean }) => [p.id, p.notify]))
  const prefs = prefsRes.data ?? DEFAULT_NOTIF_PREFS
  const subscriptions = subsRes.data ?? []

  if (profiles.length === 0 || subscriptions.length === 0) return { skipped: true }

  // La fecha de HOY según la zona de ESTE usuario, no la del servidor —
  // mismo problema que ya resolvieron los Sprints 6 y 7 (acá no hay un
  // cliente del que leer `today`, así que se usa `prefs.timezone`). Sin
  // esto, cerca de la medianoche UTC cualquier usuario fuera de ese huso
  // (Bolivia incluido) evaluaría vencimientos, el período de presupuesto y
  // el sobrante de ahorro contra el día equivocado durante varias horas.
  const todayISO = localDateISO(nowUtcISO, prefs.timezone)

  // fin_budget_line_categories/fin_budget_extensions no tienen user_id
  // propio (sprint-3 §3.4 / sprint-5 §3.6.2) — se filtran acá contra los ids
  // que sí son de este usuario, en vez de sumar otro `.eq` que la tabla no
  // soporta.
  const lineIds = new Set((budgetLinesRes.data ?? []).map((l: { id: string }) => l.id))
  const periodIds = new Set((budgetPeriodsRes.data ?? []).map((p: { id: string }) => p.id))
  const budgetLineCategories = (budgetLineCategoriesRes.data ?? []).filter((lc: { line_id: string }) => lineIds.has(lc.line_id))
  const budgetExtensions = (budgetExtensionsRes.data ?? []).filter((e: { period_id: string }) => periodIds.has(e.period_id))

  const allTx = txRes.data ?? []
  const debts = debtsRes.data ?? []

  const candidates: NotificationCandidate[] = []

  if (prefs.fijos) {
    candidates.push(...evaluateFijos(recurringRes.data ?? [], allTx, profileNames, todayISO))
    candidates.push(...evaluateCuotasDePlan(debts, profileNames, todayISO))
  }
  if (prefs.presupuesto) {
    candidates.push(
      ...evaluatePresupuesto(
        budgetLinesRes.data ?? [],
        budgetLineCategories,
        budgetPeriodsRes.data ?? [],
        budgetExtensions,
        budgetClosuresRes.data ?? [],
        categoriesRes.data ?? [],
        allTx,
        debts,
        profileNames,
        todayISO
      )
    )
  }
  if (prefs.ahorro) {
    const rates = buildRatesMap(ratesRes.data ?? [])
    candidates.push(...evaluateAhorro(savingsGoalsRes.data ?? [], allTx, rates, profileNames, todayISO))
  }
  if (prefs.deudas) {
    candidates.push(...evaluateDeudas(debts, peopleRes.data ?? [], profileNames, todayISO))
  }
  if (prefs.recordar_anotar) {
    const recordatorio = evaluateRecordarAnotar(nowUtcISO, prefs, todayISO)
    if (recordatorio) candidates.push(recordatorio)
  }

  // El switch por perfil (§3.2) filtra DESPUÉS de evaluar, no antes — es más
  // simple evaluar todo y descartar que pasarle a cada evaluador la lista de
  // perfiles ya recortada (los evaluadores no saben de `notify`, a propósito:
  // esa es una regla de ENTREGA, no de cuándo corresponde el aviso).
  const deliverable = candidates.filter(c => c.profile_id == null || notifyByProfile.get(c.profile_id) !== false)

  let sent = 0
  let deduped = 0
  const insertErrors: string[] = []
  for (const candidate of deliverable) {
    // `unique(user_id, dedupe_key)` decide — un insert que choca es "ya se
    // mandó", no un error (§3.3/§4.1). Se registra ANTES de mandar el push:
    // así dos corridas que empatan justo en el filo del cron nunca mandan
    // dos veces (la segunda choca con la fila que la primera ya insertó).
    const { error: insertError } = await supabase.from('fin_notifications').insert({
      user_id: userId,
      profile_id: candidate.profile_id,
      kind: candidate.kind,
      dedupe_key: candidate.dedupe_key,
      title: candidate.title,
      body: candidate.body,
      url: candidate.url,
    })
    if (insertError) {
      // 23505 = unique_violation en Postgres — la única causa esperada,
      // "ya se mandó". Cualquier OTRA causa (un `kind` inválido, RLS mal
      // configurado, la base caída) es un fallo real: no reintenta el push
      // de este candidato (mismo criterio que un push que falla, §4.7), pero
      // se guarda aparte para que la corrida lo reporte — lumping todo bajo
      // "deduped" habría escondido para siempre un bug de configuración
      // detrás de un número que parece sano.
      if (insertError.code === '23505') {
        deduped++
      } else {
        insertErrors.push(`${candidate.dedupe_key}: ${insertError.message}`)
      }
      continue
    }

    for (const sub of subscriptions) {
      const target: PushTarget = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
      const result = await sendPush(target, { title: candidate.title, body: candidate.body, url: candidate.url })
      if (result.ok) {
        await supabase.from('fin_push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('endpoint', sub.endpoint)
        sent++
      } else if (result.gone) {
        // El dispositivo dejó de existir (404/410) — se borra ahora, no se
        // reintenta nunca (§4.7). Cualquier otro error no toca la fila: se
        // reintenta solo en la corrida siguiente, 15 minutos después.
        await supabase.from('fin_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }

  return { candidates: deliverable.length, sent, deduped, insertErrors, devices: subscriptions.length }
}

// Notificaciones — sprint-9-notificaciones.md. Sin imports de next/* ni del
// alias @/, y sin ninguna dependencia de red — ver la nota de independencia
// en sprint-1-movimientos.md §5.1. Es lo que permite que
// scripts/build-edge-shared.mjs copie este archivo (y todo lo que importa)
// a la Edge Function sin reescribir una sola decisión, solo la ruta de los
// imports (sprint-9 §0.2).
//
// Cada evaluador COMPONE funciones que ya existen en recurring.ts/
// budgets.ts/savings.ts/debts.ts — no reimplementa ninguna decisión que la
// app ya toma. Lo único nuevo acá son los umbrales (§4.2) y el texto (§4.5).
// Quien llama (la Edge Function) le pasa filas de VARIOS perfiles a la vez
// — por eso cada fila que hace falta distinguir por perfil llega con un
// `profile_id` que el tipo base (pensado para un solo perfil ya filtrado,
// como en data-context.tsx) no lleva.

import { daysBetween } from './debts'
import { formatMoney } from './money'
import { recurringStatus, type Period } from './recurring'
import { budgetLineTitle, effectiveAmount, effectiveFromFor, gastoRealForCategories, needsClosure, periodRange, periodStart } from './budgets'
import {
  goalReached,
  pendingSavingsPeriod,
  proposeAllocation,
  savingsBalancesUsd,
  surplusUsd as computeSurplusUsd,
  targetAmountUsd,
  type SavingsGoalWithBalance,
} from './savings'
import type {
  BudgetClosure,
  BudgetExtension,
  BudgetLine,
  BudgetLineCategory,
  BudgetPeriod,
  Category,
  Debt,
  NotifPrefs,
  Person,
  RatesMap,
  Recurring,
  SavingsGoal,
  Transaction,
} from './types'

/** Mismos valores que traen las columnas de `fin_notif_prefs` por default en
 *  la base (sprint-9 §3.2) — se usa mientras el usuario todavía no tiene
 *  fila propia, tanto en el cliente (Ajustes muestra los switches ya en su
 *  posición default) como en la Edge Function (un dispositivo suscripto sin
 *  fila de preferencias no debería quedar sin avisos, sprint-9 §6). */
export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  fijos: true,
  presupuesto: true,
  ahorro: true,
  deudas: true,
  recordar_anotar: true,
  recordar_mediodia: '14:00',
  recordar_noche: '21:00',
  timezone: 'America/La_Paz',
}

export type NotificationKind = 'fijos' | 'presupuesto' | 'ahorro' | 'deudas' | 'recordar_anotar'

export interface NotificationCandidate {
  kind: NotificationKind
  /** La identidad del HECHO, no del aviso — sprint-9 §4.2/§3.3. */
  dedupe_key: string
  title: string
  body: string
  url: string
  /** `null` solo para el recordatorio de anotar (§4.6) — no sale de ningún
   *  perfil en particular. */
  profile_id: string | null
}

/** El perfil va al final del cuerpo, después de un `·` — se lee último
 *  porque casi siempre hay uno solo activo, pero está cuando hace falta
 *  (§4.5). `null` cuando no se conoce el nombre (no debería pasar en la
 *  práctica: la Edge Function siempre tiene el mapa de perfiles del
 *  usuario a mano). */
function withProfile(body: string, profileName: string | null): string {
  return profileName ? `${body} · ${profileName}` : body
}

/** `?p={profileId}` en la url de destino — sprint-9 §4.4/§0. Siempre se
 *  agrega cuando el aviso es de un perfil (nunca se sabe, al mandarlo, cuál
 *  es el perfil activo de CADA dispositivo que lo va a recibir); el hook
 *  que lee el parámetro al abrir decide en silencio si hace falta cambiar
 *  (si ya es el activo, no hace nada). Es la única excepción a "sin perfil
 *  en la URL" del Sprint 8, acotada a este punto de entrada. */
function withProfileParam(url: string, profileId: string | null): string {
  return profileId ? `${url}?p=${profileId}` : url
}

function periodKey(p: Period): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/* ─── Fijos y cuotas ──────────────────────────────────────────────────── */

type RecurringWithProfile = Recurring & { profile_id: string }
type DebtWithProfile = Debt & { profile_id: string }

/** Un fijo vencido, o que vence en ≤2 días (§4.2). Reusa `recurringStatus`
 *  tal cual la pantalla de Fijos — el umbral de "por vencer" es lo único
 *  nuevo. */
export function evaluateFijos(
  recurringList: RecurringWithProfile[],
  allTx: Transaction[],
  profileNames: Map<string, string>,
  todayISO: string
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  for (const r of recurringList) {
    const state = recurringStatus(r, allTx, todayISO)
    if (state.status !== 'vencido' && state.status !== 'pendiente') continue
    if (!state.oldest) continue
    const daysUntilDue = daysBetween(todayISO, state.oldest.due)
    if (state.status === 'pendiente' && daysUntilDue > 2) continue

    const profileName = profileNames.get(r.profile_id) ?? null
    const amountLabel = formatMoney(r.amount, r.currency)
    const dueDay = state.oldest.due.slice(8, 10)
    out.push({
      kind: 'fijos',
      dedupe_key: `fijo:${r.id}:${periodKey(state.oldest)}`,
      title: state.status === 'vencido' ? `${r.name} venció` : `${r.name} vence en ${daysUntilDue} ${daysUntilDue === 1 ? 'día' : 'días'}`,
      body: withProfile(state.status === 'vencido' ? `${amountLabel} · vencía el ${dueDay}` : amountLabel, profileName),
      url: withProfileParam('/finanzas/fijos', r.profile_id),
      profile_id: r.profile_id,
    })
  }
  return out
}

/** Una cuota de un plan de pago vencida, o que vence en ≤2 días — mismo
 *  criterio de "por vencer" que un fijo, pero sobre `fin_debts` con
 *  `plan_id` (§0 de este sprint: se agrupa junto con fijos, no con deudas
 *  sueltas, porque ya tiene su propia fecha de vencimiento, no una
 *  antigüedad). Sin período en el `dedupe_key`: una cuota no se repite. */
export function evaluateCuotasDePlan(debtsList: DebtWithProfile[], profileNames: Map<string, string>, todayISO: string): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  for (const d of debtsList) {
    if (d.status !== 'pendiente' || d.plan_id == null) continue
    const daysUntilDue = daysBetween(todayISO, d.incurred_on)
    const vencida = daysUntilDue < 0
    if (!vencida && daysUntilDue > 2) continue

    const profileName = profileNames.get(d.profile_id) ?? null
    const amountLabel = formatMoney(d.amount, d.currency)
    const dueDay = d.incurred_on.slice(8, 10)
    const label = d.concept ? `Cuota ${d.installment_number ?? ''} de ${d.concept}`.trim() : `Cuota ${d.installment_number ?? ''}`.trim()
    out.push({
      kind: 'fijos',
      dedupe_key: `cuota:${d.id}`,
      title: vencida ? `${label} venció` : `${label} vence en ${daysUntilDue} ${daysUntilDue === 1 ? 'día' : 'días'}`,
      body: withProfile(vencida ? `${amountLabel} · vencía el ${dueDay}` : amountLabel, profileName),
      url: withProfileParam('/finanzas/deudas', d.profile_id),
      profile_id: d.profile_id,
    })
  }
  return out
}

/* ─── Presupuesto ─────────────────────────────────────────────────────── */

type BudgetLineWithProfile = BudgetLine & { profile_id: string }

/** Al 90%, pasado, o con un mes sin cerrar — las tres preguntas que ya
 *  responde la pantalla de Presupuesto, con el mismo cálculo
 *  (`effectiveAmount` + `gastoRealForCategories` + `committedForCategories`
 *  + `needsClosure`), no una copia. */
export function evaluatePresupuesto(
  lines: BudgetLineWithProfile[],
  lineCategories: BudgetLineCategory[],
  periods: BudgetPeriod[],
  extensions: BudgetExtension[],
  closures: BudgetClosure[],
  categories: Category[],
  allTx: Transaction[],
  debts: Debt[],
  profileNames: Map<string, string>,
  todayISO: string
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  const currentPeriod = periodStart(todayISO)
  const catsByLine = new Map<string, string[]>()
  for (const lc of lineCategories) {
    const list = catsByLine.get(lc.line_id) ?? []
    list.push(lc.category_id)
    catsByLine.set(lc.line_id, list)
  }
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? ''

  for (const line of lines) {
    const categoryIds = catsByLine.get(line.id) ?? []
    const profileName = profileNames.get(line.profile_id) ?? null
    const title = budgetLineTitle(line.name, categoryIds.map(categoryName))

    // 90% / pasado — solo el período vigente, es lo que el usuario está
    // viviendo ahora.
    const effective = effectiveAmount(periods, extensions, line.id, currentPeriod, line.input_currency)
    if (effective && effective.amountUsd > 0) {
      const { to } = periodRange(currentPeriod)
      const from = effectiveFromFor(line, currentPeriod)
      const spent = gastoRealForCategories(allTx, debts, categoryIds, from, to, line.input_currency, 1)
      const ratio = spent.amountUsd / effective.amountUsd
      if (ratio >= 1) {
        const overUsd = spent.amountUsd - effective.amountUsd
        out.push({
          kind: 'presupuesto',
          dedupe_key: `presu:${line.id}:${currentPeriod}:100`,
          title: `Te pasaste en ${title}`,
          body: withProfile(`${formatMoney(overUsd, 'USD')} por encima de ${formatMoney(effective.amountUsd, 'USD')}`, profileName),
          url: withProfileParam('/finanzas/presupuesto', line.profile_id),
          profile_id: line.profile_id,
        })
      } else if (ratio >= 0.9) {
        const leftUsd = effective.amountUsd - spent.amountUsd
        out.push({
          kind: 'presupuesto',
          dedupe_key: `presu:${line.id}:${currentPeriod}:90`,
          title: `${title} al 90%`,
          body: withProfile(`Te quedan ${formatMoney(leftUsd, 'USD')} de ${formatMoney(effective.amountUsd, 'USD')}`, profileName),
          url: withProfileParam('/finanzas/presupuesto', line.profile_id),
          profile_id: line.profile_id,
        })
      }
    }

    // Cierre pendiente — cualquier período ya terminado sin fila en
    // fin_budget_closures, no solo el vigente.
    if (categoryIds.length === 0 || !categoryIds.every(id => categories.find(c => c.id === id)?.archived)) {
      for (const p of needsClosure(line, closures, todayISO)) {
        out.push({
          kind: 'presupuesto',
          dedupe_key: `cierre:${line.id}:${p}`,
          title: `${title} quedó sin cerrar`,
          body: withProfile('Decidí qué hacer con lo que sobró', profileName),
          url: withProfileParam('/finanzas/presupuesto', line.profile_id),
          profile_id: line.profile_id,
        })
      }
    }
  }
  return out
}

/* ─── Ahorro ──────────────────────────────────────────────────────────── */

type SavingsGoalWithProfile = SavingsGoal & { profile_id: string }
type TransactionWithProfile = Transaction & { profile_id: string }

/** Sobrante sin repartir (una vez por período, no por meta — mismo criterio
 *  que el banner "Es hora de organizar tus ahorros" de la Home) y meta
 *  cumplida (una vez por meta). Reusa `proposeAllocation` — el mismo cálculo
 *  que decide "hay algo pendiente" en `savingsView` de data-context.tsx, no
 *  una versión más simple que podría no coincidir (un sobrante > 0 no
 *  siempre implica que sobra algo REPARTIBLE, por el tope de cada meta). */
export function evaluateAhorro(
  goals: SavingsGoalWithProfile[],
  allTx: TransactionWithProfile[],
  rates: RatesMap,
  profileNames: Map<string, string>,
  todayISO: string
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  const period = pendingSavingsPeriod(todayISO)

  const byProfile = new Map<string, SavingsGoalWithProfile[]>()
  for (const g of goals) {
    const list = byProfile.get(g.profile_id) ?? []
    list.push(g)
    byProfile.set(g.profile_id, list)
  }

  for (const [profileId, profileGoals] of byProfile) {
    const profileName = profileNames.get(profileId) ?? null
    // `surplusUsd` suma TODO lo que le pases, sin filtrar por perfil — a
    // diferencia de `savingsBalancesUsd` (agrupa por `savings_goal_id`, que
    // ya resuelve a un solo perfil por construcción), esta sí necesita
    // `allTx` recortado a mano. Sin este filtro, el sobrante de un perfil
    // se mezclaba con el de los demás — bug real encontrado en la revisión
    // de este sprint, antes de que ningún dispositivo real lo viera.
    const profileTx = allTx.filter(t => t.profile_id === profileId)
    const surplusUsd = computeSurplusUsd(profileTx, period)
    const balancesUsd = savingsBalancesUsd(profileTx)

    const withBalance: SavingsGoalWithBalance[] = profileGoals.map(g => {
      const balance_usd = balancesUsd.get(g.id) ?? 0
      const targetUsd = targetAmountUsd(g, rates)
      return { ...g, balance_usd, goal_reached: goalReached(balance_usd, targetUsd) }
    })

    if (surplusUsd > 0) {
      const { proposal } = proposeAllocation(withBalance, surplusUsd, rates)
      const hasPending = proposal.some(p => p.amount_usd > 0)
      if (hasPending) {
        out.push({
          kind: 'ahorro',
          // `profileId` en la clave, no solo `período` — dos perfiles con
          // sobrante en el mismo mes generan dos candidatos, y sin el
          // perfil en la clave el segundo choca contra el primero en
          // `unique(user_id, dedupe_key)` y se pierde para siempre (mismo
          // tipo de bug que el de `allTx` sin filtrar, arriba).
          dedupe_key: `ahorro-sobrante:${profileId}:${period}`,
          title: `Te sobraron ${formatMoney(surplusUsd, 'USD')} en ${periodLabelEs(period)}`,
          body: withProfile('Sin repartir entre tus ahorros', profileName),
          url: withProfileParam('/finanzas/ahorro', profileId),
          profile_id: profileId,
        })
      }
    }

    for (const g of withBalance) {
      if (!g.goal_reached) continue
      const targetUsd = targetAmountUsd(g, rates)
      if (targetUsd == null) continue
      out.push({
        kind: 'ahorro',
        dedupe_key: `ahorro-meta:${g.id}`,
        title: `${g.name} llegó a su meta`,
        body: withProfile(`${formatMoney(g.balance_usd, 'USD')} de ${formatMoney(targetUsd, 'USD')}`, profileName),
        url: withProfileParam('/finanzas/ahorro', profileId),
        profile_id: profileId,
      })
    }
  }
  return out
}

function periodLabelEs(period: string): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const m = Number(period.slice(5, 7))
  return months[m - 1] ?? period
}

/* ─── Deudas ──────────────────────────────────────────────────────────── */

/** Una deuda SUELTA (`plan_id is null`) pendiente hace 30 días o más — una
 *  cuota de plan ya se avisa por `evaluateCuotasDePlan`, no acá (§0). */
export function evaluateDeudas(
  debtsList: DebtWithProfile[],
  people: Person[],
  profileNames: Map<string, string>,
  todayISO: string
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  for (const d of debtsList) {
    if (d.status !== 'pendiente' || d.plan_id != null) continue
    const age = daysBetween(d.incurred_on, todayISO)
    if (age < 30) continue

    const profileName = profileNames.get(d.profile_id) ?? null
    const personName = people.find(p => p.id === d.person_id)?.name ?? 'alguien'
    out.push({
      kind: 'deudas',
      dedupe_key: `deuda:${d.id}:30d`,
      title: `${personName} te debe hace 30 días`,
      body: withProfile(d.concept ? `${formatMoney(d.amount, d.currency)} · ${d.concept}` : formatMoney(d.amount, d.currency), profileName),
      url: withProfileParam('/finanzas/deudas', d.profile_id),
      profile_id: d.profile_id,
    })
  }
  return out
}

/* ─── Recordar anotar ─────────────────────────────────────────────────── */

/** ¿La hora local (según `timezone`) cae en el mismo bloque de 15 minutos
 *  que `hhmm`? El cron corre cada 15 minutos (§4.3) — comparar el minuto
 *  exacto nunca matchearía si el horario configurado no cae justo en un
 *  múltiplo de 15. Redondear los dos al mismo piso de 15 los hace
 *  comparables sin pedirle al usuario que solo pueda elegir :00/:15/:30/:45. */
function sameQuarterHour(nowLocalHHMM: string, configuredHHMM: string): boolean {
  const floor15 = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 4 + Math.floor(m / 15)
  }
  return floor15(nowLocalHHMM) === floor15(configuredHHMM)
}

/** `nowUtcISO` en la zona de `timezone`, como `HH:MM` — usa `Intl`, no
 *  `next/*` ni ninguna librería de fechas, así que corre igual en el
 *  navegador y en Deno (sprint-9 §5.1). */
export function localHHMM(nowUtcISO: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
  const parts = fmt.formatToParts(new Date(nowUtcISO))
  const hh = parts.find(p => p.type === 'hour')?.value ?? '00'
  const mm = parts.find(p => p.type === 'minute')?.value ?? '00'
  // Algunas implementaciones de Intl devuelven "24" para medianoche en
  // hour12:false — se normaliza a "00" para que sameQuarterHour lo lea bien.
  return `${hh === '24' ? '00' : hh}:${mm}`
}

/** `nowUtcISO` como fecha `YYYY-MM-DD` en la zona de `timezone` — el mismo
 *  problema que ya resolvieron los Sprints 6 y 7 pasando `today` desde el
 *  cliente en vez de confiar en la hora del servidor (acá no hay cliente:
 *  es un job programado, así que "el cliente" es el `timezone` guardado de
 *  cada usuario). Sin esto, cerca de la medianoche UTC — que para Bolivia
 *  (UTC-4) son las 20:00, bien dentro del día — todos los evaluadores que
 *  reciben `todayISO` (vencimientos, período de presupuesto, sobrante de
 *  ahorro, antigüedad de una deuda) leerían el día equivocado durante esas
 *  horas. */
export function localDateISO(nowUtcISO: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = fmt.formatToParts(new Date(nowUtcISO))
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const d = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

/** Incondicional — llega anotaste o no (§4.6). No lleva perfil. */
export function evaluateRecordarAnotar(
  nowUtcISO: string,
  prefs: { recordar_mediodia: string; recordar_noche: string; timezone: string },
  todayLocalISO: string
): NotificationCandidate | null {
  const nowHHMM = localHHMM(nowUtcISO, prefs.timezone)
  const slot = sameQuarterHour(nowHHMM, prefs.recordar_mediodia)
    ? 'mediodia'
    : sameQuarterHour(nowHHMM, prefs.recordar_noche)
      ? 'noche'
      : null
  if (!slot) return null
  return {
    kind: 'recordar_anotar',
    dedupe_key: `anotar:${todayLocalISO}:${slot}`,
    title: '¿Gastaste algo hoy?',
    body: 'Anotalo antes de que se te olvide',
    url: '/finanzas',
    profile_id: null,
  }
}

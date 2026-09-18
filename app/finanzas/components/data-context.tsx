'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthedUser } from '@/app/components/AuthProvider'
import { withBalances, totalUsd as computeTotalUsd } from '@/lib/finanzas/accounts'
import { currentMonthKey, todayISO } from '@/lib/finanzas/dates'
import {
  dueDebtUsd as computeDueDebtUsd,
  gastoRealUsd as computeGastoRealUsd,
  marginUsdOf,
  pendingTotalUsd,
  repartidoUsd as computeRepartidoUsd,
  splitPrincipalRatio,
  validateDebtShape,
} from '@/lib/finanzas/debts'
import { nextInstallmentNumber } from '@/lib/finanzas/plans'
import { recurringStatus } from '@/lib/finanzas/recurring'
import {
  availableUsd as computeAvailableUsd,
  budgetBar,
  carriedInto,
  committedForCategories,
  effectiveAmount,
  effectiveFromFor,
  gastoRealForCategories,
  needsClosure,
  periodRange,
  periodStart,
  resolvePeriodAmount,
  toNative,
  type BudgetGeneralView,
  type BudgetLineView,
  type BudgetViewMode,
  type PendingClosure,
} from '@/lib/finanzas/budgets'
import {
  canSaveForPeriod,
  freeByAccount,
  goalBalancesByAccount,
  goalReached as computeGoalReached,
  pendingSavingsPeriod,
  proposeAllocation,
  savedPeriodsOf,
  savingsBalancesUsd,
  savingsByAccount as computeSavingsByAccount,
  surplusUsd as computeSurplusUsd,
  targetAmountUsd,
  validateGoal,
  type SavingsGoalView,
  type SavingsGoalWithBalance,
  type SavingsOverview,
} from '@/lib/finanzas/savings'
import { compareProjects, type ProjectComparisonRow } from '@/lib/finanzas/projects'
import { ACCENT_KEYS, defaultProfileName, nextAccentFor, resolveActiveProfileId, type AccentKey } from '@/lib/finanzas/profiles'
import { DEFAULT_NOTIF_PREFS } from '@/lib/finanzas/notifications'
import { round2, roundFor } from '@/lib/finanzas/money'
import { FALLBACK_RATES, buildRatesMap, toUsd, usdPerUnit } from '@/lib/finanzas/rates'
import { defaultPairFor, fetchQuotes, isStale, pairAllowedFor, type QuotePair } from '@/lib/finanzas/quotes'
import {
  flowTypeFor,
  flowTypeOnEdit,
  freeze,
  freezeReceived,
  isInvestmentAdjustment,
  monthTotals,
  normalizeAmount,
  validateShape,
  valueUpdateDelta,
} from '@/lib/finanzas/transactions'
import {
  RATE_CURRENCIES,
  SEED_CATEGORIES,
  decimalsFor,
  toNum,
  type Account,
  type AccountWithBalance,
  type BudgetClosure,
  type BudgetExtension,
  type BudgetLine,
  type BudgetLineCategory,
  type BudgetProject,
  type BudgetPeriod,
  type Category,
  type CategoryKind,
  type Currency,
  type Debt,
  type DebtPlan,
  type Person,
  type RateCurrency,
  type RateRow,
  type RatesMap,
  type Recurring,
  type RecurringFrequency,
  type RecurringSplit,
  type FinProfile,
  type NotifPrefs,
  type PushSubscriptionRow,
  type SavingsAllocationType,
  type SavingsGoal,
  type SavingsReason,
  type Transaction,
  type TransactionType,
} from '@/lib/finanzas/types'

interface MutationResult {
  error?: string
}

export interface QuickAddState {
  open: boolean
  lockType?: TransactionType
  editing?: Transaction | null
}

interface DataContextValue {
  loading: boolean
  error: string | null
  accounts: AccountWithBalance[]
  activeAccounts: AccountWithBalance[]
  categories: Category[]
  rates: RatesMap
  /** TODAS las filas de fin_transactions — alimenta el saldo, los totales y
   *  todo lo derivado. Incluye los ajustes de valor de cuentas de inversión. */
  allTx: Transaction[]
  /** `allTx` sin los ajustes de valor de inversión — lo que se lista en
   *  Movimientos y en "Últimos movimientos" (sprint-7 §4.7). */
  feedTx: Transaction[]
  monthTx: Transaction[]
  recentTx: Transaction[]
  /** Cuentas de inversión con al menos un ajuste de valor — el toggle de la
   *  cuenta ya no se puede destildar (§4.8). */
  investmentAdjustmentAccounts: Set<string>
  totalUsd: number
  monthGastoUsd: number
  monthIngresoUsd: number
  people: Person[]
  activePeople: Person[]
  debts: Debt[]
  /** Total pendiente — lo que muestra la pantalla de Deudas. */
  pendingDebtUsd: number
  /** Lo que ya venció o vence dentro de 7 días — la alerta de la Home
   *  (no adelanta cuotas futuras de un plan). */
  dueDebtUsd: number
  /** Del gasto bruto del mes, cuánto le corresponde a otros (solo el costo,
   *  no el margen; solo deudas no condonadas). */
  monthRepartidoUsd: number
  /** Gasto real del mes = bruto − repartido. */
  monthGastoRealUsd: number
  /** Deudas saldadas por cada movimiento (por id de transacción) — para que
   *  <TxRow> pueda mostrar "Cobro de <persona>" en vez de "Ingreso". */
  settledByTxId: Map<string, Debt[]>
  recurring: Recurring[]
  activeRecurring: Recurring[]
  /** Reparto por defecto de cada plantilla (§3.3 del sprint 3). */
  recurringSplitsByTemplate: Map<string, RecurringSplit[]>
  plans: DebtPlan[]
  budgetLines: BudgetLine[]
  budgetLineCategories: BudgetLineCategory[]
  budgetPeriods: BudgetPeriod[]
  hidden: boolean
  toggleHidden: () => void
  refresh: () => Promise<void>

  createAccount: (input: { name: string; currency: Currency; initial_balance: number; initial_balance_date: string; is_investment?: boolean }) => Promise<MutationResult>
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'currency' | 'initial_balance' | 'initial_balance_date' | 'sort_order' | 'archived' | 'is_investment'>>) => Promise<MutationResult>
  /** Reordena de una sola vez (una recarga al final, no una por cuenta). */
  reorderAccounts: (updates: { id: string; sort_order: number }[]) => Promise<MutationResult>
  deleteOrArchiveAccount: (id: string) => Promise<MutationResult>

  createTransaction: (input: {
    type: TransactionType
    date: string
    account_id: string
    to_account_id?: string | null
    category_id?: string | null
    amount: number
    to_amount?: number | null
    description?: string | null
    /** Sprint 6: un `gasto` puede ser un retiro de ahorro — el tipo ya fija la
     *  dirección (`retiro`), pero el motivo es obligatorio. */
    savings_goal_id?: string | null
    savings_reason?: SavingsReason | null
    /** Sprint 10 — a qué proyecto de negocio pertenece, si a alguno. Directo,
     *  no por categoría (sprint-10-perfiles-de-negocio.md §0). */
    project_id?: string | null
  }) => Promise<MutationResult>
  updateTransaction: (
    tx: Transaction,
    changes: Partial<Pick<Transaction, 'type' | 'date' | 'account_id' | 'to_account_id' | 'category_id' | 'amount' | 'to_amount' | 'description' | 'savings_goal_id' | 'savings_reason' | 'project_id'>>
  ) => Promise<MutationResult>
  deleteTransaction: (id: string) => Promise<MutationResult>
  /** "Actualizar valor" de una cuenta de inversión (sprint-7 §4.4): registra
   *  la diferencia entre `currentValue` y el saldo de hoy como un
   *  gasto/ingreso con `flow_type: 'movimiento'`. No hace nada si el delta es 0. */
  setAccountValue: (accountId: string, currentValue: number) => Promise<MutationResult>

  createCategory: (input: { name: string; kind: CategoryKind; icon?: string | null }) => Promise<MutationResult>
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'archived'>>) => Promise<MutationResult>
  seedCategoriesIfEmpty: () => Promise<MutationResult>

  /** Las filas de fin_rates tal como están (auto/manual, pair, updated_at) —
   *  para la pantalla de Ajustes. `rates` (arriba) es el mapa ya resuelto. */
  rateRows: RateRow[]
  updateRate: (currency: RateCurrency, rate: number) => Promise<MutationResult>
  setRateMode: (currency: RateCurrency, auto: boolean, quotePair?: string | null) => Promise<MutationResult>
  refreshRatesNow: () => Promise<MutationResult>

  createPerson: (name: string) => Promise<MutationResult & { id?: string }>
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'archived' | 'sort_order'>>) => Promise<MutationResult>
  deleteOrArchivePerson: (id: string) => Promise<MutationResult>

  /** Deuda suelta — nunca toca ninguna cuenta (sprint-2-deudas.md §4.1). */
  createDebt: (input: { person_id: string; concept: string; amount: number; currency: Currency; incurred_on: string }) => Promise<MutationResult>
  /** Gasto compartido: crea el gasto (bruto, tal cual) y una deuda por
   *  cada persona con `amount > 0` en `splits` (§4.2). */
  createSharedExpense: (input: {
    date: string
    account_id: string
    category_id?: string | null
    amount: number
    description?: string | null
    splits: { person_id: string; amount: number }[]
  }) => Promise<MutationResult>
  /** Cobra una o varias deudas (misma persona y moneda) de una vez (§4.3). */
  settleDebts: (input: { debtIds: string[]; account_id: string; amount: number; date: string }) => Promise<MutationResult>
  waiveDebt: (id: string) => Promise<MutationResult>
  deleteDebt: (id: string) => Promise<MutationResult>

  createRecurring: (input: {
    name: string
    icon?: string | null
    type: TransactionType
    amount: number
    currency: Currency
    category_id?: string | null
    frequency: RecurringFrequency
    day_of_month: number
    month_of_year?: number | null
    starts_on: string
    note?: string | null
    /** Sprint 6: si el fijo es un aporte a un ahorro. Con esto, `category_id`
     *  se ignora y registrar genera una transferencia tageada (§4.10). */
    savings_goal_id?: string | null
    to_account_id?: string | null
  }) => Promise<MutationResult & { id?: string }>
  updateRecurring: (
    id: string,
    patch: Partial<
      Pick<
        Recurring,
        'name' | 'icon' | 'type' | 'amount' | 'currency' | 'account_id' | 'category_id' | 'frequency' | 'day_of_month' | 'month_of_year' | 'starts_on' | 'active' | 'note' | 'sort_order' | 'savings_goal_id' | 'to_account_id'
      >
    >
  ) => Promise<MutationResult>
  deleteRecurring: (id: string) => Promise<MutationResult>
  /** Reemplaza el reparto por defecto completo de una plantilla. */
  setRecurringSplits: (recurringId: string, splits: { person_id: string; amount: number | null }[]) => Promise<MutationResult>
  /** Registra un período de un fijo: crea el movimiento (+ las deudas del
   *  reparto si aplica) y recuerda la cuenta usada (§4.3). `force` salta la
   *  guarda de idempotencia (dos cobros reales el mismo período). */
  registerRecurring: (input: {
    recurring_id: string
    date: string
    account_id: string
    category_id?: string | null
    amount: number
    description?: string | null
    splits?: { person_id: string; amount: number }[]
    /** Sprint 6: cuenta de ahorro destino, obligatoria al registrar un fijo de
     *  ahorro (se pide acá, no en la plantilla — §4.10). */
    to_account_id?: string | null
    force?: boolean
  }) => Promise<MutationResult & { alreadyRegistered?: boolean }>

  /** Convierte una deuda suelta pendiente en un plan de N cuotas — borra
   *  esa deuda original si las cuotas se crean bien (sprint-4-planes-de-pago.md §4.3). */
  createDebtPlan: (input: { debt_id: string; installments: { amount: number; date: string }[] }) => Promise<MutationResult>
  /** Solo si ninguna cuota fue tocada (§4.4). */
  deleteDebtPlan: (id: string) => Promise<MutationResult>
  /** Recalcula solo las cuotas pendientes — las cobradas/condonadas no se
   *  tocan (§4.5). */
  regenerateDebtPlan: (input: { plan_id: string; installments: { amount: number; date: string }[] }) => Promise<MutationResult>

  // ── Presupuesto (Sprint 5) ──────────────────────────────────────────
  /** Líneas del período vigente ya resueltas + el tope general + los meses
   *  por cerrar. La UI solo pinta. */
  budgetView: { lines: BudgetLineView[]; general: BudgetGeneralView | null; pendingClosures: PendingClosure[]; period: string }
  /** Disponible USD de la línea que contiene esa categoría (para el bloqueo
   *  del quick-add). `null` si la categoría no tiene línea. */
  availableForCategory: (categoryId: string | null) => number | null
  budgetViewMode: BudgetViewMode
  setBudgetViewMode: (mode: BudgetViewMode) => void
  createBudgetLine: (input: {
    name?: string | null
    categoryIds: string[]
    input_currency: Currency
    amount: number
    retroactive: boolean
  }) => Promise<MutationResult>
  updateBudgetLine: (id: string, patch: { name?: string | null; categoryIds?: string[] }) => Promise<MutationResult>
  deleteBudgetLine: (id: string) => Promise<MutationResult>
  /** Monto de un período puntual (upsert). `amount` en la moneda de la línea. */
  setBudgetPeriodAmount: (lineId: string, period: string, amount: number) => Promise<MutationResult>
  /** Amplía el límite de un mes puntual (§4.6). Materializa el período si hace falta. */
  extendBudget: (lineId: string, period: string, amount: number) => Promise<MutationResult>
  /** Responde la pregunta de cierre de un mes: `carried` = se lleva al siguiente. */
  closeBudgetPeriod: (lineId: string, period: string, carried: boolean) => Promise<MutationResult>

  // ── Ahorro (Sprint 6) ───────────────────────────────────────────────
  savingsGoals: SavingsGoal[]
  /** Ahorros del ciclo vigente ya resueltos (saldo, meta, aporte pendiente) +
   *  el sobrante del mes por organizar. La UI solo pinta. */
  savingsView: SavingsOverview
  /** Cuánto del saldo de cada cuenta está apartado, en la moneda de la cuenta
   *  (`Map<accountId, nativo>`). Para el piso de ahorro (§4.6). */
  savingsByAccount: Map<string, number>
  /** Lo que un ahorro tiene apartado en una cuenta puntual, en la moneda de
   *  esa cuenta — el tope de un retiro y de un traslado. */
  savingsInAccount: (goalId: string, accountId: string) => number
  createSavingsGoal: (input: {
    name: string
    input_currency: Currency
    allocation_type: SavingsAllocationType
    allocation_value: number
    target_amount?: number | null
    target_date?: string | null
    is_catchall?: boolean
  }) => Promise<MutationResult>
  updateSavingsGoal: (
    id: string,
    patch: Partial<Pick<SavingsGoal, 'name' | 'input_currency' | 'allocation_type' | 'allocation_value' | 'target_amount' | 'target_date' | 'is_catchall' | 'archived' | 'sort_order'>>
  ) => Promise<MutationResult>
  deleteSavingsGoal: (id: string) => Promise<MutationResult>
  /** "Ahorrar": guarda un mes ya terminado en UN plan (§4.5). Origen y destino
   *  pueden ser la misma cuenta (guardar sin mover de banco). */
  saveSavingsForPeriod: (input: {
    goal_id: string
    period: string
    from_account_id: string
    to_account_id?: string | null
    amount: number
    date?: string
  }) => Promise<MutationResult>
  /** El traslado (§4.11): mueve lo apartado de un ahorro de una cuenta a otra
   *  distinta, sin cambiar el saldo del ahorro. */
  moveSavings: (input: {
    goal_id: string
    from_account_id: string
    to_account_id: string
    amount: number
    to_amount?: number | null
    date?: string
    description?: string | null
  }) => Promise<MutationResult>

  // ── Proyectos (Sprint 10) ─────────────────────────────────────────────
  /** Solo en perfiles `negocio` (aunque la tabla no lo exige) —
   *  sprint-10-perfiles-de-negocio.md §3.2. */
  budgetProjects: BudgetProject[]
  /** "Comparar" (§4.4): todos los proyectos con su ganancia neta y su
   *  progreso, de mayor a menor ganancia. La UI filtra archivados si hace
   *  falta — la vista trae los dos. */
  projectsView: ProjectComparisonRow[]
  createProject: (input: { name: string; target_amount: number; target_currency: Currency }) => Promise<MutationResult & { id?: string }>
  updateProject: (id: string, patch: Partial<Pick<BudgetProject, 'name' | 'archived' | 'sort_order'>>) => Promise<MutationResult>
  /** Borra si no tiene movimientos etiquetados; si tiene, el `on delete
   *  restrict` lo rechaza y se archiva en su lugar (§4.7) — mismo patrón que
   *  `deleteOrArchiveAccount`/`deleteOrArchiveProfile`. */
  deleteOrArchiveProject: (id: string) => Promise<MutationResult>

  // ── Perfiles (Sprint 8) ───────────────────────────────────────────────
  /** Todos los perfiles del usuario (activos y archivados) — para el
   *  selector y la pantalla de Ajustes. */
  profiles: FinProfile[]
  /** El perfil que están filtrando `load()` y cada mutación. Nunca `null`
   *  una vez que `loading` es `false` — siempre hay al menos un default. */
  activeProfileId: string | null
  activeProfile: FinProfile | null
  /** Solo el acento — es lo único que necesita `<FinanzasShell>` para pintar
   *  `#fz-root` desde el primer render (§4.10), sin ir a buscar el perfil. */
  activeAccent: AccentKey
  switchProfile: (id: string) => void
  createProfile: (input: { name: string; accent?: AccentKey; tipo?: FinProfile['tipo']; display_currency?: Currency }) => Promise<MutationResult & { id?: string }>
  updateProfile: (id: string, patch: Partial<Pick<FinProfile, 'name' | 'accent' | 'archived' | 'notify' | 'tipo' | 'display_currency'>>) => Promise<MutationResult>
  /** Borra si el perfil no tiene datos en ninguna de las 14 tablas (el
   *  `DELETE` es atómico por `on delete restrict` — si falla, nada se tocó);
   *  si tiene, lo archiva en su lugar (§4.5). */
  deleteOrArchiveProfile: (id: string) => Promise<MutationResult>

  // ── Notificaciones (Sprint 9) ────────────────────────────────────────
  /** `null` hasta que exista una fila propia — el efectivo es
   *  `notifPrefs ?? DEFAULT_NOTIF_PREFS` (mismos valores que traen las
   *  columnas por default en la base, sprint-9 §3.2). */
  notifPrefs: NotifPrefs | null
  /** Los dispositivos de ESTE usuario que aceptaron recibir — para "cuántos
   *  dispositivos" en Ajustes. `push-setup.tsx` decide si ESTE navegador es
   *  uno de ellos comparando su propio `endpoint`, no algo que guarde el
   *  contexto (es una API async del navegador, no un dato de Supabase). */
  pushSubscriptions: PushSubscriptionRow[]
  /** Guarda o refresca la suscripción de este dispositivo (`upsert` por
   *  `endpoint`, sprint-9 §3.1) y, si todavía no existe, siembra
   *  `fin_notif_prefs` con los defaults — activar notificaciones deja
   *  siempre las dos filas listas. */
  subscribeToPush: (sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) => Promise<MutationResult>
  /** Borra la suscripción de ESTE dispositivo — los demás siguen recibiendo. */
  unsubscribeFromPush: (endpoint: string) => Promise<MutationResult>
  updateNotifPrefs: (patch: Partial<NotifPrefs>) => Promise<MutationResult>

  quickAdd: QuickAddState
  openQuickAdd: (opts?: { lockType?: TransactionType; editing?: Transaction }) => void
  closeQuickAdd: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function useFinanzas(): DataContextValue {
  const v = useContext(DataContext)
  if (!v) throw new Error('useFinanzas debe usarse dentro de <FinanzasDataProvider>')
  return v
}

function isPgError(message: string): string {
  if (message.includes('fin_profiles_default_no_archivado')) return 'El perfil por defecto no se puede archivar.'
  if (message.includes('fin_profiles') && message.includes('unique') && message.includes('name')) {
    return 'Ya tenés un perfil con ese nombre.'
  }
  if (message.includes('fin_tx_shape')) return 'Ese movimiento no tiene una forma válida.'
  if (message.includes('fin_debt_origin_shape')) return 'Una deuda suelta necesita un concepto.'
  if (message.includes('fin_recurring_anual_shape')) return 'Un fijo anual necesita su mes; uno mensual no lleva mes.'
  if (message.includes('fin_recurring_splits') && message.includes('check')) {
    return 'Cada persona del reparto necesita un monto positivo, o "parte pareja".'
  }
  if (message.includes('violates row-level security')) return 'No se pudo guardar: revisa tu sesión.'
  // El orden de estos tres importa: los tres matchean "foreign key", pero
  // cada uno tiene un motivo real distinto (ver decisiones_tecnicas.md §3
  // del repo de referencia sobre por qué esto es frágil — pendiente migrar
  // a leer error.code/SQLSTATE en vez de texto, señalado en la revisión
  // del Sprint 2).
  if (message.includes('fin_recurring_splits') && message.includes('foreign key')) {
    return 'No se puede borrar: esta persona forma parte del reparto de un fijo. Sacala de ahí primero, o archivala.'
  }
  if (message.includes('fin_debts') && (message.includes('foreign key') || message.includes('on delete restrict'))) {
    return 'No se puede borrar: este movimiento generó una o más deudas. Borrá esas deudas primero, o dejalas como están.'
  }
  if (message.includes('on delete restrict') || message.includes('foreign key')) {
    return 'No se puede borrar: tiene movimientos asociados. Archívalo en su lugar.'
  }
  return message
}

/** Foto del último `load()` bueno, en localStorage y por usuario, para pintar
 *  la app al instante en la siguiente visita mientras el fetch real corre por
 *  detrás (la "capa 2" que el Sprint 1 había dejado afuera — §0.2). */
interface Snapshot {
  v: number
  rawAccounts: Account[]
  categories: Category[]
  rateRows: RateRow[]
  allTx: Transaction[]
  people: Person[]
  debts: Debt[]
  recurring: Recurring[]
  recurringSplits: RecurringSplit[]
  plans: DebtPlan[]
  budgetLines: BudgetLine[]
  budgetLineCategories: BudgetLineCategory[]
  budgetPeriods: BudgetPeriod[]
  budgetExtensions: BudgetExtension[]
  budgetClosures: BudgetClosure[]
  savingsGoals: SavingsGoal[]
  profiles: FinProfile[]
  budgetProjects: BudgetProject[]
}
// Sprint 8: la clave gana el perfil — sin esto, cambiar de perfil pintaría un
// instante el patrimonio del anterior (§4.8). SNAPSHOT_VERSION sube a 5 para
// descartar los snapshots viejos (sin `:profileId`) sin migrarlos.
const SNAPSHOT_VERSION = 5
const snapshotKey = (userId: string, profileId: string) => `fz:snapshot:${userId}:${profileId}`

function readSnapshot(userId: string, profileId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(userId, profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Snapshot
    return parsed?.v === SNAPSHOT_VERSION ? parsed : null
  } catch {
    return null
  }
}
function writeSnapshot(userId: string, profileId: string, snap: Omit<Snapshot, 'v'>): void {
  try {
    localStorage.setItem(snapshotKey(userId, profileId), JSON.stringify({ v: SNAPSHOT_VERSION, ...snap }))
  } catch {
    // Cuota llena (allTx grande) o navegación privada: sin snapshot, la
    // próxima visita muestra el skeleton — no es un error.
  }
}

/** El perfil activo por dispositivo (sprint-8 §4.8) — mismo patrón que
 *  `fz:hidden`/`fz:budgetmode`. Se guarda el acento junto al id, no solo el
 *  id: pintar el primer frame en verde para corregirlo un instante después
 *  es un color falso, el mismo motivo por el que existe el snapshot. */
const PROFILE_PREF_KEY = 'fz:profile'
interface ProfilePref {
  id: string
  accent: AccentKey
}
function readProfilePref(): ProfilePref | null {
  try {
    const raw = localStorage.getItem(PROFILE_PREF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProfilePref>
    if (typeof parsed?.id !== 'string') return null
    const accent = ACCENT_KEYS.includes(parsed.accent as AccentKey) ? (parsed.accent as AccentKey) : 'verde'
    return { id: parsed.id, accent }
  } catch {
    return null
  }
}
function writeProfilePref(pref: ProfilePref): void {
  try {
    localStorage.setItem(PROFILE_PREF_KEY, JSON.stringify(pref))
  } catch {
    /* ver readSnapshot */
  }
}

export function FinanzasDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthedUser()
  // Sprint 8: el perfil activo se resuelve ANTES que nada — el snapshot
  // mismo depende de su id para armar la clave (§4.8). `activeProfileId`
  // arranca en lo que diga fz:profile; `load()` lo confirma o lo corrige
  // (perfil archivado/borrado desde otro dispositivo → cae al default, §4.1)
  // y crea el default para un usuario que todavía no tiene ninguno.
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => readProfilePref()?.id ?? null)
  const [activeAccent, setActiveAccent] = useState<AccentKey>(() => readProfilePref()?.accent ?? 'verde')
  // Hidrata del snapshot en el primer render: la app aparece con datos, no en
  // blanco, y `load()` los reemplaza en silencio un instante después. Sin
  // perfil todavía cacheado (primera visita en este dispositivo) no hay
  // clave que armar — arranca en blanco, como cualquier usuario nuevo.
  const [snap] = useState<Snapshot | null>(() => {
    const pref = readProfilePref()
    return pref ? readSnapshot(user.id, pref.id) : null
  })
  const [profiles, setProfiles] = useState<FinProfile[]>(snap?.profiles ?? [])
  const [rawAccounts, setRawAccounts] = useState<Account[]>(snap?.rawAccounts ?? [])
  const [categories, setCategories] = useState<Category[]>(snap?.categories ?? [])
  const [rateRows, setRateRows] = useState<RateRow[]>(snap?.rateRows ?? [])
  const [allTx, setAllTx] = useState<Transaction[]>(snap?.allTx ?? [])
  const [people, setPeople] = useState<Person[]>(snap?.people ?? [])
  const [debts, setDebts] = useState<Debt[]>(snap?.debts ?? [])
  const [recurring, setRecurring] = useState<Recurring[]>(snap?.recurring ?? [])
  const [recurringSplits, setRecurringSplitsState] = useState<RecurringSplit[]>(snap?.recurringSplits ?? [])
  const [plans, setPlans] = useState<DebtPlan[]>(snap?.plans ?? [])
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>(snap?.budgetLines ?? [])
  const [budgetLineCategories, setBudgetLineCategories] = useState<BudgetLineCategory[]>(snap?.budgetLineCategories ?? [])
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>(snap?.budgetPeriods ?? [])
  const [budgetExtensions, setBudgetExtensions] = useState<BudgetExtension[]>(snap?.budgetExtensions ?? [])
  const [budgetClosures, setBudgetClosures] = useState<BudgetClosure[]>(snap?.budgetClosures ?? [])
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(snap?.savingsGoals ?? [])
  const [budgetProjects, setBudgetProjects] = useState<BudgetProject[]>(snap?.budgetProjects ?? [])
  // Sprint 9 · Notificaciones — sin snapshot: es del USUARIO, no del perfil
  // (§3.2), y no es parte del "instant paint" de la Home — cargar en blanco
  // un instante hasta que load() resuelva es aceptable para una pantalla de
  // Ajustes que se visita poco.
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null)
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionRow[]>([])
  // Si hubo snapshot, no arrancamos en "loading" — nada de skeletons cuando
  // ya hay algo para mostrar.
  const [loading, setLoading] = useState(snap == null)
  const [error, setError] = useState<string | null>(null)
  // Lazy initializer en vez de leer localStorage en un efecto: evita el
  // parpadeo de un segundo render y no dispara `set-state-in-effect`. Puede
  // ejecutarse sin `window` (build estático) o en navegación privada — de
  // ahí el try/catch, con `false` como default seguro en ambos casos.
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('fz:hidden') === '1'
    } catch {
      return false
    }
  })
  // Cómo se ve el progreso de un presupuesto (§0 del sprint 5) — se aplica
  // igual en Presupuesto y en la Home.
  const [budgetViewMode, setBudgetViewModeState] = useState<BudgetViewMode>(() => {
    try {
      return localStorage.getItem('fz:budgetmode') === 'disponible' ? 'disponible' : 'gastado'
    } catch {
      return 'gastado'
    }
  })
  const [quickAdd, setQuickAdd] = useState<QuickAddState>({ open: false })
  // Sprint 8 · revisión: dos `load()` en vuelo a la vez (un switchProfile
  // rápido tras otro, o el doble-montaje de StrictMode) podían terminar en
  // cualquier orden — si el más viejo resolvía último, sus `setState`
  // pisaban los del más nuevo y la pantalla quedaba mostrando la plata de un
  // perfil bajo el nombre de otro (mismo bug que la referencia encontró en
  // su `reload()`, §0.3 punto 2 de su sprint 8). Un contador simple: cada
  // `load()` guarda su propio número al empezar, y antes de tocar el estado
  // chequea que siga siendo el más nuevo — si no, se descarta en silencio.
  const loadGenerationRef = useRef(0)

  const toggleHidden = useCallback(() => {
    setHidden(prev => {
      const next = !prev
      try {
        localStorage.setItem('fz:hidden', next ? '1' : '0')
      } catch {
        /* ver arriba */
      }
      return next
    })
  }, [])

  const setBudgetViewMode = useCallback((mode: BudgetViewMode) => {
    setBudgetViewModeState(mode)
    try {
      localStorage.setItem('fz:budgetmode', mode)
    } catch {
      /* ver arriba */
    }
  }, [])

  const load = useCallback(async (profileIdOverride?: string) => {
    if (!supabase) return
    const myGeneration = ++loadGenerationRef.current
    const stillCurrent = () => loadGenerationRef.current === myGeneration
    setError(null)

    // Sprint 8 · Perfiles — se resuelve ANTES que cualquier otra consulta:
    // todas necesitan su id para filtrar (§4.1/§4.2). `profileIdOverride` lo
    // manda `switchProfile()` — leer el estado acá adentro vería el valor
    // viejo (closure), no el que se acaba de elegir.
    const { data: profileRows, error: profilesError } = await supabase
      .from('fin_profiles')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (!stillCurrent()) return
    if (profilesError) {
      setError(profilesError.message)
      setLoading(false)
      return
    }
    let profileList = (profileRows as FinProfile[]) ?? []
    let resolvedId = resolveActiveProfileId(profileList, profileIdOverride ?? readProfilePref()?.id ?? null)

    if (!resolvedId) {
      // Nadie tiene perfiles todavía — se crea el default acá, no en la
      // migración, porque una migración no puede conocer el auth.uid() de
      // quien la corre (mismo motivo que ya sembraba fin_rates, más abajo).
      const { data: created, error: createError } = await supabase
        .from('fin_profiles')
        .insert({ user_id: user.id, name: defaultProfileName(user.email), accent: 'verde', is_default: true, sort_order: 0 })
        .select('*')
        .single()
      if (!stillCurrent()) return
      if (createError || !created) {
        // Dos pestañas/dispositivos abriendo Finanzas por primera vez a la
        // vez disparan dos `load()` que ven cero perfiles y las dos intentan
        // crear el default — `unique(user_id,name)` deja pasar a una sola.
        // La referencia pegó justo este choque (§0.3 punto 5 de su sprint
        // 8, ahí por una carrera de requests en vez de pestañas) y en vez de
        // fallar, releyó la lista: quien perdió la carrera de todos modos ya
        // tiene su perfil, solo tiene que ir a buscarlo. Sin esto la segunda
        // pestaña se quedaba mostrando "Ya tenés un perfil con ese nombre"
        // como si fuera un error real.
        const isNameCollision = createError?.message?.includes('unique') && createError.message.includes('fin_profiles')
        if (isNameCollision) {
          const { data: retryRows, error: retryError } = await supabase
            .from('fin_profiles')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
          if (!stillCurrent()) return
          if (!retryError && retryRows && retryRows.length > 0) {
            profileList = retryRows as FinProfile[]
            resolvedId = resolveActiveProfileId(profileList, profileIdOverride ?? readProfilePref()?.id ?? null)
          }
        }
        if (!resolvedId) {
          setError(isPgError(createError?.message ?? 'No se pudo crear tu perfil.'))
          setLoading(false)
          return
        }
      } else {
        const { error: seedError } = await supabase
          .from('fin_categories')
          .insert(SEED_CATEGORIES.map(c => ({ ...c, user_id: user.id, profile_id: created.id })))
        if (seedError) {
          // El perfil ya existe y es usable sin categorías — Ajustes ya tiene
          // "Sembrar categorías iniciales" como red de seguridad si esto falla.
        }
        profileList = [created as FinProfile]
        resolvedId = created.id
      }
    }
    // `resolveActiveProfileId` solo devuelve `null` cuando `profileList`
    // viene vacío (§ arriba) — ese caso ya se resolvió creando el default (o
    // releyendo el de quien ganó la carrera), así que acá `resolvedId` es
    // siempre un id real. El guard es para que TS lo sepa también
    // (created.id llega sin tipar desde supabase-js).
    if (!resolvedId) {
      setError('No se pudo resolver tu perfil.')
      setLoading(false)
      return
    }
    if (!stillCurrent()) return

    setProfiles(profileList)
    setActiveProfileIdState(resolvedId)
    const resolvedAccent = (profileList.find(p => p.id === resolvedId)?.accent as AccentKey) ?? 'verde'
    setActiveAccent(resolvedAccent)
    writeProfilePref({ id: resolvedId, accent: resolvedAccent })

    // ⚠️ Límite conocido, señalado en la revisión del Sprint 2: `computeBalance()`
    // suma TODO lo que venga en `allTx` (lib/finanzas/accounts.ts) — si algún
    // usuario supera los 2000 movimientos históricos, los más viejos quedan
    // afuera de este `select` y el saldo/patrimonio se calcularía mal, sin
    // ningún aviso. Todavía no hace falta resolverlo (nadie está cerca de
    // 2000 movimientos), pero el día que se acerque, la salida es sumar los
    // saldos en SQL (una función que agregue por cuenta) en vez de subir
    // el número a mano — subirlo solo pospone el problema.
    //
    // La revisión del Sprint 3 encontró dos consecuencias más del mismo
    // límite, en vez de bugs nuevos independientes: `hasTx` en
    // updateAccount()/deleteOrArchiveAccount() (más abajo) también mira
    // `allTx`, así que para una cuenta cuyos únicos movimientos quedaran
    // afuera de estos 2000, (a) el selector de moneda se habilitaría sin
    // deber estarlo, y (b) un borrado intentaría un DELETE en vez de
    // archivar — este segundo caso lo salva la propia base (`on delete
    // restrict` en fin_transactions.account_id), pero por casualidad, no
    // por diseño. Arreglan los tres de una vez el día que se resuelva el
    // límite, no antes.
    const [
      accountsRes,
      categoriesRes,
      ratesRes,
      txRes,
      peopleRes,
      debtsRes,
      recurringRes,
      recurringSplitsRes,
      plansRes,
      budgetLinesRes,
      budgetLineCategoriesRes,
      budgetPeriodsRes,
      budgetExtensionsRes,
      budgetClosuresRes,
      savingsGoalsRes,
      budgetProjectsRes,
      notifPrefsRes,
      pushSubsRes,
    ] = await Promise.all([
      // Sprint 8: cada una de estas 14 (todo el dominio salvo fin_rates, que
      // queda global — §3.6) suma `.eq('profile_id', resolvedId)`. Es el
      // único lugar que hace falta tocar para que TODA la app quede filtrada
      // por perfil — no hay 50 puntos de llamada, hay uno.
      supabase.from('fin_accounts').select('*').eq('profile_id', resolvedId).order('sort_order', { ascending: true }),
      supabase.from('fin_categories').select('*').eq('profile_id', resolvedId).order('kind').order('sort_order'),
      supabase.from('fin_rates').select('currency, rate, auto, quote_pair, updated_at'),
      supabase
        .from('fin_transactions')
        .select('*')
        .eq('profile_id', resolvedId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase.from('fin_people').select('*').eq('profile_id', resolvedId).order('sort_order', { ascending: true }),
      supabase.from('fin_debts').select('*').eq('profile_id', resolvedId).order('incurred_on', { ascending: false }),
      supabase.from('fin_recurring').select('*').eq('profile_id', resolvedId).order('sort_order', { ascending: true }),
      supabase.from('fin_recurring_splits').select('*').eq('profile_id', resolvedId),
      supabase.from('fin_debt_plans').select('*').eq('profile_id', resolvedId),
      supabase
        .from('fin_budget_lines')
        .select('*')
        .eq('profile_id', resolvedId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('fin_budget_line_categories').select('*').eq('profile_id', resolvedId),
      supabase.from('fin_budget_periods').select('*').eq('profile_id', resolvedId),
      supabase.from('fin_budget_extensions').select('*').eq('profile_id', resolvedId),
      supabase.from('fin_budget_closures').select('*').eq('profile_id', resolvedId),
      supabase
        .from('fin_savings_goals')
        .select('*')
        .eq('profile_id', resolvedId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      // Sprint 10 — a diferencia de las 14 tablas del Sprint 8, esta NO
      // bloquea el resto de la app si falla: es una tabla nueva (no una
      // columna nueva en una tabla vieja), así que hasta que se corra la
      // §20 esta consulta devuelve "relation does not exist" — y eso no
      // puede tirar abajo Movimientos/Cuentas/Deudas para un perfil
      // personal al que Proyectos ni le importa. Mismo criterio que
      // notifPrefsRes/pushSubsRes de acá abajo.
      supabase
        .from('fin_budget_projects')
        .select('*')
        .eq('profile_id', resolvedId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      // Sprint 9 · Notificaciones — por usuario, no por perfil (§3.2), y
      // NUNCA bloquean el resto de la app: una base sin la migración §19
      // corrida todavía (fin_notif_prefs/fin_push_subscriptions no existen)
      // deja el resto de Finanzas funcionando igual — mismo criterio que
      // is_investment en el Sprint 7. Por eso van fuera del `firstError` de
      // abajo.
      supabase.from('fin_notif_prefs').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('fin_push_subscriptions').select('id, endpoint, user_agent, created_at, last_ok_at').eq('user_id', user.id),
    ])
    if (!stillCurrent()) return

    const firstError =
      accountsRes.error ||
      categoriesRes.error ||
      ratesRes.error ||
      txRes.error ||
      peopleRes.error ||
      debtsRes.error ||
      recurringRes.error ||
      recurringSplitsRes.error ||
      plansRes.error ||
      budgetLinesRes.error ||
      budgetLineCategoriesRes.error ||
      budgetPeriodsRes.error ||
      budgetExtensionsRes.error ||
      budgetClosuresRes.error ||
      savingsGoalsRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    // Postgres devuelve las columnas `numeric` como texto (ver toNum en
    // lib/finanzas/types.ts) — se convierten acá, una sola vez por fila, al
    // entrar a la app. Sin esto, computeBalance() y monthTotals() rompen en
    // cuanto exista un `ingreso` (`+=` sobre string concatena en vez de sumar).
    const accountRows = ((accountsRes.data as Account[]) ?? []).map(a => ({
      ...a,
      initial_balance: toNum(a.initial_balance),
      // Sprint 7: `false` explícito para bases sin la migración §17.
      is_investment: a.is_investment ?? false,
    }))
    const txRows = ((txRes.data as Transaction[]) ?? []).map(t => ({
      ...t,
      amount: toNum(t.amount),
      to_amount: t.to_amount == null ? null : toNum(t.to_amount),
      exchange_rate: toNum(t.exchange_rate),
      amount_usd: toNum(t.amount_usd),
      to_exchange_rate: t.to_exchange_rate == null ? null : toNum(t.to_exchange_rate),
      to_amount_usd: t.to_amount_usd == null ? null : toNum(t.to_amount_usd),
      // Sprint 6: `null` explícito para las bases donde la migración §16
      // todavía no corrió (columnas ausentes → `undefined`).
      savings_goal_id: t.savings_goal_id ?? null,
      savings_flow: t.savings_flow ?? null,
      savings_reason: t.savings_reason ?? null,
      savings_period: t.savings_period == null ? null : String(t.savings_period).slice(0, 10),
    }))
    const rateRowsData: RateRow[] = ((ratesRes.data as RateRow[]) ?? []).map(r => ({
      currency: r.currency,
      rate: toNum(r.rate),
      auto: r.auto !== false,
      quote_pair: r.quote_pair ?? null,
      updated_at: r.updated_at,
    }))

    // Siembra las 4 filas que falten (automáticas, con el fallback como
    // punto de partida) — así Ajustes nunca muestra una moneda sin fila.
    // Ninguna migración puede hacer esto porque no conoce el auth.uid() de
    // quien la corre. El refresco real de las tasas vencidas corre aparte,
    // sin bloquear el render (ver refreshStaleRates + el efecto de montaje).
    const missing = RATE_CURRENCIES.filter(c => !rateRowsData.some(r => r.currency === c))
    if (missing.length > 0) {
      const seedIso = new Date(0).toISOString() // vencida a propósito → se refresca ya
      const { error: seedErr } = await supabase.from('fin_rates').insert(
        missing.map(c => ({ user_id: user.id, currency: c, rate: FALLBACK_RATES[c], auto: true, quote_pair: null, updated_at: seedIso }))
      )
      if (!seedErr) {
        for (const c of missing) rateRowsData.push({ currency: c, rate: FALLBACK_RATES[c], auto: true, quote_pair: null, updated_at: seedIso })
      }
    }

    const debtRows = ((debtsRes.data as Debt[]) ?? []).map(d => ({
      ...d,
      amount: toNum(d.amount),
      exchange_rate: toNum(d.exchange_rate),
      amount_usd: toNum(d.amount_usd),
      principal_usd: toNum(d.principal_usd),
      waived_on: d.waived_on ?? null,
      settled_margin_transaction_id: d.settled_margin_transaction_id ?? null,
    }))
    const recurringRows = ((recurringRes.data as Recurring[]) ?? []).map(r => ({
      ...r,
      amount: toNum(r.amount),
      // Sprint 6 · `null` explícito para bases sin la migración §16.
      savings_goal_id: r.savings_goal_id ?? null,
      to_account_id: r.to_account_id ?? null,
    }))
    const recurringSplitRows = ((recurringSplitsRes.data as RecurringSplit[]) ?? []).map(s => ({
      ...s,
      amount: s.amount == null ? null : toNum(s.amount),
    }))
    const plansRows = ((plansRes.data as DebtPlan[]) ?? []).map(p => ({
      ...p,
      principal: toNum(p.principal),
    }))

    const categoryRows = (categoriesRes.data as Category[]) ?? []
    const peopleRows = (peopleRes.data as Person[]) ?? []
    const budgetLineRows = (budgetLinesRes.data as BudgetLine[]) ?? []
    const budgetLineCategoryRows = (budgetLineCategoriesRes.data as BudgetLineCategory[]) ?? []
    const budgetPeriodRows = ((budgetPeriodsRes.data as BudgetPeriod[]) ?? []).map(p => ({
      ...p,
      period: p.period.slice(0, 10),
      amount: toNum(p.amount),
      exchange_rate: toNum(p.exchange_rate),
      amount_usd: toNum(p.amount_usd),
    }))
    const budgetExtensionRows = ((budgetExtensionsRes.data as BudgetExtension[]) ?? []).map(e => ({
      ...e,
      amount: toNum(e.amount),
      exchange_rate: toNum(e.exchange_rate),
      amount_usd: toNum(e.amount_usd),
    }))
    const budgetClosureRows = ((budgetClosuresRes.data as BudgetClosure[]) ?? []).map(c => ({
      ...c,
      period: c.period.slice(0, 10),
      amount_usd: toNum(c.amount_usd),
    }))
    const savingsGoalRows = ((savingsGoalsRes.data as SavingsGoal[]) ?? []).map(g => ({
      ...g,
      allocation_value: toNum(g.allocation_value),
      target_amount: g.target_amount == null ? null : toNum(g.target_amount),
      target_date: g.target_date ?? null,
      created_on: String(g.created_on).slice(0, 10),
    }))
    // budgetProjectsRes puede venir con error (tabla §20 sin migrar
    // todavía) — mismo criterio que notifPrefsRes/pushSubsRes: se ignora en
    // silencio y queda en `[]`, no tira abajo el resto del load().
    const budgetProjectRows = budgetProjectsRes.error
      ? []
      : ((budgetProjectsRes.data as BudgetProject[]) ?? []).map(p => ({
          ...p,
          target_amount: toNum(p.target_amount),
          exchange_rate: toNum(p.exchange_rate),
          target_amount_usd: toNum(p.target_amount_usd),
        }))

    if (!stillCurrent()) return

    setRawAccounts(accountRows)
    setCategories(categoryRows)
    setRateRows(rateRowsData)
    setAllTx(txRows)
    setPeople(peopleRows)
    setDebts(debtRows)
    setRecurring(recurringRows)
    setRecurringSplitsState(recurringSplitRows)
    setPlans(plansRows)
    setBudgetLines(budgetLineRows)
    setBudgetLineCategories(budgetLineCategoryRows)
    setBudgetPeriods(budgetPeriodRows)
    setBudgetExtensions(budgetExtensionRows)
    setBudgetClosures(budgetClosureRows)
    setSavingsGoals(savingsGoalRows)
    setBudgetProjects(budgetProjectRows)
    // notifPrefsRes/pushSubsRes pueden venir con error (tablas §19 sin
    // migrar todavía) — se ignoran en silencio y quedan en su default
    // (null / []), en vez de tirar abajo el resto del load().
    const notifPrefsRow = notifPrefsRes.error ? null : (notifPrefsRes.data as NotifPrefs | null)
    setNotifPrefs(
      notifPrefsRow && {
        ...notifPrefsRow,
        // Postgres devuelve `time` como "HH:MM:SS" — se recorta a "HH:MM",
        // el formato que espera <input type="time"> (mismo criterio que
        // `period`/`created_on` más arriba: más precisión de la que la app
        // necesita, se recorta una sola vez al entrar).
        recordar_mediodia: String(notifPrefsRow.recordar_mediodia).slice(0, 5),
        recordar_noche: String(notifPrefsRow.recordar_noche).slice(0, 5),
      }
    )
    setPushSubscriptions(pushSubsRes.error ? [] : ((pushSubsRes.data as PushSubscriptionRow[]) ?? []))
    setLoading(false)

    writeSnapshot(user.id, resolvedId, {
      rawAccounts: accountRows,
      categories: categoryRows,
      rateRows: rateRowsData,
      allTx: txRows,
      people: peopleRows,
      debts: debtRows,
      recurring: recurringRows,
      recurringSplits: recurringSplitRows,
      plans: plansRows,
      budgetLines: budgetLineRows,
      budgetLineCategories: budgetLineCategoryRows,
      budgetPeriods: budgetPeriodRows,
      budgetExtensions: budgetExtensionRows,
      budgetClosures: budgetClosureRows,
      savingsGoals: savingsGoalRows,
      profiles: profileList,
      budgetProjects: budgetProjectRows,
    })
  }, [user.id, user.email])

  // Refresca las tasas automáticas vencidas (TTL en quotes.ts) contra dos
  // fuentes públicas — fetch desde el cliente, sin servidor. Corre APARTE
  // de load() para no meter la latencia de la red (hasta 4 s si una fuente
  // no responde) en el render inicial: cuando llega, hace un setRateRows
  // puntual y la UI se actualiza sola. El TTL corta antes de cualquier
  // request, así que en el uso normal esto no toca la red.
  const refreshStaleRates = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('fin_rates').select('currency, quote_pair, auto, updated_at')
    const rows = (data ?? []) as { currency: RateCurrency; quote_pair: string | null; auto: boolean | null; updated_at: string }[]
    const stale = rows.filter(r => r.auto !== false && isStale(r.updated_at))
    if (stale.length === 0) return

    const quotes = await fetchQuotes()
    const nowIso = new Date().toISOString()
    const upserts = stale
      .map(r => ({ r, pair: (r.quote_pair as QuotePair | null) ?? defaultPairFor(r.currency) }))
      .filter(({ pair }) => quotes[pair] != null)
      .map(({ r, pair }) => ({
        user_id: user.id,
        currency: r.currency,
        rate: quotes[pair]!,
        auto: true,
        quote_pair: r.quote_pair,
        updated_at: nowIso,
      }))
    if (upserts.length === 0) return

    const { error } = await supabase.from('fin_rates').upsert(upserts, { onConflict: 'user_id,currency' })
    if (error) return
    setRateRows(prev =>
      prev.map(row => {
        const hit = upserts.find(u => u.currency === row.currency)
        return hit ? { ...row, rate: hit.rate, updated_at: nowIso } : row
      })
    )
  }, [user.id])

  useEffect(() => {
    // Fetch al montar: no hay forma de disparar trabajo async sin un
    // efecto, así que esta es la excepción legítima a la regla — el mismo
    // patrón ya sin resolver en app/daily/NotesModal.tsx de este proyecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then(() => refreshStaleRates())
  }, [load, refreshStaleRates])

  const rates = useMemo(() => buildRatesMap(rateRows), [rateRows])
  const accounts = useMemo(() => withBalances(rawAccounts, allTx, rates), [rawAccounts, allTx, rates])
  const activeAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts])
  const total = useMemo(() => computeTotalUsd(accounts), [accounts])

  // Sprint 7: un ajuste de valor de una cuenta de inversión sigue en `allTx`
  // (mueve el saldo) pero se saca de las listas visibles — no es un movimiento
  // de plata (§4.7). `allTx` NO cambia; todo lo derivado (saldo, totales, fijos)
  // lo sigue usando.
  const accountsById = useMemo(() => new Map(rawAccounts.map(a => [a.id, a])), [rawAccounts])
  const feedTx = useMemo(
    () => allTx.filter(t => !isInvestmentAdjustment(t, accountsById.get(t.account_id))),
    [allTx, accountsById]
  )
  /** Cuentas de inversión con al menos un ajuste de valor — el toggle
   *  "Cuenta de inversión" ya no se puede destildar para ellas (§4.8). */
  const investmentAdjustmentAccounts = useMemo(() => {
    const s = new Set<string>()
    for (const t of allTx) if (isInvestmentAdjustment(t, accountsById.get(t.account_id))) s.add(t.account_id)
    return s
  }, [allTx, accountsById])

  const monthKey = currentMonthKey()
  const monthTx = useMemo(() => allTx.filter(t => t.date.slice(0, 7) === monthKey), [allTx, monthKey])
  const recentTx = useMemo(() => feedTx.slice(0, 5), [feedTx])
  const { gasto_usd: monthGastoUsd, ingreso_usd: monthIngresoUsd } = useMemo(() => monthTotals(monthTx), [monthTx])

  const activePeople = useMemo(() => people.filter(p => !p.archived), [people])
  // Total pendiente (pantalla Deudas) vs. lo que ya venció / vence pronto
  // (alerta de la Home — no adelanta cuotas futuras de un plan).
  const pendingDebtUsd = useMemo(() => pendingTotalUsd(debts), [debts])
  const dueDebtUsd = useMemo(() => computeDueDebtUsd(debts, todayISO()), [debts])
  // "Gasto real" del mes = bruto − lo que le toca a otros (solo el costo, no
  // el margen; solo deudas no condonadas).
  const monthRepartidoUsd = useMemo(() => {
    const monthGastoIds = new Set(monthTx.filter(t => t.type === 'gasto').map(t => t.id))
    return computeRepartidoUsd(monthGastoIds, debts)
  }, [monthTx, debts])
  const monthGastoRealUsd = useMemo(
    () => computeGastoRealUsd(monthGastoUsd, monthRepartidoUsd),
    [monthGastoUsd, monthRepartidoUsd]
  )
  const settledByTxId = useMemo(() => {
    const map = new Map<string, Debt[]>()
    for (const d of debts) {
      if (!d.settled_transaction_id) continue
      const list = map.get(d.settled_transaction_id) ?? []
      list.push(d)
      map.set(d.settled_transaction_id, list)
    }
    return map
  }, [debts])

  const activeRecurring = useMemo(() => recurring.filter(r => r.active), [recurring])
  const recurringSplitsByTemplate = useMemo(() => {
    const map = new Map<string, RecurringSplit[]>()
    for (const s of recurringSplits) {
      const list = map.get(s.recurring_id) ?? []
      list.push(s)
      map.set(s.recurring_id, list)
    }
    return map
  }, [recurringSplits])

  // ── Presupuesto (§4 del sprint 5) ─────────────────────────────────────
  const budgetToday = todayISO()
  const budgetPeriod = periodStart(budgetToday)
  const categoryName = useCallback((id: string) => categories.find(c => c.id === id)?.name ?? '?', [categories])

  // Fijos con su estado, una sola vez (recurringStatus recorre meses).
  const recurringForBudget = useMemo(
    () =>
      recurring.map(r => ({
        category_id: r.category_id,
        active: r.active,
        amount: r.amount,
        currency: r.currency as string,
        amountUsd: toUsd(r.amount, r.currency, rates),
        status: recurringStatus(r, allTx, budgetToday).status as string,
      })),
    [recurring, allTx, rates, budgetToday]
  )

  const budgetView = useMemo(() => {
    const catsByLine = new Map<string, string[]>()
    for (const lc of budgetLineCategories) {
      const list = catsByLine.get(lc.line_id) ?? []
      list.push(lc.category_id)
      catsByLine.set(lc.line_id, list)
    }

    const views: BudgetLineView[] = budgetLines.map(line => {
      const categoryIds = catsByLine.get(line.id) ?? []
      const ownRow = budgetPeriods.find(p => p.line_id === line.id && p.period === budgetPeriod)
      const rate = ownRow?.exchange_rate ?? usdPerUnit(line.input_currency, rates)
      const effective = effectiveAmount(budgetPeriods, budgetExtensions, line.id, budgetPeriod, line.input_currency)

      const from = effectiveFromFor(line, budgetPeriod)
      const to = periodRange(budgetPeriod).to
      const spent = gastoRealForCategories(allTx, debts, categoryIds, from, to, line.input_currency, rate)
      const committed = committedForCategories(recurringForBudget, categoryIds, line.input_currency, rate)
      const carried_usd = carriedInto(budgetClosures, line.id, budgetPeriod)

      const available_usd = computeAvailableUsd({
        effectiveUsd: effective?.amountUsd ?? null,
        gastoRealUsd: spent.amountUsd,
        committedUsd: committed.amountUsd,
        carriedUsd: carried_usd,
      })
      const bar = budgetBar({
        mode: budgetViewMode,
        spentUsd: spent.amountUsd,
        availableUsd: available_usd ?? 0,
        capacityUsd: effective?.amountUsd ?? 0,
        committedUsd: committed.amountUsd,
        day: Number(budgetToday.slice(8, 10)),
        days: Number(periodRange(budgetPeriod).to.slice(8, 10)),
      })

      return {
        line_id: line.id,
        title: line.name?.trim() || categoryIds.map(categoryName).join(', ') || 'Sin categoría',
        currency: line.input_currency,
        rate,
        category_ids: categoryIds,
        effective_native: effective?.amount ?? null,
        effective_usd: effective?.amountUsd ?? null,
        spent_native: spent.amount,
        spent_usd: spent.amountUsd,
        committed_native: committed.amount,
        committed_usd: committed.amountUsd,
        carried_usd,
        available_native: available_usd == null ? null : toNative(available_usd, rate, line.input_currency),
        available_usd,
        bar,
      }
    })

    // El general: suma de las líneas + Σ gasto real de TODAS las categorías de
    // gasto del mes (tengan línea o no). Sin carry ni cierre (§4.7).
    const allGastoCatIds = categories.filter(c => c.kind === 'gasto').map(c => c.id)
    const range = periodRange(budgetPeriod)
    const totalSpent = gastoRealForCategories(allTx, debts, allGastoCatIds, range.from, range.to, 'USD', 1)
    const totalCommitted = committedForCategories(recurringForBudget, allGastoCatIds, 'USD', 1)
    const generalEffectiveUsd = round2(views.reduce((s, v) => s + (v.effective_usd ?? 0), 0))
    const generalAvailableUsd = round2(generalEffectiveUsd - totalSpent.amountUsd - totalCommitted.amountUsd)
    const general: BudgetGeneralView | null =
      generalEffectiveUsd > 0
        ? {
            effective_usd: generalEffectiveUsd,
            spent_usd: totalSpent.amountUsd,
            committed_usd: totalCommitted.amountUsd,
            available_usd: generalAvailableUsd,
            bar: budgetBar({
              mode: budgetViewMode,
              spentUsd: totalSpent.amountUsd,
              availableUsd: generalAvailableUsd,
              capacityUsd: generalEffectiveUsd,
              committedUsd: totalCommitted.amountUsd,
              day: Number(budgetToday.slice(8, 10)),
              days: Number(range.to.slice(8, 10)),
            }),
          }
        : null

    // Meses ya terminados sin fila de cierre — la ausencia es la pregunta.
    const pendingClosures: PendingClosure[] = []
    for (const line of budgetLines) {
      const categoryIds = catsByLine.get(line.id) ?? []
      // Una línea con todas sus categorías archivadas no pide cierres (§4.10).
      if (categoryIds.length > 0 && categoryIds.every(id => categories.find(c => c.id === id)?.archived)) continue
      for (const p of needsClosure(line, budgetClosures, budgetToday)) {
        const eff = effectiveAmount(budgetPeriods, budgetExtensions, line.id, p, line.input_currency)
        if (!eff) continue
        const r = periodRange(p)
        const s = gastoRealForCategories(allTx, debts, categoryIds, effectiveFromFor(line, p), r.to, line.input_currency, 1)
        const avail = computeAvailableUsd({
          effectiveUsd: eff.amountUsd,
          gastoRealUsd: s.amountUsd,
          committedUsd: 0, // un mes cerrado no tiene fijos "pendientes"
          carriedUsd: carriedInto(budgetClosures, line.id, p),
        })
        pendingClosures.push({
          line_id: line.id,
          title: line.name?.trim() || categoryIds.map(categoryName).join(', ') || 'Sin categoría',
          period: p,
          available_usd: avail ?? 0,
        })
      }
    }

    return { lines: views, general, pendingClosures, period: budgetPeriod }
  }, [
    budgetLines,
    budgetLineCategories,
    budgetPeriods,
    budgetExtensions,
    budgetClosures,
    allTx,
    debts,
    categories,
    rates,
    recurringForBudget,
    budgetViewMode,
    budgetPeriod,
    budgetToday,
    categoryName,
  ])

  /** El disponible USD de la línea que contiene esa categoría, para el bloqueo
   *  del quick-add. `null` si la categoría no tiene línea (no se bloquea). */
  const availableForCategory = useCallback(
    (categoryId: string | null): number | null => {
      if (!categoryId) return null
      const lc = budgetLineCategories.find(x => x.category_id === categoryId)
      if (!lc) return null
      return budgetView.lines.find(v => v.line_id === lc.line_id)?.available_usd ?? null
    },
    [budgetLineCategories, budgetView]
  )

  // ── Ahorro (Sprint 6) ─────────────────────────────────────────────────
  /** Lo apartado por cuenta, en la moneda de cada una — el piso de ahorro. */
  const savingsByAccount = useMemo(() => computeSavingsByAccount(allTx), [allTx])
  const goalByAccountMap = useMemo(() => goalBalancesByAccount(allTx), [allTx])

  const savingsInAccount = useCallback(
    (goalId: string, accountId: string): number => goalByAccountMap.get(goalId)?.get(accountId) ?? 0,
    [goalByAccountMap]
  )

  const savingsView = useMemo<SavingsOverview>(() => {
    const balancesUsd = savingsBalancesUsd(allTx)
    const period = pendingSavingsPeriod(budgetToday)
    const surplus_usd = computeSurplusUsd(allTx, period)

    const withBalance: SavingsGoalWithBalance[] = savingsGoals.map(g => {
      const balance_usd = round2(balancesUsd.get(g.id) ?? 0)
      const targetUsd = targetAmountUsd(g, rates)
      return { ...g, balance_usd, goal_reached: computeGoalReached(balance_usd, targetUsd) }
    })

    const { proposal, unassignedUsd, insufficientForFixed } = proposeAllocation(withBalance, surplus_usd, rates)
    const proposalByGoal = new Map(proposal.map(p => [p.goal_id, p]))

    const goals: SavingsGoalView[] = withBalance.map(g => {
      const rate = usdPerUnit(g.input_currency, rates)
      const targetUsd = targetAmountUsd(g, rates)
      const balance_native = toNative(g.balance_usd, rate, g.input_currency)
      const by = goalByAccountMap.get(g.id)
      const alreadySaved = savedPeriodsOf(allTx, g.id).has(period)
      const canSave = !g.archived && canSaveForPeriod(g, period) && !alreadySaved
      const line = canSave ? proposalByGoal.get(g.id) : undefined

      return {
        goal_id: g.id,
        name: g.name,
        currency: g.input_currency,
        balance_native,
        balance_usd: g.balance_usd,
        target_native: g.target_amount,
        target_usd: targetUsd,
        goal_reached: g.goal_reached,
        is_catchall: g.is_catchall,
        archived: g.archived,
        allocation_type: g.allocation_type,
        allocation_value: g.allocation_value,
        progress_pct: targetUsd && targetUsd > 0 ? Math.min(100, round2((g.balance_usd / targetUsd) * 100)) : 0,
        pending_amount_native: line ? line.amount : null,
        pending_amount_usd: line ? line.amount_usd : null,
        pending_capped: line?.capped ?? false,
        by_account: by ? [...by.entries()].map(([account_id, amount]) => ({ account_id, amount })) : [],
      }
    })

    return {
      goals,
      period,
      surplus_usd,
      has_pending: goals.some(g => g.pending_amount_usd != null && g.pending_amount_usd > 0),
      unassigned_usd: unassignedUsd,
      insufficient_for_fixed: insufficientForFixed,
      total_saved_usd: round2(goals.reduce((s, g) => s + g.balance_usd, 0)),
    }
  }, [savingsGoals, allTx, rates, goalByAccountMap, budgetToday])

  // ── Proyectos (Sprint 10) ─────────────────────────────────────────────
  const projectsView = useMemo(() => compareProjects(budgetProjects, allTx), [budgetProjects, allTx])

  // ── Perfiles (Sprint 8) ──────────────────────────────────────────────
  const activeProfile = useMemo(() => profiles.find(p => p.id === activeProfileId) ?? null, [profiles, activeProfileId])

  // Cambiar de perfil es releer todo desde cero filtrado por el nuevo id
  // (§4.2 — "filtro, no vista"), no un simple setState: cada tabla del
  // dominio necesita su propio fetch con el `profile_id` nuevo. `load()`
  // recibe el id explícito porque leer `activeProfileId` desde acá adentro
  // vería el valor viejo (closure de este mismo render).
  const switchProfile: DataContextValue['switchProfile'] = useCallback(
    id => {
      if (id === activeProfileId) return
      setLoading(true)
      writeProfilePref({ id, accent: (profiles.find(p => p.id === id)?.accent as AccentKey) ?? 'verde' })
      void load(id)
    },
    [activeProfileId, profiles, load]
  )

  const createProfile: DataContextValue['createProfile'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const accent = input.accent ?? nextAccentFor(profiles)
      const { data: created, error } = await supabase
        .from('fin_profiles')
        .insert({
          user_id: user.id,
          name: input.name,
          accent,
          is_default: false,
          sort_order: profiles.length,
          ...(input.tipo ? { tipo: input.tipo } : {}),
          ...(input.display_currency ? { display_currency: input.display_currency } : {}),
        })
        .select('*')
        .single()
      if (error || !created) return { error: isPgError(error?.message ?? 'No se pudo crear el perfil.') }

      // Un perfil nuevo arranca con las categorías semilla, igual que el
      // default (§4.9) — si esto falla el perfil ya existe y es usable sin
      // categorías, misma red de seguridad que en load() ("Sembrar
      // categorías iniciales" en Ajustes).
      await supabase.from('fin_categories').insert(SEED_CATEGORIES.map(c => ({ ...c, user_id: user.id, profile_id: created.id })))

      setLoading(true)
      writeProfilePref({ id: created.id, accent })
      await load(created.id)
      return { id: created.id }
    },
    [profiles, user.id, load]
  )

  const updateProfile: DataContextValue['updateProfile'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_profiles').update(patch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load(activeProfileId ?? undefined)
      return {}
    },
    [load, activeProfileId]
  )

  // Borra directo — atómico por `on delete restrict` en las 14 tablas, así
  // que si el perfil tiene cualquier dato el DELETE falla entero y no deja
  // nada a medio borrar (§0 "atomic delete vs. función"). Ese error de FK es
  // la señal para archivar en su lugar (§4.5), no un fallo real.
  const deleteOrArchiveProfile: DataContextValue['deleteOrArchiveProfile'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error: deleteError } = await supabase.from('fin_profiles').delete().eq('id', id)
      if (deleteError) {
        if (!deleteError.message.includes('foreign key') && !deleteError.message.includes('on delete restrict')) {
          return { error: isPgError(deleteError.message) }
        }
        const { error: archiveError } = await supabase.from('fin_profiles').update({ archived: true }).eq('id', id)
        if (archiveError) return { error: isPgError(archiveError.message) }
      }
      if (id === activeProfileId) {
        // El perfil activo se borró o se archivó — `resolveActiveProfileId`
        // ya sabe caer al default en silencio cuando el `preferredId` (el
        // que sigue en localStorage, todavía apuntando a `id`) ya no matchea
        // ningún perfil activo (§4.1), así que alcanza con no pasar override.
        setLoading(true)
        await load()
      } else {
        await load(activeProfileId ?? undefined)
      }
      return {}
    },
    [activeProfileId, load]
  )

  // ── Notificaciones (Sprint 9) ────────────────────────────────────────
  const subscribeToPush: DataContextValue['subscribeToPush'] = useCallback(
    async sub => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error: subError } = await supabase.from('fin_push_subscriptions').upsert(
        { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent ?? null },
        { onConflict: 'endpoint' }
      )
      if (subError) return { error: isPgError(subError.message) }
      // Activar notificaciones deja las dos filas listas — sin esto, un
      // usuario que nunca abrió Ajustes → Notificaciones podía tener
      // dispositivo suscripto pero ninguna fila de preferencias, y la Edge
      // Function tendría que adivinar qué hacer con eso.
      if (!notifPrefs) {
        const { error: prefsError } = await supabase.from('fin_notif_prefs').upsert({ user_id: user.id, ...DEFAULT_NOTIF_PREFS })
        if (prefsError) return { error: isPgError(prefsError.message) }
      }
      await load(activeProfileId ?? undefined)
      return {}
    },
    [user.id, notifPrefs, activeProfileId, load]
  )

  const unsubscribeFromPush: DataContextValue['unsubscribeFromPush'] = useCallback(
    async endpoint => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) return { error: isPgError(error.message) }
      await load(activeProfileId ?? undefined)
      return {}
    },
    [activeProfileId, load]
  )

  const updateNotifPrefs: DataContextValue['updateNotifPrefs'] = useCallback(
    async patch => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const effective = { ...DEFAULT_NOTIF_PREFS, ...notifPrefs, ...patch }
      const { error } = await supabase.from('fin_notif_prefs').upsert({ user_id: user.id, ...effective })
      if (error) return { error: isPgError(error.message) }
      await load(activeProfileId ?? undefined)
      return {}
    },
    [notifPrefs, user.id, activeProfileId, load]
  )

  // ── Cuentas ───────────────────────────────────────────────────────────
  const createAccount: DataContextValue['createAccount'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const { error } = await supabase.from('fin_accounts').insert({ ...input, user_id: user.id, profile_id: activeProfileId })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [user.id, activeProfileId, load]
  )

  const updateAccount: DataContextValue['updateAccount'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // Sprint 7: destildar "Cuenta de inversión" una vez que tiene un ajuste
      // de valor mezclaría historia — esos ajustes volverían a contar como
      // consumo. El form ya no ofrece el toggle en ese caso; la mutación igual
      // rechaza (defensa en profundidad, mismo patrón que la moneda de una
      // cuenta con movimientos). No→Sí siempre libre.
      if (patch.is_investment === false && investmentAdjustmentAccounts.has(id)) {
        return { error: 'Esta cuenta ya tiene ajustes de valor registrados — no se puede sacar de inversión sin mezclar la historia.' }
      }
      const { error } = await supabase.from('fin_accounts').update(patch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [investmentAdjustmentAccounts, load]
  )

  // Reordenar llamaba a updateAccount() una vez por cuenta dentro de un
  // Promise.all — cada llamada hacía su propio load() en paralelo, así que
  // N reordenamientos disparaban N recargas completas compitiendo entre sí:
  // si una terminaba de leer antes de que otra terminara de escribir, el
  // orden que quedaba en pantalla no era ni el viejo ni el nuevo (bug real
  // de la revisión del Sprint 2). Acá se escribe todo primero y se recarga
  // una sola vez al final.
  const reorderAccounts: DataContextValue['reorderAccounts'] = useCallback(
    async updates => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const results = await Promise.all(updates.map(u => supabase!.from('fin_accounts').update({ sort_order: u.sort_order }).eq('id', u.id)))
      const firstError = results.find(r => r.error)?.error
      if (firstError) return { error: isPgError(firstError.message) }
      await load()
      return {}
    },
    [load]
  )

  const deleteOrArchiveAccount: DataContextValue['deleteOrArchiveAccount'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const hasTx = allTx.some(t => t.account_id === id || t.to_account_id === id)
      if (hasTx) {
        const { error } = await supabase.from('fin_accounts').update({ archived: true }).eq('id', id)
        if (error) return { error: isPgError(error.message) }
      } else {
        const { error } = await supabase.from('fin_accounts').delete().eq('id', id)
        if (error) return { error: isPgError(error.message) }
      }
      await load()
      return {}
    },
    [allTx, load]
  )

  // ── Movimientos ───────────────────────────────────────────────────────
  const createTransaction: DataContextValue['createTransaction'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const account = rawAccounts.find(a => a.id === input.account_id)
      if (!account) return { error: 'Cuenta de origen inválida.' }

      const toAccount = input.type === 'transferencia' ? rawAccounts.find(a => a.id === input.to_account_id) : undefined
      if (input.type === 'transferencia' && !toAccount) return { error: 'Cuenta destino inválida.' }

      const shapeErr = validateShape({
        type: input.type,
        account_id: input.account_id,
        to_account_id: input.to_account_id,
        category_id: input.category_id,
        amount: input.amount,
        to_amount: input.to_amount,
        currency: account.currency,
        to_currency: toAccount?.currency,
        date: input.date,
      })
      if (shapeErr) return { error: shapeErr }

      // Sprint 6: un `gasto` etiquetado es un retiro de ahorro. El tipo fija la
      // dirección; el motivo es obligatorio (§4.7). Desde el quick-add no se
      // puede tagear un ingreso ni una transferencia.
      if (input.savings_goal_id && input.type !== 'gasto') {
        return { error: 'Los aportes se hacen desde Ahorros, no acá. Acá solo se puede retirar (un gasto).' }
      }
      if (input.savings_goal_id) {
        const goal = savingsGoals.find(g => g.id === input.savings_goal_id)
        if (!goal) return { error: 'Ahorro inválido.' }
        if (goal.archived) return { error: 'Ese ahorro está archivado.' }
        if (!input.savings_reason) return { error: 'Elegí por qué retirás de este ahorro.' }
      }
      // Sprint 10: un proyecto archivado sigue existiendo (para "Comparar"),
      // pero no acepta movimientos nuevos — mismo criterio que un ahorro
      // archivado, arriba.
      if (input.project_id) {
        const project = budgetProjects.find(p => p.id === input.project_id)
        if (!project) return { error: 'Proyecto inválido.' }
        if (project.archived) return { error: 'Ese proyecto está archivado.' }
      }

      const amount = normalizeAmount(input.amount, account.currency)
      const { exchange_rate, amount_usd } = freeze(amount, account.currency, rates)

      // `to_amount` ahora se guarda también entre cuentas de la MISMA moneda
      // cuando el usuario lo indica — es la comisión del banco/plataforma
      // (mandás 100, llegan 98). Entre monedas distintas es obligatorio y ya
      // lo exige el formulario.
      const to_amount =
        input.type === 'transferencia' && toAccount && input.to_amount != null
          ? normalizeAmount(input.to_amount, toAccount.currency)
          : null
      const { to_exchange_rate, to_amount_usd } = freezeReceived(to_amount, toAccount?.currency ?? account.currency, rates)

      const { error } = await supabase.from('fin_transactions').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        type: input.type,
        date: input.date,
        account_id: input.account_id,
        to_account_id: input.type === 'transferencia' ? input.to_account_id : null,
        category_id: input.type === 'transferencia' ? null : input.category_id ?? null,
        amount,
        currency: account.currency,
        to_amount,
        exchange_rate,
        amount_usd,
        to_exchange_rate,
        to_amount_usd,
        description: input.description || null,
        // Sprint 7: 'movimiento' si la cuenta es de inversión (§4.1). El
        // trigger igual fuerza 'movimiento' en una transferencia.
        flow_type: flowTypeFor(input.type, account),
        savings_goal_id: input.savings_goal_id ?? null,
        savings_flow: input.savings_goal_id ? 'retiro' : null,
        savings_reason: input.savings_goal_id ? input.savings_reason ?? null : null,
        project_id: input.project_id ?? null,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [rawAccounts, savingsGoals, budgetProjects, rates, user.id, activeProfileId, load]
  )

  const updateTransaction: DataContextValue['updateTransaction'] = useCallback(
    async (tx, changes) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const nextAccountId = changes.account_id ?? tx.account_id
      // Bug real de la revisión del Sprint 1: esto quedaba fijo en
      // `tx.type` aunque el quick-add sí deja cambiar el tipo al editar
      // (`showSelector` no se apaga en modo edición) — la validación de
      // forma corría contra el tipo VIEJO mientras el resto de los campos
      // (y el propio `type` en `changes`) ya reflejaban el nuevo, así que
      // cambiar de tipo se rechazaba con un motivo equivocado, o en el caso
      // gasto↔ingreso pasaba sin validar la forma nueva de verdad.
      const nextType = changes.type ?? tx.type
      const nextToAccountId = changes.to_account_id !== undefined ? changes.to_account_id : tx.to_account_id
      const nextCategoryId = changes.category_id !== undefined ? changes.category_id : tx.category_id
      const nextToAmount = changes.to_amount !== undefined ? changes.to_amount : tx.to_amount
      const nextAmount = changes.amount ?? tx.amount

      const account = rawAccounts.find(a => a.id === nextAccountId)
      if (!account) return { error: 'Cuenta de origen inválida.' }
      const nextToAccount = nextType === 'transferencia' && nextToAccountId ? rawAccounts.find(a => a.id === nextToAccountId) : undefined

      const shapeErr = validateShape({
        type: nextType,
        account_id: nextAccountId,
        to_account_id: nextToAccountId,
        category_id: nextCategoryId,
        amount: nextAmount,
        to_amount: nextToAmount,
        currency: account.currency,
        to_currency: nextToAccount?.currency,
        date: changes.date,
      })
      if (shapeErr) return { error: shapeErr }

      const amountChanged = changes.amount != null && changes.amount !== tx.amount
      const accountChanged = changes.account_id != null && changes.account_id !== tx.account_id
      const typeChanged = changes.type != null && changes.type !== tx.type

      // deleteTransaction() ya sabe devolver a pendiente la deuda que este
      // movimiento saldó (§4.6 del sprint 2), pero editar no tenía ningún
      // guard equivalente: cambiarle el monto, el tipo o la cuenta a un
      // cobro de deuda, o a un gasto compartido, desincroniza el saldo de
      // la cuenta de lo que la deuda quedó creyendo, sin ningún aviso — no
      // hay forma simple de "recongelar" una deuda ya cobrada o ya
      // generada desde acá. Se bloquea en vez de intentar resincronizar.
      // Bug real, revisión del Sprint 4.
      if (amountChanged || accountChanged || typeChanged) {
        if (debts.some(d => d.settled_transaction_id === tx.id)) {
          return {
            error: 'No se puede editar el monto, tipo o cuenta de un cobro de deuda ya registrado. Borralo (vuelve la deuda a pendiente) y volvé a cobrar si hace falta corregirlo.',
          }
        }
        if (debts.some(d => d.origin_transaction_id === tx.id)) {
          return {
            error: 'No se puede editar el monto, tipo o cuenta de un gasto compartido. Borrá las deudas que generó primero, o dejalo como está.',
          }
        }
        // Un aporte o un traslado tiene los dos lados atados (monto que sale =
        // monto que se aparta) y, si es "a la misma cuenta", ni siquiera es una
        // transferencia común. Editar su monto/cuenta lo desincroniza en
        // silencio — se bloquea, igual que un cobro de deuda (§4.7 del sprint 6).
        if (tx.savings_flow === 'aporte' || tx.savings_flow === 'traslado') {
          return {
            error: 'No se puede editar el monto, tipo o cuenta de un aporte o traslado de ahorro. Borralo y volvé a hacerlo desde Ahorros.',
          }
        }
      }

      const patch: Record<string, unknown> = { ...changes }

      // Sprint 7: recalcular `flow_type` solo si cambió la cuenta o el tipo —
      // una edición de descripción no lo mueve. `flowTypeOnEdit` nunca degrada
      // un 'movimiento' existente a 'consumo' (protege cobros de deuda,
      // reembolsos y aportes de ahorro editados, §4.2).
      if (accountChanged || typeChanged) {
        patch.flow_type = flowTypeOnEdit(tx, nextType, account)
      }

      if (amountChanged || accountChanged) {
        const amount = normalizeAmount(changes.amount ?? tx.amount, account.currency)
        const { exchange_rate, amount_usd } = freeze(amount, account.currency, rates)
        patch.amount = amount
        patch.currency = account.currency
        patch.exchange_rate = exchange_rate
        patch.amount_usd = amount_usd
      }

      // El lado que llega se recongela solo si de verdad cambió (monto
      // recibido, cuenta de origen/destino, o el tipo dejó de ser
      // transferencia) — igual que el lado que sale. Una edición que no lo
      // toca (ej. cambiar la descripción) deja `to_amount_usd` /
      // `to_exchange_rate` tal como se congelaron su día.
      const toAccountChanged = changes.to_account_id !== undefined && changes.to_account_id !== tx.to_account_id
      const toAmountChanged = nextToAmount !== tx.to_amount
      if (typeChanged || accountChanged || toAccountChanged || toAmountChanged) {
        if (nextType !== 'transferencia') {
          patch.to_amount = null
          patch.to_exchange_rate = null
          patch.to_amount_usd = null
        } else {
          const toCurrency = nextToAccount?.currency ?? account.currency
          const to_amount = nextToAmount != null ? normalizeAmount(nextToAmount, toCurrency) : null
          const { to_exchange_rate, to_amount_usd } = freezeReceived(to_amount, toCurrency, rates)
          patch.to_amount = to_amount
          patch.to_exchange_rate = to_exchange_rate
          patch.to_amount_usd = to_amount_usd
        }
      }

      // Sprint 6 · retiro de ahorro. El quick-add manda estos campos solo para
      // un gasto — un aporte/traslado (transferencia tageada) se edita sin que
      // su etiqueta se toque (§4.7). Una regla nueva tampoco congela la
      // historia (§4.12): el ahorro y el motivo se exigen solo si el
      // movimiento YA era un retiro, o si el cliente lo tagea ahora.
      const taggingNow = changes.savings_goal_id !== undefined
      const wasRetiro = tx.savings_flow === 'retiro'
      if (taggingNow || wasRetiro) {
        const nextGoalId = taggingNow ? changes.savings_goal_id : tx.savings_goal_id
        if (nextGoalId && nextType !== 'gasto') {
          return { error: 'Un retiro de ahorro tiene que ser un gasto. Cambiá el tipo, o quitale el ahorro.' }
        }
        if (nextGoalId) {
          const goal = savingsGoals.find(g => g.id === nextGoalId)
          // Un ahorro archivado que YA estaba en la fila se acepta (no se
          // congela la historia); tagear uno archivado ahora, no.
          if (!goal || (goal.archived && taggingNow && tx.savings_goal_id !== nextGoalId)) {
            return { error: 'Ahorro inválido o archivado.' }
          }
          const nextReason = changes.savings_reason !== undefined ? changes.savings_reason : tx.savings_reason
          if (!nextReason) return { error: 'Elegí por qué retirás de este ahorro.' }
          patch.savings_goal_id = nextGoalId
          patch.savings_flow = 'retiro'
          patch.savings_reason = nextReason
          patch.savings_period = null
        } else {
          patch.savings_goal_id = null
          patch.savings_flow = null
          patch.savings_reason = null
          patch.savings_period = null
        }
      }

      const { error } = await supabase.from('fin_transactions').update(patch).eq('id', tx.id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [rawAccounts, rates, debts, savingsGoals, load]
  )

  const deleteTransaction: DataContextValue['deleteTransaction'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // §4.6 del sprint 2: si este movimiento saldó una o más deudas, hay
      // que devolverlas a pendiente ANTES de borrarlo — si no, el CHECK
      // `fin_debt_settle_shape` bloquea el delete (una fila 'cobrada' con
      // settled_transaction_id en null lo viola). Un cobro con margen tiene
      // DOS movimientos (reembolso + ganancia): borrar cualquiera de los dos
      // des-salda la deuda y se lleva también al otro, para no dejar un
      // ingreso de ganancia huérfano contando como plata real.
      const settled = debts.filter(d => d.settled_transaction_id === id || d.settled_margin_transaction_id === id)
      if (settled.length > 0) {
        const siblingIds = new Set<string>()
        for (const d of settled) {
          if (d.settled_transaction_id && d.settled_transaction_id !== id) siblingIds.add(d.settled_transaction_id)
          if (d.settled_margin_transaction_id && d.settled_margin_transaction_id !== id) siblingIds.add(d.settled_margin_transaction_id)
        }
        const { error: unsettleError } = await supabase
          .from('fin_debts')
          .update({ status: 'pendiente', settled_transaction_id: null, settled_margin_transaction_id: null })
          .in('id', settled.map(d => d.id))
        if (unsettleError) return { error: isPgError(unsettleError.message) }
        if (siblingIds.size > 0) {
          const { error: siblingError } = await supabase.from('fin_transactions').delete().in('id', [...siblingIds])
          if (siblingError) {
            await load()
            return { error: `Se deshizo el cobro pero no se pudo borrar el movimiento de ganancia: ${isPgError(siblingError.message)}` }
          }
        }
      }
      const { error } = await supabase.from('fin_transactions').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [debts, load]
  )

  const setAccountValue: DataContextValue['setAccountValue'] = useCallback(
    async (accountId, currentValue) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const account = accounts.find(a => a.id === accountId)
      if (!account) return { error: 'Cuenta inválida.' }

      const resolved = valueUpdateDelta(account.balance, currentValue, account.currency)
      if (!resolved) return {} // nada que registrar — el valor ya coincide
      const { type, amount } = resolved
      const { exchange_rate, amount_usd } = freeze(amount, account.currency, rates)
      const { error } = await supabase.from('fin_transactions').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        type,
        date: todayISO(),
        account_id: accountId,
        to_account_id: null,
        category_id: null,
        amount,
        currency: account.currency,
        to_amount: null,
        exchange_rate,
        amount_usd,
        to_exchange_rate: null,
        to_amount_usd: null,
        description: null,
        // El mercado moviéndose, no consumo (§4.4). `flowTypeFor` lo confirma
        // porque la cuenta es `is_investment`; lo dejamos explícito.
        flow_type: 'movimiento',
        savings_goal_id: null,
        savings_flow: null,
        savings_reason: null,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [accounts, rates, user.id, activeProfileId, load]
  )

  // ── Categorías ────────────────────────────────────────────────────────
  const createCategory: DataContextValue['createCategory'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const { error } = await supabase.from('fin_categories').insert({ ...input, user_id: user.id, profile_id: activeProfileId })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [user.id, activeProfileId, load]
  )

  const updateCategory: DataContextValue['updateCategory'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_categories').update(patch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [load]
  )

  const seedCategoriesIfEmpty: DataContextValue['seedCategoriesIfEmpty'] = useCallback(async () => {
    if (!supabase) return { error: 'Supabase no está configurado.' }
    if (!activeProfileId) return { error: 'No hay un perfil activo.' }
    if (categories.length > 0) return {}
    const rows = SEED_CATEGORIES.map(c => ({ ...c, user_id: user.id, profile_id: activeProfileId }))
    const { error } = await supabase.from('fin_categories').insert(rows)
    if (error) return { error: isPgError(error.message) }
    await load()
    return {}
  }, [categories.length, user.id, activeProfileId, load])

  // ── Tasas ─────────────────────────────────────────────────────────────
  // Fijar una tasa a mano la pasa a `auto = false` — el refrescador no la
  // vuelve a pisar hasta que se reactive lo automático desde Ajustes.
  const updateRate: DataContextValue['updateRate'] = useCallback(
    async (currency, rate) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase
        .from('fin_rates')
        .upsert({ user_id: user.id, currency, rate, auto: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id,currency' })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [user.id, load]
  )

  // Cambia una tasa entre automática y manual, y (para el Bs) qué cotización
  // sigue. Al pasar a automática se vence a propósito y se refresca en el acto.
  const setRateMode: DataContextValue['setRateMode'] = useCallback(
    async (currency, auto, quotePair) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const pair = quotePair && pairAllowedFor(currency, quotePair) ? quotePair : null
      // `rate` va siempre, aunque acá no cambie: si la fila de esta moneda
      // todavía no existe (el sembrado de load() no llegó a correr, o
      // falló), este upsert es el INSERT que la crea — y `rate` es NOT NULL
      // sin default en la base. Repetir el valor actual es un no-op cuando
      // la fila ya existe (pisa la misma tasa que ya tenía) y evita el
      // "null value in column rate" cuando no existía. refreshStaleRates(),
      // más abajo, es quien de verdad la actualiza a la cotización real.
      const patch: Record<string, unknown> = { user_id: user.id, currency, auto, quote_pair: auto ? pair : null, rate: rates[currency] }
      if (auto) patch.updated_at = new Date(0).toISOString() // fuerza refresco
      const { error } = await supabase.from('fin_rates').upsert(patch, { onConflict: 'user_id,currency' })
      if (error) return { error: isPgError(error.message) }
      await load()
      if (auto) await refreshStaleRates()
      return {}
    },
    [user.id, load, refreshStaleRates, rates]
  )

  // "Actualizar ahora" en Ajustes: vence todas las automáticas y las trae.
  const refreshRatesNow: DataContextValue['refreshRatesNow'] = useCallback(async () => {
    if (!supabase) return { error: 'Supabase no está configurado.' }
    const autoCurrencies = rateRows.filter(r => r.auto).map(r => r.currency)
    if (autoCurrencies.length > 0) {
      const { error } = await supabase
        .from('fin_rates')
        .update({ updated_at: new Date(0).toISOString() })
        .eq('user_id', user.id)
        .in('currency', autoCurrencies)
      if (error) return { error: isPgError(error.message) }
    }
    await refreshStaleRates()
    return {}
  }, [rateRows, user.id, refreshStaleRates])

  // ── Personas ──────────────────────────────────────────────────────────
  const createPerson: DataContextValue['createPerson'] = useCallback(
    async name => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const { data, error } = await supabase
        .from('fin_people')
        .insert({ name, user_id: user.id, profile_id: activeProfileId })
        .select('id')
        .single()
      if (error) return { error: isPgError(error.message) }
      await load()
      return { id: data?.id }
    },
    [user.id, activeProfileId, load]
  )

  const updatePerson: DataContextValue['updatePerson'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_people').update(patch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [load]
  )

  const deleteOrArchivePerson: DataContextValue['deleteOrArchivePerson'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // Sprint 3: además de deudas reales, una persona puede estar en el
      // reparto por defecto de algún fijo — también cuenta como "referenciada".
      // Sprint 4: una persona con un plan de pago ya está referenciada por
      // cada una de sus cuotas (son `fin_debts` como cualquier otra), pero
      // se chequea `plans` también, en defensa de profundidad, igual que
      // `registerRecurring` valida la moneda aunque el formulario ya la
      // restrinja.
      const isReferenced =
        debts.some(d => d.person_id === id) || recurringSplits.some(s => s.person_id === id) || plans.some(p => p.person_id === id)
      if (isReferenced) {
        const { error } = await supabase.from('fin_people').update({ archived: true }).eq('id', id)
        if (error) return { error: isPgError(error.message) }
      } else {
        const { error } = await supabase.from('fin_people').delete().eq('id', id)
        if (error) return { error: isPgError(error.message) }
      }
      await load()
      return {}
    },
    [debts, recurringSplits, plans, load]
  )

  // ── Deudas ────────────────────────────────────────────────────────────
  const createDebt: DataContextValue['createDebt'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const shapeErr = validateDebtShape({ origin_transaction_id: null, concept: input.concept })
      if (shapeErr) return { error: shapeErr }

      const amount = normalizeAmount(input.amount, input.currency)
      const { exchange_rate, amount_usd } = freeze(amount, input.currency, rates)

      const { error } = await supabase.from('fin_debts').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        person_id: input.person_id,
        concept: input.concept.trim(),
        amount,
        currency: input.currency,
        exchange_rate,
        amount_usd,
        // Deuda suelta: no hay margen — te deben plata, punto.
        principal_usd: amount_usd,
        incurred_on: input.incurred_on,
        status: 'pendiente',
        origin_transaction_id: null,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [rates, user.id, activeProfileId, load]
  )

  const createSharedExpense: DataContextValue['createSharedExpense'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const account = rawAccounts.find(a => a.id === input.account_id)
      if (!account) return { error: 'Cuenta de origen inválida.' }

      const amount = normalizeAmount(input.amount, account.currency)
      const { exchange_rate, amount_usd } = freeze(amount, account.currency, rates)

      // Paso 1: el gasto, tal cual — bruto completo, consumo real (§4.2).
      const { data: txData, error: txError } = await supabase
        .from('fin_transactions')
        .insert({
          user_id: user.id,
          profile_id: activeProfileId,
          type: 'gasto',
          date: input.date,
          account_id: input.account_id,
          to_account_id: null,
          category_id: input.category_id ?? null,
          amount,
          currency: account.currency,
          to_amount: null,
          exchange_rate,
          amount_usd,
          flow_type: 'consumo',
          description: input.description || null,
        })
        .select('id')
        .single()
      if (txError) return { error: isPgError(txError.message) }
      if (!txData) return { error: 'No se pudo crear el gasto.' }

      // Paso 2: una deuda por persona. Sin validar que sumen el total (§4.2)
      // — repartir de más o de menos es válido. El filtro `> 0` va DESPUÉS de
      // normalizar: un split que redondea a 0 en su moneda rompería el
      // `check (amount > 0)` de fin_debts y dejaría el gasto sin repartir.
      const normalizedSplits = input.splits
        .map(s => ({ person_id: s.person_id, amount: normalizeAmount(s.amount, account.currency) }))
        .filter(s => s.amount > 0)
      // Si repartiste más de lo que pagaste, el excedente es ganancia — se
      // reconoce recién al cobrar. `principal_usd` congela, prorrateado,
      // cuánto de cada deuda es recuperar costo real.
      const totalSplit = normalizedSplits.reduce((s, x) => s + x.amount, 0)
      const ratio = splitPrincipalRatio(amount, totalSplit)
      const splitRows = normalizedSplits.map(s => {
        const frozen = freeze(s.amount, account.currency, rates)
        return {
          user_id: user.id,
          profile_id: activeProfileId,
          person_id: s.person_id,
          concept: null,
          amount: s.amount,
          currency: account.currency,
          exchange_rate: frozen.exchange_rate,
          amount_usd: frozen.amount_usd,
          principal_usd: Math.min(frozen.amount_usd, round2(frozen.amount_usd * ratio)),
          incurred_on: input.date,
          status: 'pendiente' as const,
          origin_transaction_id: txData.id,
        }
      })

      if (splitRows.length > 0) {
        const { error: debtsError } = await supabase.from('fin_debts').insert(splitRows)
        if (debtsError) {
          // El gasto ya quedó guardado — no se revierte (sin transacciones
          // multi-tabla del lado del cliente, ver sprint-2-deudas.md §6).
          // Es preferible un gasto sin deudas generadas, corregible a mano,
          // a perder el registro del gasto.
          await load()
          return { error: `El gasto se guardó, pero no se pudieron crear las deudas: ${isPgError(debtsError.message)}` }
        }
      }

      await load()
      return {}
    },
    [rawAccounts, rates, user.id, activeProfileId, load]
  )

  const settleDebts: DataContextValue['settleDebts'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const account = rawAccounts.find(a => a.id === input.account_id)
      if (!account) return { error: 'Cuenta destino inválida.' }
      const selected = debts.filter(d => input.debtIds.includes(d.id))
      if (selected.length === 0) return { error: 'Elegí al menos una deuda.' }
      if (selected.some(d => d.status !== 'pendiente')) return { error: 'Solo se pueden cobrar deudas pendientes.' }
      const firstPerson = selected[0].person_id
      const firstCurrency = selected[0].currency
      if (selected.some(d => d.person_id !== firstPerson || d.currency !== firstCurrency)) {
        return { error: 'Un solo cobro no puede mezclar deudas de distinta persona o moneda.' }
      }

      // Banda de cordura, no de exactitud: la referencia registra lo que
      // realmente llegó y salda la deuda igual — "la diferencia aparece
      // sola en el patrimonio". Solo se rechaza un monto GROSERAMENTE
      // distinto (menos de la mitad o más del doble de lo esperado), que es
      // un typo de orden de magnitud ("15" por "150"), no una propina ni un
      // redondeo. Todo en USD para que no dependa de la moneda de la cuenta.
      const selectedTotal = selected.reduce((sum, d) => sum + d.amount, 0)
      const expectedUsd = toUsd(selectedTotal, firstCurrency, rates)
      const expectedInAccountCurrency = expectedUsd / usdPerUnit(account.currency, rates)
      const inputUsd = toUsd(input.amount, account.currency, rates)
      if (expectedUsd > 0 && (inputUsd < expectedUsd * 0.5 || inputUsd > expectedUsd * 2)) {
        return {
          error: `El monto parece muy distinto de lo esperado (≈ ${expectedInAccountCurrency.toFixed(decimalsFor(account.currency))} ${account.currency}). Revisá, o elegí otras deudas.`,
        }
      }

      const amount = normalizeAmount(input.amount, account.currency)

      // Margen: si las deudas elegidas se repartieron por encima del costo,
      // la parte que excede al costo real es GANANCIA y va como ingreso real
      // (`flow_type = 'consumo'`), no como reembolso. Se prorratea sobre el
      // monto REAL que entra, para que reembolso + ganancia sumen exacto.
      const amountUsdTotal = selected.reduce((s, d) => s + d.amount_usd, 0)
      const marginUsd = marginUsdOf(selected)
      const marginRatio = amountUsdTotal > 0 ? marginUsd / amountUsdTotal : 0
      const ganancia = marginRatio > 0 ? roundFor(amount * marginRatio, account.currency) : 0
      const reembolso = roundFor(amount - ganancia, account.currency)

      const personName = people.find(p => p.id === firstPerson)?.name ?? 'alguien'

      async function crearMovimiento(monto: number, flow_type: 'consumo' | 'movimiento', desc: string) {
        const frozen = freeze(monto, account!.currency, rates)
        return supabase!
          .from('fin_transactions')
          .insert({
            user_id: user.id,
            profile_id: activeProfileId,
            type: 'ingreso',
            date: input.date,
            account_id: input.account_id,
            to_account_id: null,
            category_id: null,
            amount: monto,
            currency: account!.currency,
            to_amount: null,
            exchange_rate: frozen.exchange_rate,
            amount_usd: frozen.amount_usd,
            flow_type,
            description: desc,
          })
          .select('id')
          .single()
      }

      let reembolsoTx: { id: string } | null = null
      let gananciaTx: { id: string } | null = null

      if (reembolso > 0) {
        const { data, error } = await crearMovimiento(reembolso, 'movimiento', `Cobro de ${personName}`)
        if (error || !data) return { error: isPgError(error?.message ?? 'No se pudo registrar el cobro.') }
        reembolsoTx = data
      }
      if (ganancia > 0) {
        const { data, error } = await crearMovimiento(ganancia, 'consumo', `Ganancia — cobro de ${personName}`)
        if (error || !data) {
          if (reembolsoTx) await supabase.from('fin_transactions').delete().eq('id', reembolsoTx.id)
          return { error: isPgError(error?.message ?? 'No se pudo registrar la ganancia.') }
        }
        gananciaTx = data
      }

      // `settled_transaction_id` es siempre el "principal" (el reembolso, o
      // la ganancia si el cobro fue 100% margen); `settled_margin_transaction_id`
      // es el otro, solo cuando hay dos.
      const principalTx = reembolsoTx ?? gananciaTx!
      const margenTx = reembolsoTx ? gananciaTx : null

      // B1: `.eq('status','pendiente')` + conteo es la guarda contra una
      // carrera — si otra pestaña cobró alguna de estas deudas entre el
      // último load() y ahora, el update no la toca y el conteo lo detecta.
      // Sin esto, se pisaba en silencio el settled_transaction_id anterior y
      // el ingreso viejo quedaba huérfano (plata contada dos veces).
      const { data: updated, error: debtsError } = await supabase
        .from('fin_debts')
        .update({ status: 'cobrada', settled_transaction_id: principalTx.id, settled_margin_transaction_id: margenTx?.id ?? null })
        .in('id', input.debtIds)
        .eq('status', 'pendiente')
        .select('id')
      if (debtsError || (updated ?? []).length !== input.debtIds.length) {
        // Compensación: si no se enlazaron todas, ningún movimiento debe
        // quedar. Primero se revierten las deudas que SÍ se linkearon (si no,
        // el FK on-delete-set-null dejaría filas 'cobrada' sin
        // settled_transaction_id → viola fin_debt_settle_shape y bloquea el
        // propio delete). Peor caso: ambos pasos fallan y queda un ingreso
        // suelto en la lista, una fila válida que se corrige a mano.
        const linkedIds = (updated ?? []).map(r => r.id)
        if (linkedIds.length > 0) {
          await supabase
            .from('fin_debts')
            .update({ status: 'pendiente', settled_transaction_id: null, settled_margin_transaction_id: null })
            .in('id', linkedIds)
        }
        const ids = [reembolsoTx?.id, gananciaTx?.id].filter((x): x is string => Boolean(x))
        if (ids.length > 0) await supabase.from('fin_transactions').delete().in('id', ids)
        await load()
        return {
          error: debtsError
            ? `No se pudo marcar la deuda como cobrada: ${isPgError(debtsError.message)}`
            : 'Alguna de las deudas ya fue cobrada en otra pestaña. No se registró el cobro.',
        }
      }

      await load()
      return {}
    },
    [rawAccounts, debts, people, rates, user.id, activeProfileId, load]
  )

  const waiveDebt: DataContextValue['waiveDebt'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const debt = debts.find(d => d.id === id)
      if (!debt) return { error: 'Deuda inválida.' }
      if (debt.status !== 'pendiente') return { error: 'Solo se puede condonar una deuda pendiente.' }
      // `.eq('status','pendiente')` acá también: si se cobró en otra pestaña,
      // el update no la toca y el conteo lo detecta (el CHECK igual lo
      // atraparía, pero el mensaje sería un error crudo de Postgres).
      const { data, error } = await supabase
        .from('fin_debts')
        .update({ status: 'condonada', waived_on: todayISO() })
        .eq('id', id)
        .eq('status', 'pendiente')
        .select('id')
      if (error) return { error: isPgError(error.message) }
      if ((data ?? []).length === 0) return { error: 'Esa deuda ya no está pendiente (¿se cobró en otra pestaña?).' }
      await load()
      return {}
    },
    [debts, load]
  )

  const deleteDebt: DataContextValue['deleteDebt'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // B7: una cuota de un plan no se borra suelta — se edita o se borra el
      // plan entero desde su detalle (sprint-4). Borrarla acá dejaría el
      // plan con un hueco y `planProgress` mostrando un total equivocado.
      const debt = debts.find(d => d.id === id)
      if (debt?.plan_id) {
        return { error: 'Esta deuda es una cuota de un plan. Editá o borrá el plan desde su detalle.' }
      }
      const { error } = await supabase.from('fin_debts').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [debts, load]
  )

  // ── Fijos ─────────────────────────────────────────────────────────────
  const createRecurring: DataContextValue['createRecurring'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const isSavings = !!input.savings_goal_id
      const { data, error } = await supabase
        .from('fin_recurring')
        .insert({
          user_id: user.id,
          profile_id: activeProfileId,
          name: input.name,
          icon: input.icon ?? null,
          type: input.type,
          amount: normalizeAmount(input.amount, input.currency),
          currency: input.currency,
          // Un fijo de ahorro no lleva categoría (§4.10) — el CHECK lo exige.
          category_id: isSavings ? null : input.category_id ?? null,
          frequency: input.frequency,
          day_of_month: input.day_of_month,
          month_of_year: input.frequency === 'anual' ? (input.month_of_year ?? null) : null,
          starts_on: input.starts_on,
          note: input.note || null,
          savings_goal_id: input.savings_goal_id ?? null,
          to_account_id: isSavings ? input.to_account_id ?? null : null,
        })
        .select('id')
        .single()
      if (error) return { error: isPgError(error.message) }
      await load()
      return { id: data?.id }
    },
    [user.id, activeProfileId, load]
  )

  const updateRecurring: DataContextValue['updateRecurring'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // createRecurring() normaliza `amount` contra la moneda antes de
      // insertar; esto guardaba `patch` tal cual, así que editar el monto
      // (o la moneda) de un fijo existente podía persistir un valor con más
      // precisión de la que le corresponde a esa moneda — el resto de las
      // mutaciones de este archivo siempre normalizan antes de escribir.
      // Bug real, revisión del Sprint 4 (segunda pasada).
      const nextPatch: Record<string, unknown> = { ...patch }
      if (patch.amount != null) {
        const nextCurrency = patch.currency ?? recurring.find(r => r.id === id)?.currency
        if (nextCurrency) nextPatch.amount = normalizeAmount(patch.amount, nextCurrency)
      }
      // Fijo de ahorro: goal + to_account juntos, sin categoría (§4.10).
      if (patch.savings_goal_id !== undefined) {
        if (patch.savings_goal_id) {
          nextPatch.category_id = null
        } else {
          nextPatch.to_account_id = null
        }
      }
      const { error } = await supabase.from('fin_recurring').update(nextPatch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [recurring, load]
  )

  const deleteRecurring: DataContextValue['deleteRecurring'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      // Sin distinción archivar/borrar: recurring_id en fin_transactions es
      // `on delete set null` (§3.1 del sprint 3) — borrar la plantilla
      // nunca borra lo que ya generó, así que un borrado directo es seguro
      // incluso con historial.
      const { error } = await supabase.from('fin_recurring').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [load]
  )

  const setRecurringSplits: DataContextValue['setRecurringSplits'] = useCallback(
    async (recurringId, splits) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      // Reemplazo completo (borrar todo + insertar de nuevo) en vez de un
      // diff fila por fila: son a lo sumo un puñado de personas por
      // plantilla, y así no hay que rastrear qué fila es cuál entre
      // renders (sprint-3-fijos.md §6).
      const { error: deleteError } = await supabase.from('fin_recurring_splits').delete().eq('recurring_id', recurringId)
      if (deleteError) return { error: isPgError(deleteError.message) }
      if (splits.length > 0) {
        const { error: insertError } = await supabase
          .from('fin_recurring_splits')
          .insert(splits.map(s => ({ recurring_id: recurringId, profile_id: activeProfileId, person_id: s.person_id, amount: s.amount })))
        if (insertError) return { error: isPgError(insertError.message) }
      }
      await load()
      return {}
    },
    [activeProfileId, load]
  )

  const registerRecurring: DataContextValue['registerRecurring'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const template = recurring.find(r => r.id === input.recurring_id)
      if (!template) return { error: 'Fijo inválido.' }
      const account = rawAccounts.find(a => a.id === input.account_id)
      if (!account) return { error: 'Cuenta inválida.' }
      if (account.currency !== template.currency) {
        // Defensa en profundidad — el formulario ya solo ofrece cuentas de
        // la misma moneda (§0 del sprint 3), pero no confiamos solo en eso.
        return { error: 'Esa cuenta no es de la misma moneda que el fijo.' }
      }

      // Sprint 6 · fijo de ahorro: la cuenta destino se pide al registrar
      // (§4.10). Genera una transferencia tageada en vez del gasto de siempre.
      const savingsGoal = template.savings_goal_id ? savingsGoals.find(g => g.id === template.savings_goal_id) : null
      const savingsToAccountId = input.to_account_id ?? template.to_account_id
      const savingsToAccount = savingsGoal ? rawAccounts.find(a => a.id === savingsToAccountId) : undefined
      if (savingsGoal) {
        if (savingsGoal.archived) return { error: 'El ahorro de este fijo está archivado. Reactivalo o quitalo del fijo.' }
        if (!savingsToAccount) return { error: 'Elegí a qué cuenta de ahorro entra el aporte.' }
        if (savingsToAccount.currency !== template.currency) return { error: 'La cuenta de ahorro tiene que ser de la misma moneda que el fijo.' }
      }

      // B1 · Idempotencia: dos toques (o dos dispositivos) no generan dos
      // gastos. Se chequea contra el PERÍODO de `input.date`, no la fecha
      // exacta — el segundo toque podría traer otro día del mismo mes. Query
      // fresca (no `allTx` en memoria) para atrapar la carrera entre pestañas.
      // `force` lo salta para el caso raro de dos cobros reales el mismo mes.
      if (!input.force) {
        const [dy, dm] = input.date.split('-').map(Number)
        const lastDay = new Date(dy, dm, 0).getDate() // día 0 del mes siguiente = último de dm
        const from = template.frequency === 'anual' ? `${dy}-01-01` : `${dy}-${String(dm).padStart(2, '0')}-01`
        const to = template.frequency === 'anual' ? `${dy}-12-31` : `${dy}-${String(dm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const { data: existing } = await supabase
          .from('fin_transactions')
          .select('id')
          .eq('recurring_id', template.id)
          .gte('date', from)
          .lte('date', to)
          .limit(1)
        if (existing && existing.length > 0) {
          await load()
          return { error: 'Este fijo ya tiene un movimiento en este período.', alreadyRegistered: true }
        }
      }

      const amount = normalizeAmount(input.amount, account.currency)
      const { exchange_rate, amount_usd } = freeze(amount, account.currency, rates)
      const received = savingsGoal ? freezeReceived(amount, savingsToAccount!.currency, rates) : { to_exchange_rate: null, to_amount_usd: null }

      const txRow = {
        user_id: user.id,
        profile_id: activeProfileId,
        type: (savingsGoal ? 'transferencia' : template.type) as TransactionType,
        date: input.date,
        account_id: input.account_id,
        to_account_id: savingsGoal ? savingsToAccountId : null,
        category_id: savingsGoal ? null : input.category_id ?? null,
        amount,
        currency: account.currency,
        to_amount: savingsGoal ? amount : null,
        exchange_rate,
        amount_usd,
        to_exchange_rate: received.to_exchange_rate,
        to_amount_usd: received.to_amount_usd,
        // El trigger fin_normalize_flow_type ya fuerza 'movimiento' en una
        // transferencia; lo dejamos explícito para no depender de eso.
        flow_type: savingsGoal ? 'movimiento' : 'consumo',
        recurring_id: template.id,
        description: input.description || null,
        savings_goal_id: savingsGoal ? savingsGoal.id : null,
        savings_flow: savingsGoal ? 'aporte' : null,
        savings_period: savingsGoal ? periodStart(input.date) : null,
      }

      const { data: txData, error: txError } = await supabase.from('fin_transactions').insert(txRow).select('id').single()
      if (txError) return { error: isPgError(txError.message) }
      if (!txData) return { error: 'No se pudo registrar el fijo.' }

      if (!savingsGoal && template.type === 'gasto' && input.splits && input.splits.length > 0) {
        // Filtro `> 0` después de normalizar + `principal_usd` prorrateado,
        // igual que createSharedExpense.
        const normalizedSplits = input.splits
          .map(s => ({ person_id: s.person_id, amount: normalizeAmount(s.amount, account.currency) }))
          .filter(s => s.amount > 0)
        const totalSplit = normalizedSplits.reduce((s, x) => s + x.amount, 0)
        const ratio = splitPrincipalRatio(amount, totalSplit)
        const splitRows = normalizedSplits.map(s => {
          const frozen = freeze(s.amount, account.currency, rates)
          return {
            user_id: user.id,
            profile_id: activeProfileId,
            person_id: s.person_id,
            concept: null,
            amount: s.amount,
            currency: account.currency,
            exchange_rate: frozen.exchange_rate,
            amount_usd: frozen.amount_usd,
            principal_usd: Math.min(frozen.amount_usd, round2(frozen.amount_usd * ratio)),
            incurred_on: input.date,
            status: 'pendiente' as const,
            origin_transaction_id: txData.id,
          }
        })
        if (splitRows.length > 0) {
          const { error: debtsError } = await supabase.from('fin_debts').insert(splitRows)
          if (debtsError) {
            await load()
            return { error: `El fijo se registró, pero no se pudieron crear las deudas: ${isPgError(debtsError.message)}` }
          }
        }
      }

      // Recuerda la cuenta usada para sugerirla sola el próximo período —
      // no fatal si falla, es solo una sugerencia (§6 del sprint 3). Para un
      // fijo de ahorro recuerda también la cuenta destino.
      await supabase
        .from('fin_recurring')
        .update(savingsGoal ? { account_id: input.account_id, to_account_id: savingsToAccountId } : { account_id: input.account_id })
        .eq('id', template.id)

      await load()
      return {}
    },
    [recurring, rawAccounts, savingsGoals, rates, user.id, activeProfileId, load]
  )

  // ── Planes de pago ────────────────────────────────────────────────────
  // Solo se puede planificar una deuda suelta y pendiente (no una generada
  // por un gasto compartido o un fijo — esas ya tienen su propio origen y
  // su propio flujo de cobro): `fin_debt_origin_shape` garantiza que una
  // deuda así siempre trae `concept` (sprint-4-planes-de-pago.md §4.3).
  const createDebtPlan: DataContextValue['createDebtPlan'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const debt = debts.find(d => d.id === input.debt_id)
      if (!debt) return { error: 'Deuda inválida.' }
      if (debt.status !== 'pendiente') return { error: 'Solo se puede planificar una deuda pendiente.' }
      if (debt.plan_id) return { error: 'Esta deuda ya es parte de un plan.' }
      if (debt.origin_transaction_id) {
        return { error: 'Solo se puede planificar una deuda suelta, no una generada por un gasto compartido o un fijo.' }
      }
      if (input.installments.length === 0) return { error: 'El plan necesita al menos una cuota.' }
      if (!debt.concept) return { error: 'Esta deuda no tiene concepto.' }

      const { data: planData, error: planError } = await supabase
        .from('fin_debt_plans')
        .insert({
          user_id: user.id,
          profile_id: activeProfileId,
          person_id: debt.person_id,
          concept: debt.concept,
          principal: debt.amount,
          currency: debt.currency,
        })
        .select('id')
        .single()
      if (planError) return { error: isPgError(planError.message) }
      if (!planData) return { error: 'No se pudo crear el plan.' }

      const installmentRows = input.installments.map((inst, i) => {
        const amount = normalizeAmount(inst.amount, debt.currency)
        const { exchange_rate, amount_usd } = freeze(amount, debt.currency, rates)
        return {
          user_id: user.id,
          profile_id: activeProfileId,
          person_id: debt.person_id,
          concept: debt.concept,
          amount,
          currency: debt.currency,
          exchange_rate,
          amount_usd,
          // Una cuota de un préstamo no tiene margen: es recuperar capital.
          principal_usd: amount_usd,
          incurred_on: inst.date,
          status: 'pendiente' as const,
          origin_transaction_id: null,
          plan_id: planData.id,
          installment_number: i + 1,
        }
      })

      const { error: installmentsError } = await supabase.from('fin_debts').insert(installmentRows)
      if (installmentsError) {
        // Sin cuotas un plan no sirve de nada — se limpia antes de avisar,
        // en vez de dejar un plan fantasma con 0/0 (§4.3).
        await supabase.from('fin_debt_plans').delete().eq('id', planData.id)
        return { error: `No se pudieron crear las cuotas: ${isPgError(installmentsError.message)}` }
      }

      const { error: deleteError } = await supabase.from('fin_debts').delete().eq('id', debt.id)
      if (deleteError) {
        // Las cuotas ya existen — la deuda original queda duplicada hasta
        // borrarla a mano (mismo criterio de "no revertir lo ya guardado"
        // que createSharedExpense, §6).
        await load()
        return { error: `El plan se creó, pero no se pudo borrar la deuda original: ${isPgError(deleteError.message)}` }
      }

      await load()
      return {}
    },
    [debts, rates, user.id, activeProfileId, load]
  )

  // Bloqueada si alguna cuota ya fue cobrada o condonada: el borrado del
  // plan hace cascada sobre sus cuotas (`fin_debts.plan_id on delete
  // cascade`, el único cascade de esta mini app) y una cuota resuelta no
  // se puede perder así (§4.4).
  const deleteDebtPlan: DataContextValue['deleteDebtPlan'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const installments = debts.filter(d => d.plan_id === id)
      if (installments.some(d => d.status !== 'pendiente')) {
        return { error: 'No se puede borrar: ya se cobró o condonó alguna cuota de este plan.' }
      }
      const { error } = await supabase.from('fin_debt_plans').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [debts, load]
  )

  // Solo toca las cuotas pendientes: las cobradas/condonadas quedan tal
  // cual (§4.5). Inserta las cuotas nuevas antes de borrar las viejas para
  // no quedarse sin ninguna si algo falla a mitad de camino.
  const regenerateDebtPlan: DataContextValue['regenerateDebtPlan'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const plan = plans.find(p => p.id === input.plan_id)
      if (!plan) return { error: 'Plan inválido.' }
      if (input.installments.length === 0) return { error: 'El plan necesita al menos una cuota pendiente.' }

      const pendingIds = debts.filter(d => d.plan_id === input.plan_id && d.status === 'pendiente').map(d => d.id)
      let nextNumber = nextInstallmentNumber(input.plan_id, debts)

      const installmentRows = input.installments.map(inst => {
        const amount = normalizeAmount(inst.amount, plan.currency)
        const { exchange_rate, amount_usd } = freeze(amount, plan.currency, rates)
        const row = {
          user_id: user.id,
          profile_id: activeProfileId,
          person_id: plan.person_id,
          concept: plan.concept,
          amount,
          currency: plan.currency,
          exchange_rate,
          amount_usd,
          principal_usd: amount_usd,
          incurred_on: inst.date,
          status: 'pendiente' as const,
          origin_transaction_id: null,
          plan_id: plan.id,
          installment_number: nextNumber,
        }
        nextNumber += 1
        return row
      })

      const { error: insertError } = await supabase.from('fin_debts').insert(installmentRows)
      if (insertError) return { error: isPgError(insertError.message) }

      if (pendingIds.length > 0) {
        const { error: deleteError } = await supabase.from('fin_debts').delete().in('id', pendingIds)
        if (deleteError) {
          await load()
          return { error: `Se crearon las cuotas nuevas, pero no se pudieron borrar las viejas: ${isPgError(deleteError.message)}` }
        }
      }

      await load()
      return {}
    },
    [plans, debts, rates, user.id, activeProfileId, load]
  )

  // ── Presupuesto ───────────────────────────────────────────────────────
  const createBudgetLine: DataContextValue['createBudgetLine'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      if (input.categoryIds.length === 0) return { error: 'Elegí al menos una categoría.' }
      // Una categoría no puede estar en dos líneas a la vez (§3.2).
      const taken = input.categoryIds.filter(id => budgetLineCategories.some(lc => lc.category_id === id))
      if (taken.length > 0) {
        return { error: `${taken.map(id => categoryName(id)).join(', ')} ya está en otro presupuesto.` }
      }
      const amount = normalizeAmount(input.amount, input.input_currency)
      if (!(amount > 0)) return { error: 'Ingresá un monto válido.' }
      const { exchange_rate, amount_usd } = freeze(amount, input.input_currency, rates)

      const { data: lineData, error: lineError } = await supabase
        .from('fin_budget_lines')
        .insert({
          user_id: user.id,
          profile_id: activeProfileId,
          name: input.name?.trim() || null,
          input_currency: input.input_currency,
          retroactive: input.retroactive,
        })
        .select('id')
        .single()
      if (lineError || !lineData) return { error: isPgError(lineError?.message ?? 'No se pudo crear el presupuesto.') }

      const { error: catError } = await supabase
        .from('fin_budget_line_categories')
        .insert(input.categoryIds.map(category_id => ({ line_id: lineData.id, category_id, profile_id: activeProfileId })))
      if (catError) {
        await supabase.from('fin_budget_lines').delete().eq('id', lineData.id)
        return { error: isPgError(catError.message) }
      }

      const { error: periodError } = await supabase.from('fin_budget_periods').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        line_id: lineData.id,
        period: periodStart(todayISO()),
        amount,
        exchange_rate,
        amount_usd,
      })
      if (periodError) {
        await supabase.from('fin_budget_lines').delete().eq('id', lineData.id)
        return { error: isPgError(periodError.message) }
      }

      await load()
      return {}
    },
    [budgetLineCategories, categoryName, rates, user.id, activeProfileId, load]
  )

  const updateBudgetLine: DataContextValue['updateBudgetLine'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (patch.name !== undefined) {
        const { error } = await supabase.from('fin_budget_lines').update({ name: patch.name?.trim() || null }).eq('id', id)
        if (error) return { error: isPgError(error.message) }
      }
      if (patch.categoryIds) {
        if (!activeProfileId) return { error: 'No hay un perfil activo.' }
        if (patch.categoryIds.length === 0) return { error: 'El presupuesto necesita al menos una categoría.' }
        const taken = patch.categoryIds.filter(cid => budgetLineCategories.some(lc => lc.category_id === cid && lc.line_id !== id))
        if (taken.length > 0) return { error: `${taken.map(cid => categoryName(cid)).join(', ')} ya está en otro presupuesto.` }
        const { error: delError } = await supabase.from('fin_budget_line_categories').delete().eq('line_id', id)
        if (delError) return { error: isPgError(delError.message) }
        const { error: insError } = await supabase
          .from('fin_budget_line_categories')
          .insert(patch.categoryIds.map(category_id => ({ line_id: id, category_id, profile_id: activeProfileId })))
        if (insError) return { error: isPgError(insError.message) }
      }
      await load()
      return {}
    },
    [budgetLineCategories, categoryName, activeProfileId, load]
  )

  const deleteBudgetLine: DataContextValue['deleteBudgetLine'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_budget_lines').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [load]
  )

  const setBudgetPeriodAmount: DataContextValue['setBudgetPeriodAmount'] = useCallback(
    async (lineId, period, rawAmount) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const line = budgetLines.find(l => l.id === lineId)
      if (!line) return { error: 'Presupuesto inválido.' }
      const amount = normalizeAmount(rawAmount, line.input_currency)
      if (!(amount > 0)) return { error: 'Ingresá un monto válido.' }
      const { exchange_rate, amount_usd } = freeze(amount, line.input_currency, rates)
      const { error } = await supabase
        .from('fin_budget_periods')
        .upsert(
          { user_id: user.id, profile_id: activeProfileId, line_id: lineId, period, amount, exchange_rate, amount_usd },
          { onConflict: 'line_id,period' }
        )
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [budgetLines, rates, user.id, activeProfileId, load]
  )

  const extendBudget: DataContextValue['extendBudget'] = useCallback(
    async (lineId, period, rawAmount) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const line = budgetLines.find(l => l.id === lineId)
      if (!line) return { error: 'Presupuesto inválido.' }
      const amount = normalizeAmount(rawAmount, line.input_currency)
      if (!(amount > 0)) return { error: 'Ingresá un monto válido.' }
      const { exchange_rate, amount_usd } = freeze(amount, line.input_currency, rates)

      // Materializar el período si todavía se heredaba (§3.4).
      let periodRowId = budgetPeriods.find(p => p.line_id === lineId && p.period === period)?.id
      if (!periodRowId) {
        const resolved = resolvePeriodAmount(budgetPeriods, lineId, period)
        const base = resolved.amount ?? amount // si la línea nunca tuvo monto, la ampliación ES el monto
        const frozen = freeze(base, line.input_currency, rates)
        const { data, error } = await supabase
          .from('fin_budget_periods')
          .insert({
            user_id: user.id,
            profile_id: activeProfileId,
            line_id: lineId,
            period,
            amount: base,
            exchange_rate: frozen.exchange_rate,
            amount_usd: frozen.amount_usd,
          })
          .select('id')
          .single()
        if (error || !data) return { error: isPgError(error?.message ?? 'No se pudo abrir el período.') }
        periodRowId = data.id
      }

      const { error } = await supabase.from('fin_budget_extensions').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        period_id: periodRowId,
        amount,
        exchange_rate,
        amount_usd,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [budgetLines, budgetPeriods, rates, user.id, activeProfileId, load]
  )

  const closeBudgetPeriod: DataContextValue['closeBudgetPeriod'] = useCallback(
    async (lineId, period, carried) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const pending = budgetView.pendingClosures.find(p => p.line_id === lineId && p.period === period)
      if (!pending) return { error: 'Ese mes ya no está pendiente de cerrar.' }
      const { error } = await supabase.from('fin_budget_closures').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        line_id: lineId,
        period,
        carried,
        amount_usd: pending.available_usd,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [budgetView, user.id, activeProfileId, load]
  )

  // ── Ahorro (Sprint 6) ─────────────────────────────────────────────────
  const createSavingsGoal: DataContextValue['createSavingsGoal'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const shapeErr = validateGoal(input)
      if (shapeErr) return { error: shapeErr }

      // Como mucho un cajón de sastre activo: desmarcar al anterior antes de
      // insertar, si no el índice único parcial rebota con un error crudo (§6).
      if (input.is_catchall) {
        const prev = savingsGoals.find(g => g.is_catchall && !g.archived)
        if (prev) {
          const { error } = await supabase.from('fin_savings_goals').update({ is_catchall: false }).eq('id', prev.id)
          if (error) return { error: isPgError(error.message) }
        }
      }

      const { error } = await supabase.from('fin_savings_goals').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        name: input.name.trim(),
        input_currency: input.input_currency,
        allocation_type: input.allocation_type,
        allocation_value: normalizeAmount(input.allocation_value, input.allocation_type === 'percent' ? 'USD' : input.input_currency),
        target_amount: input.target_amount != null ? normalizeAmount(input.target_amount, input.input_currency) : null,
        target_date: input.target_date ?? null,
        is_catchall: input.is_catchall ?? false,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [savingsGoals, user.id, activeProfileId, load]
  )

  const updateSavingsGoal: DataContextValue['updateSavingsGoal'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const goal = savingsGoals.find(g => g.id === id)
      if (!goal) return { error: 'Ahorro inválido.' }

      // La moneda se congela con el primer movimiento (§4.9).
      if (patch.input_currency && patch.input_currency !== goal.input_currency) {
        if (allTx.some(t => t.savings_goal_id === id)) {
          return { error: 'No se puede cambiar la moneda de un ahorro que ya tiene movimientos.' }
        }
      }

      const nextType = patch.allocation_type ?? goal.allocation_type
      const nextValue = patch.allocation_value ?? goal.allocation_value
      if (patch.name !== undefined || patch.allocation_type !== undefined || patch.allocation_value !== undefined || patch.target_amount !== undefined) {
        const shapeErr = validateGoal({
          name: patch.name ?? goal.name,
          allocation_type: nextType,
          allocation_value: nextValue,
          target_amount: patch.target_amount !== undefined ? patch.target_amount : goal.target_amount,
        })
        if (shapeErr) return { error: shapeErr }
      }

      if (patch.is_catchall === true && !goal.is_catchall) {
        const prev = savingsGoals.find(g => g.is_catchall && !g.archived && g.id !== id)
        if (prev) {
          const { error } = await supabase.from('fin_savings_goals').update({ is_catchall: false }).eq('id', prev.id)
          if (error) return { error: isPgError(error.message) }
        }
      }

      const cur = patch.input_currency ?? goal.input_currency
      const nextPatch: Record<string, unknown> = { ...patch }
      if (patch.name !== undefined) nextPatch.name = patch.name?.trim()
      if (patch.allocation_value != null) {
        nextPatch.allocation_value = normalizeAmount(patch.allocation_value, nextType === 'percent' ? 'USD' : cur)
      }
      if (patch.target_amount != null) nextPatch.target_amount = normalizeAmount(patch.target_amount, cur)

      const { error } = await supabase.from('fin_savings_goals').update(nextPatch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [savingsGoals, allTx, load]
  )

  const deleteSavingsGoal: DataContextValue['deleteSavingsGoal'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const fijos = recurring.filter(r => r.savings_goal_id === id)
      if (fijos.length > 0) {
        return { error: `No se puede borrar: ${fijos.map(f => f.name).join(', ')} ${fijos.length === 1 ? 'es un fijo que aporta' : 'son fijos que aportan'} a este ahorro. Sacá el ahorro de ${fijos.length === 1 ? 'ese fijo' : 'esos fijos'} primero.` }
      }

      // `on delete set null` solo nulea `savings_goal_id` y deja los otros tres
      // campos colgados — la fila intermedia viola el CHECK y el DELETE muere.
      // Los aportes y traslados de este ahorro son transferencias con mecánica
      // de ahorro: sin la etiqueta no significan nada, y un aporte "a la misma
      // cuenta" ni siquiera es una transferencia válida (`fin_tx_shape`) — se
      // borran. Los retiros son gastos reales: solo pierden la etiqueta.
      const goalTx = allTx.filter(t => t.savings_goal_id === id)
      const toDelete = goalTx.filter(t => t.savings_flow === 'aporte' || t.savings_flow === 'traslado').map(t => t.id)
      const toClear = goalTx.filter(t => t.savings_flow === 'retiro').map(t => t.id)
      if (toDelete.length > 0) {
        const { error: delError } = await supabase.from('fin_transactions').delete().in('id', toDelete)
        if (delError) return { error: isPgError(delError.message) }
      }
      if (toClear.length > 0) {
        const { error: clearError } = await supabase
          .from('fin_transactions')
          .update({ savings_goal_id: null, savings_flow: null, savings_reason: null, savings_period: null })
          .in('id', toClear)
        if (clearError) return { error: isPgError(clearError.message) }
      }
      const { error } = await supabase.from('fin_savings_goals').delete().eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [recurring, allTx, load]
  )

  const saveSavingsForPeriod: DataContextValue['saveSavingsForPeriod'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const goal = savingsGoals.find(g => g.id === input.goal_id)
      if (!goal || goal.archived) return { error: 'Ahorro inválido.' }

      const currentPeriod = periodStart(todayISO())
      if (!(input.period < currentPeriod)) return { error: 'Todavía no terminó ese mes — no se sabe cuánto va a sobrar.' }
      if (!canSaveForPeriod(goal, input.period)) return { error: 'Este ahorro no existía ese mes.' }
      if (savedPeriodsOf(allTx, goal.id).has(input.period)) return { error: 'Ya ahorraste en este plan para ese mes.' }

      const fromAccount = rawAccounts.find(a => a.id === input.from_account_id)
      if (!fromAccount) return { error: 'Cuenta de origen inválida.' }
      if (fromAccount.currency !== goal.input_currency) {
        return { error: `El origen tiene que ser una cuenta en ${goal.input_currency}, la moneda de este ahorro.` }
      }
      const toAccountId = input.to_account_id ?? input.from_account_id
      const toAccount = rawAccounts.find(a => a.id === toAccountId)
      if (!toAccount) return { error: 'Cuenta destino inválida.' }
      if (toAccount.currency !== fromAccount.currency) {
        return { error: 'Elegí una cuenta destino en la misma moneda.' }
      }

      const amount = normalizeAmount(input.amount, fromAccount.currency)
      if (!(amount > 0)) return { error: 'Ingresá un monto válido.' }
      const free = freeByAccount(accounts, allTx).get(input.from_account_id) ?? 0
      if (amount > free + 1e-9) {
        return { error: `${fromAccount.name} tiene ${roundFor(free, fromAccount.currency)} libres para ahorrar, no ${amount}.` }
      }

      const { exchange_rate, amount_usd } = freeze(amount, fromAccount.currency, rates)
      const { to_exchange_rate, to_amount_usd } = freezeReceived(amount, toAccount.currency, rates)
      const { error } = await supabase.from('fin_transactions').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        type: 'transferencia',
        date: input.date ?? todayISO(),
        account_id: input.from_account_id,
        to_account_id: toAccountId,
        category_id: null,
        amount,
        currency: fromAccount.currency,
        to_amount: amount,
        exchange_rate,
        amount_usd,
        to_exchange_rate,
        to_amount_usd,
        description: null,
        savings_goal_id: goal.id,
        savings_flow: 'aporte',
        savings_period: input.period,
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [savingsGoals, allTx, accounts, rawAccounts, rates, user.id, activeProfileId, load]
  )

  const moveSavings: DataContextValue['moveSavings'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      const goal = savingsGoals.find(g => g.id === input.goal_id)
      if (!goal) return { error: 'Ahorro inválido.' }
      if (input.from_account_id === input.to_account_id) return { error: 'Elegí dos cuentas distintas.' }

      const fromAccount = rawAccounts.find(a => a.id === input.from_account_id)
      const toAccount = rawAccounts.find(a => a.id === input.to_account_id)
      if (!fromAccount || !toAccount) return { error: 'Cuenta inválida.' }

      const amount = normalizeAmount(input.amount, fromAccount.currency)
      if (!(amount > 0)) return { error: 'Ingresá un monto válido.' }

      // Tope: lo que ESTE ahorro tiene en la cuenta de origen, acotado por el
      // saldo real de esa cuenta (§4.11 — si la plata se gastó, no está).
      const inThisAccount = goalByAccountMap.get(goal.id)?.get(input.from_account_id) ?? 0
      const fromBalance = accounts.find(a => a.id === input.from_account_id)?.balance ?? 0
      const cap = Math.min(inThisAccount, fromBalance)
      if (amount > cap + 1e-9) {
        return { error: `Este ahorro tiene ${roundFor(Math.max(0, cap), fromAccount.currency)} en ${fromAccount.name}.` }
      }

      const crossCurrency = fromAccount.currency !== toAccount.currency
      const to_amount = crossCurrency
        ? input.to_amount != null
          ? normalizeAmount(input.to_amount, toAccount.currency)
          : null
        : amount
      if (crossCurrency && (to_amount == null || to_amount <= 0)) return { error: 'Indicá cuánto llegó a la otra cuenta.' }

      const { exchange_rate, amount_usd } = freeze(amount, fromAccount.currency, rates)
      const { to_exchange_rate, to_amount_usd } = freezeReceived(to_amount, toAccount.currency, rates)
      const { error } = await supabase.from('fin_transactions').insert({
        user_id: user.id,
        profile_id: activeProfileId,
        type: 'transferencia',
        date: input.date ?? todayISO(),
        account_id: input.from_account_id,
        to_account_id: input.to_account_id,
        category_id: null,
        amount,
        currency: fromAccount.currency,
        to_amount,
        exchange_rate,
        amount_usd,
        to_exchange_rate,
        to_amount_usd,
        description: input.description || null,
        savings_goal_id: goal.id,
        savings_flow: 'traslado',
      })
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [savingsGoals, rawAccounts, accounts, goalByAccountMap, rates, user.id, activeProfileId, load]
  )

  // ── Proyectos (Sprint 10) ─────────────────────────────────────────────
  const createProject: DataContextValue['createProject'] = useCallback(
    async input => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      if (!activeProfileId) return { error: 'No hay un perfil activo.' }
      if (!(input.target_amount > 0)) return { error: 'Ingresá un monto objetivo válido.' }
      const amount = normalizeAmount(input.target_amount, input.target_currency)
      const { exchange_rate, amount_usd } = freeze(amount, input.target_currency, rates)
      const { data, error } = await supabase
        .from('fin_budget_projects')
        .insert({
          user_id: user.id,
          profile_id: activeProfileId,
          name: input.name.trim(),
          target_amount: amount,
          target_currency: input.target_currency,
          exchange_rate,
          target_amount_usd: amount_usd,
          sort_order: budgetProjects.length,
        })
        .select('id')
        .single()
      if (error || !data) return { error: isPgError(error?.message ?? 'No se pudo crear el proyecto.') }
      await load()
      return { id: data.id }
    },
    [activeProfileId, budgetProjects, rates, user.id, load]
  )

  const updateProject: DataContextValue['updateProject'] = useCallback(
    async (id, patch) => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error } = await supabase.from('fin_budget_projects').update(patch).eq('id', id)
      if (error) return { error: isPgError(error.message) }
      await load()
      return {}
    },
    [load]
  )

  // Borra directo — igual que cuentas/perfiles: si el proyecto tiene
  // movimientos etiquetados, el `on delete restrict` lo rechaza y se
  // archiva en su lugar (§4.7).
  const deleteOrArchiveProject: DataContextValue['deleteOrArchiveProject'] = useCallback(
    async id => {
      if (!supabase) return { error: 'Supabase no está configurado.' }
      const { error: deleteError } = await supabase.from('fin_budget_projects').delete().eq('id', id)
      if (deleteError) {
        if (!deleteError.message.includes('foreign key') && !deleteError.message.includes('on delete restrict')) {
          return { error: isPgError(deleteError.message) }
        }
        const { error: archiveError } = await supabase.from('fin_budget_projects').update({ archived: true }).eq('id', id)
        if (archiveError) return { error: isPgError(archiveError.message) }
      }
      await load()
      return {}
    },
    [load]
  )

  // ── Quick add ─────────────────────────────────────────────────────────
  const openQuickAdd = useCallback((opts?: { lockType?: TransactionType; editing?: Transaction }) => {
    setQuickAdd({ open: true, lockType: opts?.lockType, editing: opts?.editing ?? null })
  }, [])
  const closeQuickAdd = useCallback(() => setQuickAdd({ open: false }), [])

  const value: DataContextValue = {
    loading,
    error,
    accounts,
    activeAccounts,
    categories,
    rates,
    allTx,
    feedTx,
    monthTx,
    recentTx,
    investmentAdjustmentAccounts,
    totalUsd: total,
    monthGastoUsd,
    monthIngresoUsd,
    people,
    activePeople,
    debts,
    pendingDebtUsd,
    dueDebtUsd,
    monthRepartidoUsd,
    monthGastoRealUsd,
    settledByTxId,
    recurring,
    activeRecurring,
    recurringSplitsByTemplate,
    plans,
    budgetLines,
    budgetLineCategories,
    budgetPeriods,
    budgetView,
    availableForCategory,
    budgetViewMode,
    setBudgetViewMode,
    hidden,
    toggleHidden,
    refresh: load,
    createAccount,
    updateAccount,
    reorderAccounts,
    deleteOrArchiveAccount,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    setAccountValue,
    createCategory,
    updateCategory,
    seedCategoriesIfEmpty,
    rateRows,
    updateRate,
    setRateMode,
    refreshRatesNow,
    createPerson,
    updatePerson,
    deleteOrArchivePerson,
    createDebt,
    createSharedExpense,
    settleDebts,
    waiveDebt,
    deleteDebt,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    setRecurringSplits,
    registerRecurring,
    createDebtPlan,
    deleteDebtPlan,
    regenerateDebtPlan,
    createBudgetLine,
    updateBudgetLine,
    deleteBudgetLine,
    setBudgetPeriodAmount,
    extendBudget,
    closeBudgetPeriod,
    savingsGoals,
    savingsView,
    savingsByAccount,
    savingsInAccount,
    createSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    saveSavingsForPeriod,
    moveSavings,
    budgetProjects,
    projectsView,
    createProject,
    updateProject,
    deleteOrArchiveProject,
    profiles,
    activeProfileId,
    activeProfile,
    activeAccent,
    switchProfile,
    createProfile,
    updateProfile,
    deleteOrArchiveProfile,
    notifPrefs,
    pushSubscriptions,
    subscribeToPush,
    unsubscribeFromPush,
    updateNotifPrefs,
    quickAdd,
    openQuickAdd,
    closeQuickAdd,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

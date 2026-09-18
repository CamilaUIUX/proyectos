// Tipos compartidos de Finanzas. Sin imports de next/* ni del alias @/ —
// ver la nota de independencia en Documentos/finanzas/sprint-1-movimientos.md §5.1.

export type Currency = 'USD' | 'BOB' | 'USDT' | 'USDC' | 'BTC'
export type RateCurrency = Exclude<Currency, 'USD'>
export type CategoryKind = 'gasto' | 'ingreso'
export type TransactionType = 'gasto' | 'ingreso' | 'transferencia'
/** 'consumo' = gasto/ingreso real; 'movimiento' = plata que cambia de forma
 *  sin serlo (por ahora, solo el cobro de una deuda — sprint-2-deudas.md §3.1).
 *  Los totales del mes solo suman 'consumo'. */
export type FlowType = 'consumo' | 'movimiento'
export type DebtStatus = 'pendiente' | 'cobrada' | 'condonada'
export type RecurringFrequency = 'mensual' | 'anual'
/** Dirección de un movimiento de ahorro (sprint-6-ahorro.md §4.7). Se
 *  declara, nunca se deduce de dónde cae la plata. */
export type SavingsFlow = 'aporte' | 'retiro' | 'traslado'
export type SavingsReason = 'emergencia' | 'meta_cumplida' | 'cambio_planes' | 'otro'
export type SavingsAllocationType = 'fixed' | 'percent'

export const CURRENCIES: Currency[] = ['USD', 'BOB', 'USDT', 'USDC', 'BTC']
export const RATE_CURRENCIES: RateCurrency[] = ['BOB', 'USDT', 'USDC', 'BTC']

/** Cómo se interpreta la tasa guardada en fin_rates para cada moneda (ver
 *  sprint-1-movimientos.md §3.3): no es uniforme a propósito — se guarda tal
 *  como la persona la piensa. 'direction' dice cómo llegar a "USD por unidad". */
export const CURRENCY_META: Record<RateCurrency, { direction: 'per-usd' | 'per-unit'; label: string; decimals: number }> = {
  BOB: { direction: 'per-usd', label: 'Bs por 1 USD', decimals: 2 },
  USDT: { direction: 'per-unit', label: 'USD por 1 USDT', decimals: 4 },
  USDC: { direction: 'per-unit', label: 'USD por 1 USDC', decimals: 4 },
  BTC: { direction: 'per-unit', label: 'USD por 1 BTC', decimals: 2 },
}

/** Decimales para mostrar/editar un monto en esa moneda. BTC necesita 8 para
 *  no perder magnitud (0.00042195); el resto se lee en 2. */
export function decimalsFor(currency: Currency): number {
  return currency === 'BTC' ? 8 : 2
}

/** Postgres serializa las columnas `numeric` como texto (para no perder
 *  precisión con floats de 64 bits) — supabase-js las entrega tal cual,
 *  como string, nunca como `number`, aunque el tipo de esta interfaz diga
 *  `number`. Sin convertir cada fila al leerla, `balance += tx.amount`
 *  concatena texto en vez de sumar ("100.00" + "50.00" → "100.0050.00").
 *  Se aplica una sola vez, en data-context.tsx, justo al recibir cada fila. */
export function toNum(value: number | string | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  BOB: 'Bs',
  USDT: 'USDT',
  USDC: 'USDC',
  BTC: 'BTC',
}

export interface Account {
  id: string
  name: string
  currency: Currency
  initial_balance: number
  initial_balance_date: string
  sort_order: number
  archived: boolean
  /** Sprint 7: una cuenta de inversión graba sus ajustes de valor con
   *  `flow_type: 'movimiento'` — no cuentan como gasto/ingreso real del mes,
   *  pero el saldo sí se mueve (sprint-7-cuentas-inversion.md §4.1). */
  is_investment: boolean
  created_at: string
  updated_at: string
}

/** Cuenta con el saldo ya derivado (§4.1 del sprint 1) — lo que devuelve la API. */
export interface AccountWithBalance extends Account {
  balance: number
  balance_usd: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  icon: string | null
  sort_order: number
  archived: boolean
  created_at: string
}

/** Slug de ícono → nombre del componente de @tabler/icons-react.
 *  Ver Documentos/finanzas/sprint-1-movimientos.md §6.7 (categorías semilla)
 *  y contexto_ui_finanzas.md §15 del repo de referencia (mapa verificado). */
export const CATEGORY_ICON_MAP: Record<string, string> = {
  comida: 'IconToolsKitchen2',
  transporte: 'IconCar',
  vivienda: 'IconHome',
  servicios: 'IconBolt',
  suscripciones: 'IconDeviceMobile',
  salud: 'IconHeartbeat',
  ocio: 'IconMovie',
  otros_gasto: 'IconPackage',
  sueldo: 'IconBriefcase',
  freelance: 'IconDeviceLaptop',
  extraordinario: 'IconGift',
  otros_ingreso: 'IconCoins',
}

/** Categorías semilla (decisión cerrada, sprint-1 §0 / §6.7). */
export const SEED_CATEGORIES: { name: string; kind: CategoryKind; icon: string }[] = [
  { name: 'Comida', kind: 'gasto', icon: 'comida' },
  { name: 'Transporte', kind: 'gasto', icon: 'transporte' },
  { name: 'Vivienda', kind: 'gasto', icon: 'vivienda' },
  { name: 'Servicios', kind: 'gasto', icon: 'servicios' },
  { name: 'Suscripciones', kind: 'gasto', icon: 'suscripciones' },
  { name: 'Salud', kind: 'gasto', icon: 'salud' },
  { name: 'Ocio', kind: 'gasto', icon: 'ocio' },
  { name: 'Otros', kind: 'gasto', icon: 'otros_gasto' },
  { name: 'Sueldo', kind: 'ingreso', icon: 'sueldo' },
  { name: 'Freelance', kind: 'ingreso', icon: 'freelance' },
  { name: 'Extraordinario', kind: 'ingreso', icon: 'extraordinario' },
  { name: 'Otros', kind: 'ingreso', icon: 'otros_ingreso' },
]

export interface Transaction {
  id: string
  type: TransactionType
  date: string
  account_id: string
  to_account_id: string | null
  category_id: string | null
  amount: number
  currency: Currency
  to_amount: number | null
  exchange_rate: number
  amount_usd: number
  /** Solo en transferencias con `to_amount`: la conversión del lado que
   *  LLEGA, congelada a la tasa de su día — igual que `exchange_rate` /
   *  `amount_usd` congelan el lado que sale. Sin esto, el valor histórico en
   *  USD de lo recibido en una transferencia entre monedas es irreconstruible
   *  (no se sabe qué tasa regía ese día), y la comisión efectiva
   *  (`amount_usd − to_amount_usd`) no se puede calcular después. Nullable:
   *  las filas viejas, y toda transferencia misma-moneda sin comisión
   *  declarada, no lo tienen. */
  to_amount_usd: number | null
  to_exchange_rate: number | null
  description: string | null
  flow_type: FlowType
  recurring_id: string | null
  /** Sprint 6: si este movimiento es un aporte/retiro/traslado de ahorro, a
   *  qué plan. `savings_flow` dice la dirección; `savings_reason` va solo en
   *  un retiro; `savings_period` (primer día del mes, 'YYYY-MM-01') va solo en
   *  un aporte y dice a qué mes pertenece — la fecha no alcanza (el aporte de
   *  julio se registra en agosto). Los cuatro viajan juntos
   *  (`fin_tx_savings_shape`, sprint-6-ahorro.md §3.2). */
  savings_goal_id: string | null
  savings_flow: SavingsFlow | null
  savings_reason: SavingsReason | null
  savings_period: string | null
  /** Sprint 10 — a qué proyecto de negocio pertenece, si a alguno
   *  (`fin_budget_projects`). Directo, no por categoría (sprint-10 §0). */
  project_id: string | null
  created_at: string
  updated_at: string
}

export interface Person {
  id: string
  name: string
  sort_order: number
  archived: boolean
  created_at: string
}

export interface Debt {
  id: string
  person_id: string
  concept: string | null
  amount: number
  currency: Currency
  exchange_rate: number
  amount_usd: number
  /** Cuánto de `amount_usd` es recuperar costo real. La ganancia es
   *  `amount_usd − principal_usd` — casi siempre 0, salvo un reparto por
   *  encima de lo pagado (sprint-2-deudas.md). Se reconoce al cobrar. */
  principal_usd: number
  incurred_on: string
  status: DebtStatus
  /** Fecha de condonación (solo si `status === 'condonada'`). */
  waived_on: string | null
  origin_transaction_id: string | null
  settled_transaction_id: string | null
  /** El movimiento de la GANANCIA de un cobro con margen (el reembolso está
   *  en `settled_transaction_id`). Des-saldar borra los dos. */
  settled_margin_transaction_id: string | null
  /** Sprint 4: si esta deuda es una cuota de un plan, a qué plan pertenece
   *  y qué número le toca — un correlativo por plan que nunca se reutiliza,
   *  ni tras regenerar (sprint-4-planes-de-pago.md §3.2). */
  plan_id: string | null
  installment_number: number | null
  created_at: string
  updated_at: string
}

/** Guarda deliberadamente casi nada — solo lo que nunca cambia. Cuántas
 *  cuotas tiene, cuántas están cobradas, la próxima: todo se deriva de las
 *  `Debt` con este `plan_id` (sprint-4-planes-de-pago.md §0/§4.6). */
export interface DebtPlan {
  id: string
  person_id: string
  concept: string
  principal: number
  currency: Currency
  created_at: string
  updated_at: string
}

/** fin_rates, con USD agregado a mano en 1 — nunca tiene fila propia. */
export type RatesMap = Record<Currency, number>

export interface RateRow {
  currency: RateCurrency
  rate: number
  /** true = la app la refresca sola desde una fuente pública (ver
   *  lib/finanzas/quotes.ts); false = la fijó el usuario a mano. */
  auto: boolean
  /** Qué cotización sigue cuando `auto`. `null` = la default de esa moneda.
   *  Ver `QuotePair` en lib/finanzas/quotes.ts. */
  quote_pair: string | null
  updated_at: string
}

export interface Recurring {
  id: string
  name: string
  icon: string | null
  type: TransactionType // solo 'gasto' | 'ingreso' en la práctica — validado en el formulario
  amount: number
  currency: Currency
  account_id: string | null
  category_id: string | null
  frequency: RecurringFrequency
  day_of_month: number
  month_of_year: number | null
  /** Desde qué período aplica el fijo (fecha ISO). Un período que termina
   *  antes de esta fecha no cuenta como pendiente — el servicio todavía no
   *  arrancó. Cargar un fijo con `starts_on` en el pasado sirve para
   *  recuperar los meses que ya pasaron (sprint-3-fijos.md §4.1). */
  starts_on: string
  active: boolean
  note: string | null
  sort_order: number
  /** Sprint 6: si el fijo es un aporte a un ahorro, a qué plan y a qué cuenta
   *  de ahorro entra. Van juntos o ninguno; con ellos, `category_id` es null
   *  (sprint-6-ahorro.md §3.4). `to_account_id` es la última cuenta usada al
   *  registrar — opcional en la plantilla, se pide en cada registro. */
  savings_goal_id: string | null
  to_account_id: string | null
  created_at: string
  updated_at: string
}

/** Reparto por defecto de un fijo compartido. `amount: null` = "parte
 *  pareja", resuelta contra el monto real de cada registro — nunca un
 *  número congelado acá (sprint-3-fijos.md §3.3). */
export interface RecurringSplit {
  id: string
  recurring_id: string
  person_id: string
  amount: number | null
}

/* ─── Presupuesto (Sprint 5) ──────────────────────────────────────────── */

export interface BudgetLine {
  id: string
  /** Alias opcional; si es null el título es la lista de categorías. */
  name: string | null
  input_currency: Currency
  /** Si el gasto anterior al `created_on` cuenta en el período de creación
   *  (§4.1). Inmutable después de crear. */
  retroactive: boolean
  created_on: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BudgetLineCategory {
  id: string
  line_id: string
  category_id: string
}

export interface BudgetPeriod {
  id: string
  line_id: string
  /** Primer día del mes ('YYYY-MM-01'). */
  period: string
  amount: number
  exchange_rate: number
  amount_usd: number
}

export interface BudgetExtension {
  id: string
  period_id: string
  amount: number
  exchange_rate: number
  amount_usd: number
}

export interface BudgetClosure {
  id: string
  line_id: string
  period: string
  /** true = el sobrante/sobregasto se lleva al mes siguiente. */
  carried: boolean
  /** El disponible congelado al responder (puede ser negativo). */
  amount_usd: number
}

/* ─── Ahorro (Sprint 6) ───────────────────────────────────────────────── */

export interface SavingsGoal {
  id: string
  name: string
  input_currency: Currency
  allocation_type: SavingsAllocationType
  /** Monto nativo (`fixed`) o porcentaje 0–100 (`percent`). */
  allocation_value: number
  /** Meta opcional, en `input_currency`. */
  target_amount: number | null
  target_date: string | null
  /** El que se lleva lo que el reparto no asignó, ignorando su propia meta
   *  (§0.4). Como mucho uno activo por usuario. */
  is_catchall: boolean
  sort_order: number
  archived: boolean
  /** Desde qué mes el plan puede organizar sobrantes (§4.5). */
  created_on: string
  created_at: string
  updated_at: string
}

/* ─── Perfiles (Sprint 8) ─────────────────────────────────────────────── */

/** Un cajón financiero aislado del mismo usuario (personal, un proyecto, una
 *  empresa) — sprint-8-perfiles.md. Sin `user_id`: mismo criterio que el
 *  resto de las filas de Finanzas, que tampoco lo exponen — RLS ya garantiza
 *  que solo ves los tuyos. */
export interface FinProfile {
  id: string
  name: string
  /** Clave de paleta, no un hex — ver `AccentKey` en `profiles.ts`. */
  accent: string
  /** Nunca se borra ni se archiva. Recibe todo lo que ya existía antes de
   *  este sprint (§3.8, la migración). */
  is_default: boolean
  archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
  /** Sprint 9 · Notificaciones §3.2 — si este perfil manda avisos. Se
   *  combina con `NotifPrefs` (por tipo, por usuario): un aviso sale solo
   *  si las dos cosas están encendidas. */
  notify: boolean
  /** Sprint 10 — qué pantallas de negocio se muestran (Proyectos, "Fondos
   *  de ahorro" en vez de "Ahorro"). Un campo, no una tabla aparte: la
   *  misma fila de siempre, con un dato más que la UI lee (sprint-10 §4.1). */
  tipo: 'personal' | 'negocio'
  /** Sprint 10 · §4.6 — a qué moneda se convierten los TOTALES agregados de
   *  este perfil al mostrarlos (nunca lo guardado). Independiente de
   *  `tipo`: cualquier perfil puede pedir la suya. */
  display_currency: Currency
}

/* ─── Presupuesto por proyecto (Sprint 10) ───────────────────────────────
 * Solo en perfiles `negocio` (aunque la tabla no lo exige) — sprint-10
 * §3.2. A diferencia de BudgetLine, no tiene mes: el objetivo se congela
 * una vez al crear, y el proyecto vive hasta que se archiva a mano. */
export interface BudgetProject {
  id: string
  name: string
  target_amount: number
  target_currency: Currency
  exchange_rate: number
  target_amount_usd: number
  archived: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Sprint 9 · Notificaciones §3.2 — una fila por usuario, no por perfil. */
export interface NotifPrefs {
  fijos: boolean
  presupuesto: boolean
  ahorro: boolean
  deudas: boolean
  recordar_anotar: boolean
  /** `HH:MM` — así llega de Postgres (`time`), sin segundos que editar. */
  recordar_mediodia: string
  recordar_noche: string
  timezone: string
}

/** Sprint 9 · Notificaciones §3.1 — un dispositivo suscripto. `p256dh`/`auth`
 *  son las claves de la `PushSubscription` del navegador; no hace falta
 *  tipar el objeto completo porque el cliente solo guarda y borra, nunca
 *  las lee de vuelta. */
export interface PushSubscriptionRow {
  id: string
  endpoint: string
  user_agent: string | null
  created_at: string
  last_ok_at: string | null
}

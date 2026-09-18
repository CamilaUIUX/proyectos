// Cotizaciones de mercado para las tasas automáticas (features.md ítem 4 /
// sprint-1-movimientos.md §0.2). Sin imports de next/* — ver §5.1.
//
// La referencia (Acero-Hub) refresca las tasas con un servidor propio. Este
// hub no tiene rutas API — todo pasa por el cliente y RLS — así que el fetch
// se hace acá, desde el navegador, hacia dos APIs públicas con CORS abierto y
// sin API key:
//
//   - bo.dolarapi.com  → Bs por 1 USD, oficial y P2P (Binance)
//   - api.coingecko.com → USD por 1 USDT / USDC / BTC (un solo request)
//
// El valor que devuelve cada par ya está en la MISMA dirección en que
// `fin_rates.rate` guarda esa moneda (Bs/USD para el Bs, USD/unidad para el
// resto), así que no hay que invertir nada. Una fuente caída no tumba al
// resto: cada bloque falla en silencio y se conserva la última tasa buena.

import type { RateCurrency } from './types'

export type QuotePair = 'BOB_USD' | 'BOB_BINANCE' | 'USDT_USD' | 'USDC_USD' | 'BTC_USD'

/** Los pares que admite cada moneda. El primero es el default. Solo el Bs
 *  tiene más de uno (oficial vs. paralelo); el resto no hay nada que elegir. */
export const PAIRS_FOR_CURRENCY: Record<RateCurrency, QuotePair[]> = {
  BOB: ['BOB_USD', 'BOB_BINANCE'],
  USDT: ['USDT_USD'],
  USDC: ['USDC_USD'],
  BTC: ['BTC_USD'],
}

export const PAIR_LABEL: Record<QuotePair, string> = {
  BOB_USD: 'Oficial (BCB)',
  BOB_BINANCE: 'Paralelo (Binance P2P)',
  USDT_USD: 'Tether / USD',
  USDC_USD: 'USD Coin / USD',
  BTC_USD: 'Bitcoin / USD',
}

export function defaultPairFor(currency: RateCurrency): QuotePair {
  return PAIRS_FOR_CURRENCY[currency][0]
}

export function pairAllowedFor(currency: RateCurrency, pair: string): pair is QuotePair {
  return (PAIRS_FOR_CURRENCY[currency] as string[]).includes(pair)
}

export type QuoteMap = Partial<Record<QuotePair, number>>

const TIMEOUT_MS = 4000

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // Timeout, red caída, CORS, JSON inválido — da igual: se sigue con la
    // última cotización buena. Preferible una tasa de ayer a no poder
    // registrar un gasto.
    return null
  } finally {
    clearTimeout(timer)
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Trae todas las cotizaciones que respondan. Nunca lanza. */
export async function fetchQuotes(): Promise<QuoteMap> {
  const [bo, cg] = await Promise.all([
    getJson('https://bo.dolarapi.com/v1/dolares'),
    getJson('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin,bitcoin&vs_currencies=usd'),
  ])

  const out: QuoteMap = {}

  if (Array.isArray(bo)) {
    for (const row of bo as { casa?: string; venta?: unknown; compra?: unknown }[]) {
      // `venta` es lo que te cuesta comprar 1 USD — la cara que importa para
      // valuar plata en Bs. Si no viene, se cae a `compra`.
      const rate = num(row?.venta) ?? num(row?.compra)
      if (!rate) continue
      if (row.casa === 'oficial') out.BOB_USD = rate
      if (row.casa === 'binance') out.BOB_BINANCE = rate
    }
  }

  if (cg && typeof cg === 'object') {
    const c = cg as Record<string, { usd?: unknown }>
    const t = num(c.tether?.usd)
    const u = num(c['usd-coin']?.usd)
    const b = num(c.bitcoin?.usd)
    if (t) out.USDT_USD = t
    if (u) out.USDC_USD = u
    if (b) out.BTC_USD = b
  }

  return out
}

/** Cuántos ms puede tener una tasa automática antes de refrescarla al abrir
 *  la app. Más generoso que los 30 min de la referencia porque acá no hay un
 *  cron de respaldo — pero corto para que la tasa esté fresca cuando importa. */
export const RATE_TTL_MS = 6 * 60 * 60 * 1000

export function isStale(updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return true
  const t = Date.parse(updatedAt)
  return !Number.isFinite(t) || now - t > RATE_TTL_MS
}

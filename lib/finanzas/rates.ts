// Resuelve la tasa efectiva de cada moneda. Sin imports de next/* — ver
// Documentos/finanzas/sprint-1-movimientos.md §5.1.

import { CURRENCY_META, type Currency, type RateCurrency, type RateRow, type RatesMap } from './types'

/** Valores de referencia cuando todavía no hay fila en fin_rates para esa
 *  moneda (recién sembrada, o el usuario no la tocó). No son "la verdad",
 *  son un punto de partida razonable — se editan en Ajustes el primer día. */
export const FALLBACK_RATES: Record<RateCurrency, number> = {
  BOB: 6.96,
  USDT: 1,
  USDC: 1,
  BTC: 65000,
}

/** Arma el mapa completo (USD incluido, siempre 1) a partir de las filas
 *  que existan en fin_rates. Lo que falte cae al fallback. */
export function buildRatesMap(rows: Pick<RateRow, 'currency' | 'rate'>[]): RatesMap {
  const map = { USD: 1, ...FALLBACK_RATES } as RatesMap
  for (const row of rows) {
    map[row.currency] = row.rate
  }
  return map
}

/** Cuántos USD vale 1 unidad de `currency`, resolviendo la dirección con la
 *  que se guarda cada tasa (sprint-1-movimientos.md §3.3 / §4.2).
 *
 *  Guard contra una tasa faltante/inválida: `buildRatesMap` siempre siembra
 *  las 4 monedas y la base tiene `check (rate > 0)`, pero si por lo que sea
 *  `rates[currency]` llega `undefined`/`0`/`NaN`, sin este chequeo el
 *  resultado es `NaN`/`Infinity` y contamina en silencio `amount_usd`, el
 *  patrimonio y el tope de saldo. Se cae al fallback, igual que la
 *  referencia (lib/finanzas/money.ts → usdPerUnit). */
export function usdPerUnit(currency: Currency, rates: RatesMap): number {
  if (currency === 'USD') return 1
  const rc = currency as RateCurrency
  const meta = CURRENCY_META[rc]
  const raw = rates[currency]
  const rate = Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_RATES[rc]
  return meta.direction === 'per-usd' ? 1 / rate : rate
}

export function toUsd(amount: number, currency: Currency, rates: RatesMap): number {
  return amount * usdPerUnit(currency, rates)
}

/** El inverso de `toUsd` — sprint-10-perfiles-de-negocio.md §4.6. Convierte
 *  un total YA agregado en USD a la moneda de visualización de un perfil,
 *  con la tasa de HOY. Es capa de visualización, no un movimiento: no
 *  congela nada, no reescribe ningún `amount_usd` guardado. */
export function fromUsd(usdAmount: number, currency: Currency, rates: RatesMap): number {
  return usdAmount / usdPerUnit(currency, rates)
}

// Formateo y parseo de montos. Sin imports de next/* — ver la nota de
// independencia en Documentos/finanzas/sprint-1-movimientos.md §5.1.

import { CURRENCY_SYMBOL, decimalsFor, type Currency } from './types'

/** El signo menos tipográfico (U+2212), no un guion — contexto_ui_finanzas.md §5. */
const MINUS = '−'

/** Redondea a `d` decimales sin el artefacto clásico de la multiplicación
 *  binaria (`35.855 * 100` da `3584.9999999999995`, no `3585`). El truco de
 *  sumar `Number.EPSILON` — que tenía esta función antes — solo corrige el
 *  error cerca de magnitud 1; a partir de ahí `EPSILON` es más chico que la
 *  precisión real del double en ese rango y no hace nada. Confirmado con
 *  Node en la revisión de código del Sprint 2: `roundFor(35.855, 2)` daba
 *  `35.85` en vez de `35.86`, silenciosamente.
 *
 *  La forma robusta es redondear sobre la representación DECIMAL, no la
 *  binaria — pasar por `toFixed` (que Node/V8 sí redondea bien para
 *  magnitudes normales) antes del corrimiento de exponente evita además
 *  que un monto muy chico en BTC (8 decimales, ej. `0.00000001`) rompa el
 *  truco: JS convierte esos números a notación exponencial como string
 *  ("1e-8"), y concatenar "e8" ahí da un número inválido. `toFixed` fuerza
 *  una forma decimal plana antes de tocar el string. */
function roundToDecimals(value: number, d: number): number {
  if (!Number.isFinite(value)) return value
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  const fixedStr = abs.toFixed(Math.min(d + 2, 100)) // 2 dígitos de guarda
  const rounded = Number(`${Math.round(Number(`${fixedStr}e${d}`))}e-${d}`)
  return sign * rounded
}

/** Redondea a los decimales que le corresponden a esa moneda (2, salvo BTC en 8). */
export function roundFor(value: number, currency: Currency): number {
  return roundToDecimals(value, decimalsFor(currency))
}

export function round2(value: number): number {
  return roundToDecimals(value, 2)
}

/** Acepta coma o punto como separador decimal y normaliza a punto.
 *  Bug real documentado en el proyecto de referencia: sin esto, tipear "5,03"
 *  en un teclado boliviano guarda "503" — un error de 100x sin ningún síntoma.
 *
 *  También tiene que soportar separador de MILES, porque `formatMoney` (más
 *  abajo) muestra montos como "1,299.00" — si alguien copia ese texto de
 *  vuelta a un campo, la versión ingenua de este parseo (reemplazar la
 *  primera coma no más) lo convertía en "1.299.00" y `Number(...)` daba
 *  `NaN`. Bug real encontrado en la revisión del Sprint 1.
 *
 *  Regla: si aparecen los dos separadores, el que está más a la derecha es
 *  el decimal y el otro es de miles (se descarta). Si aparece solo uno de
 *  los dos y tiene más de 2 dígitos después, se asume de miles ("1,299" →
 *  1299) — con 2 o menos, se asume decimal ("5,03" → 5.03), que es el caso
 *  real que motivó esta función. */
export function parseDecimalInput(raw: string): number | null {
  let cleaned = raw.trim().replace(/\s/g, '')
  if (cleaned === '' || cleaned === '.' || cleaned === ',' || cleaned === '-') return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    cleaned =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.') // "1.299,00" → coma decimal
        : cleaned.replace(/,/g, '') // "1,299.00" → punto decimal, coma de miles
  } else if (lastComma !== -1) {
    const digitsAfter = cleaned.length - lastComma - 1
    cleaned = digitsAfter <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  }
  // A propósito, un punto SOLO nunca se trata como separador de miles, ni
  // siquiera con 3+ dígitos después ("1.500") — a diferencia de la coma
  // sola de arriba. Se evaluó agregar el mismo criterio simétrico en la
  // revisión del Sprint 4 (encontrado por una de las pasadas del review) y
  // se descartó: sin la moneda a mano en esta función, ese mismo umbral
  // rompe cualquier monto en BTC con más de 2 decimales legítimos — probado
  // a mano, "0.00042195" (una fracción de BTC perfectamente real) pasaría a
  // interpretarse como 42195, un error de sobra peor que el caso que se
  // quería tapar. La coma sí puede usar ese atajo porque su único motivo de
  // ser es el teclado boliviano (que fuerza una coma sin querer) — no hay
  // un motivo real equivalente para el punto en esta app, donde el punto ES
  // el separador decimal por defecto (mismo formato que `formatMoney`).

  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** $1,299.00 · Bs 300.00 · USDT 1,354.29 · BTC 0.00042195 */
export function formatMoney(amount: number, currency: Currency, opts: { signed?: boolean } = {}): string {
  const d = decimalsFor(currency)
  const abs = Math.abs(amount)
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const symbol = CURRENCY_SYMBOL[currency]
  const withSymbol = currency === 'USD' ? `${symbol}${body}` : `${symbol} ${body}`

  if (!opts.signed) return withSymbol
  if (amount > 0) return `+${withSymbol}`
  if (amount < 0) return `${MINUS}${withSymbol}`
  return withSymbol
}

/** •••• para cuando el usuario oculta los montos. */
export const HIDDEN_AMOUNT = '••••'

/** Único lugar que decide "mostrar u ocultar" un monto ya formateado —
 *  antes cada pantalla (Home, Movimientos, Deudas) definía su propio
 *  `show()` idéntico por separado; si la regla cambiaba (ej. ocultar
 *  también en `0`, u otro placeholder según el contexto) había que
 *  tocarlas una por una y era fácil olvidarse alguna. Aplica solo a
 *  texto de SOLO LECTURA (una fila, un total) — nunca a un campo editable
 *  (quick-add, settle-sheet, etc.): esos ya son una decisión activa del
 *  usuario de mirar el número para actuar sobre él, no un vistazo pasivo
 *  que el toggle de privacidad busca tapar. */
export function maskAmount(text: string, hidden: boolean): string {
  return hidden ? HIDDEN_AMOUNT : text
}

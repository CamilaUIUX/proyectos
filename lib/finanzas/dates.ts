// Claves de fecha locales (YYYY-MM-DD / YYYY-MM). Una sola vez acá — la
// revisión del Sprint 1 encontró la misma función copiada a mano en
// quick-add.tsx, cuentas/page.tsx, movimientos/page.tsx y data-context.tsx,
// con riesgo de que una corrección futura (huso horario, DST) se aplique a
// una copia y no a las otras. Sin imports de next/* — ver §5.1 del sprint 1.

/** Hoy, en la fecha LOCAL del navegador — no `toISOString()`, que corre a
 *  UTC y puede caer en el día equivocado cerca de la medianoche. */
export function todayISO(): string {
  return localDateKey(new Date())
}

export function localDateKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** "YYYY-MM" del mes en curso (o de la fecha que se pase), en hora local. */
export function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha ISO que además EXISTE en el calendario. El regex solo mira la forma,
 *  así que `2026-02-30` y `2026-13-45` pasaban y llegaban hasta Postgres (que
 *  las rechaza con su mensaje crudo) — o peor, en el Sprint 4, alimentaban la
 *  aritmética de cuotas contando desde un día que nunca existió. La ida y
 *  vuelta por `Date` en UTC normaliza el 30 de febrero al 2 de marzo, y ahí
 *  deja de coincidir con lo que entró. Copiado de la referencia
 *  (lib/finanzas/transactions.ts → isValidDate). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const dt = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === value
}

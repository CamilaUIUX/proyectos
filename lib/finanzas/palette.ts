// Paleta categórica para gráficos de la Home (patrimonio por cuenta, gasto
// por categoría) — 7 tonos con contraste y separación CVD validados sobre
// superficie clara. Se deja afuera el rojo del set de 8: ya es --fz-out
// (guindo), el color que significa "gasto" en el resto de la app, y
// confundiría la semántica de dinero con la identidad de una categoría.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'] as const

/** Gris fijo para "Otras" (lo que no entra en el cupo de colores). Nunca un
 *  8vo tono generado: una hue nueva no pasa los chequeos de CVD de la
 *  paleta de arriba, y esta categoría no es una identidad real. */
export const OTHER_COLOR = '#9CA3AF'

/** Color estable para el índice N de una lista YA ordenada por su propio
 *  sort_order — el mismo índice siempre da el mismo color, sin importar en
 *  qué orden se MUESTRE después (nunca se asigna por el ranking del mes,
 *  que cambia de un período a otro). */
export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length]
}

// Perfiles — sprint-8-perfiles.md. Sin imports de next/* ni del alias @/ — ver
// la nota de independencia en sprint-1-movimientos.md §5.1.
//
// El aislamiento ENTRE perfiles es de aplicación, no de RLS (§3.5 del sprint):
// data-context.tsx filtra cada lectura por `profile_id` y estampa
// `profile_id` en cada escritura. Lo que vive acá es la lógica pura de esa
// decisión — a qué perfil cae el request, qué acento le toca a uno nuevo — sin
// tocar la red.

import type { FinProfile } from './types'

/** Las 5 paletas que puede tener un perfil. El azul queda afuera a propósito
 *  — es el color de Ahorro (sprint-6-ahorro.md §0), y un perfil con acento
 *  azul recrearía esa confusión adentro de ese perfil. */
export type AccentKey = 'verde' | 'naranja' | 'violeta' | 'magenta' | 'teal'
export const ACCENT_KEYS: AccentKey[] = ['verde', 'naranja', 'violeta', 'magenta', 'teal']

export const ACCENT_LABEL: Record<AccentKey, string> = {
  verde: 'Verde',
  naranja: 'Naranja',
  violeta: 'Violeta',
  magenta: 'Magenta',
  teal: 'Teal',
}

/** Mismos hex que `--fz-accent` por clave en theme.css — duplicados a
 *  propósito: este mapa es solo para pintar el swatch del selector de
 *  acento (un `<button>` suelto, sin `#fz-root[data-accent]` alrededor para
 *  heredar la variable), no para theming real. */
export const ACCENT_HEX: Record<AccentKey, string> = {
  verde: '#16613C',
  naranja: '#C2410C',
  violeta: '#6D28D9',
  magenta: '#9D174D',
  teal: '#0F766E',
}

/** ¿Cuál de los perfiles del usuario queda activo? Igual que
 *  `resolveProfile` de la referencia, pero resuelto en el cliente porque acá
 *  no hay request/servidor: un `preferredId` inválido (de otro usuario,
 *  archivado, o borrado desde otro dispositivo) no es un error — cae al
 *  default en silencio (§4.1). `null` solo cuando el usuario no tiene NINGÚN
 *  perfil todavía — ahí es cuando `data-context.tsx` crea el default. */
export function resolveActiveProfileId(profiles: FinProfile[], preferredId: string | null): string | null {
  if (preferredId) {
    const found = profiles.find(p => p.id === preferredId && !p.archived)
    if (found) return found.id
  }
  const def = profiles.find(p => p.is_default)
  if (def) return def.id
  const firstActive = profiles.find(p => !p.archived)
  return firstActive?.id ?? profiles[0]?.id ?? null
}

/** El acento que le toca a un perfil nuevo: el que menos perfiles activos ya
 *  usan (empate → el primero de `ACCENT_KEYS`). Nunca depende de CUÁNTOS
 *  perfiles hay, solo de cuáles colores ya están tomados — así que del sexto
 *  perfil en adelante las paletas se reciclan sin bloquear la creación
 *  (sprint-8 §4.10). El acento en sí se guarda en la fila; esta función solo
 *  decide el default al crear, nunca recolorea uno ya existente. */
export function nextAccentFor(profiles: FinProfile[]): AccentKey {
  const counts = new Map<AccentKey, number>(ACCENT_KEYS.map(k => [k, 0]))
  for (const p of profiles) {
    if (p.archived) continue
    const key = p.accent as AccentKey
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: AccentKey = ACCENT_KEYS[0]
  let bestCount = Infinity
  for (const key of ACCENT_KEYS) {
    const c = counts.get(key) ?? 0
    if (c < bestCount) {
      best = key
      bestCount = c
    }
  }
  return best
}

/** El nombre para el perfil default de un usuario nuevo, sin ningún dato
 *  todavía (§4.7): el prefijo del email — este hub no guarda un nombre real
 *  en ningún lado (`public.profiles` solo tiene `email`/`role`). Si por lo
 *  que sea no hay email, el último fallback es literal. */
export function defaultProfileName(email: string | null | undefined): string {
  const prefix = email?.split('@')[0]?.trim()
  return prefix || 'Personal'
}

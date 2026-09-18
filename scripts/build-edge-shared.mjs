// Copia lib/finanzas/*.ts a supabase/functions/_shared/finanzas/, reescribiendo
// los imports para que Deno los pueda resolver — dos ajustes mecánicos, nada
// de lógica (sprint-9-notificaciones.md §0.2):
//   - `from './x'`                              → `from './x.ts'` (Deno exige extensión)
//   - `import type { SupabaseClient } from ...`  → `https://esm.sh/@supabase/supabase-js@2`
//
// Uso: node scripts/build-edge-shared.mjs
//
// ⚠️ Correr esto A MANO antes de cada `supabase functions deploy
// finanzas-notificaciones` que venga después de tocar `lib/finanzas/`. Este
// hub no tiene la suite de tests que en la referencia fallaba si el bridge
// quedaba desactualizado (sprint-9 §0) — sin esa red, olvidarse de correrlo
// deja a la Edge Function evaluando con una copia vieja de la lógica, que
// puede decir algo distinto de lo que la app ya muestra en pantalla.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'lib', 'finanzas')
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'finanzas')

function rewrite(source) {
  return source
    .replace(/from '(\.\.?\/[^']*?)'/g, (match, path) => (path.endsWith('.ts') ? match : `from '${path}.ts'`))
    .replace(/import\s+type\s*\{\s*SupabaseClient\s*\}\s*from\s*'@supabase\/supabase-js'/g, "import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'")
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const files = (await readdir(SRC)).filter(f => f.endsWith('.ts'))
  for (const file of files) {
    const raw = await readFile(join(SRC, file), 'utf8')
    await writeFile(join(OUT, file), rewrite(raw), 'utf8')
  }

  console.log(`✓ ${files.length} archivos copiados de lib/finanzas/ a supabase/functions/_shared/finanzas/`)
  console.log('  Recordá correr esto antes de cada deploy que toque lib/finanzas/.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

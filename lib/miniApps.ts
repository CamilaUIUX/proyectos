export interface MiniApp {
  name: string
  slug: string
  description: string
}

// Agregar una mini-app nueva: sumarla acá. Aparece en el Hub (para quien
// tenga acceso) y como columna nueva en el panel de administración
// (/admin), donde un admin le da acceso a quien la necesite — por defecto
// nadie la tiene, salvo 'daily' al registrarse (ver supabase/schema.sql).
export const MINI_APPS: MiniApp[] = [
  { name: 'Daily', slug: 'daily', description: 'Genera tu reporte de actividad diaria' },
]

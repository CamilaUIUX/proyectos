import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** False until the two keys are filled into .env.local (and into Vercel for production). */
export const supabaseConfigured = Boolean(url && anonKey)

// Deliberately null instead of throwing when the keys are missing: the app has to keep
// building and rendering so it can show a "falta configurar las claves" screen rather
// than a blank page.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null

export type UserRole = 'member' | 'admin'

export interface Profile {
  id: string
  email: string | null
  role: UserRole
}

/** Shape stored in daily_reports.data — enough to reopen a past day exactly as it was. */
export interface ReportData {
  edits: { id: string; name: string }[]
  muCreated: { id: string; name: string }[]
  checkingComponents: { id: string; name: string }[]
  artworkUploaded: { id: string; name: string }[]
  tomorrowBullets: { id: string; text: string }[]
  blockerBullets: { id: string; text: string }[]
}

export interface DailyReportRow {
  id: string
  user_id: string
  report_date: string
  content: string
  data: ReportData | null
  updated_at: string
  profiles?: { email: string | null } | null
}

/** Local YYYY-MM-DD. Not toISOString(), which shifts to UTC and can land on the wrong day. */
export function localDateKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

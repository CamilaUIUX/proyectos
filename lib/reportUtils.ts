import type { ReportData } from './supabaseClient'

export type Category = 'EDIT' | 'MU_CREATED' | 'CHECKING_COMPONENTS' | 'ARTWORK_UPLOADED'

export const CATEGORY_META: Record<Category, { label: string; abbr: string }> = {
  EDIT:                 { label: 'Edits',                     abbr: 'E' },
  MU_CREATED:           { label: 'MockUp Created',            abbr: 'M' },
  CHECKING_COMPONENTS:  { label: 'Checking Component Codes',  abbr: 'C' },
  ARTWORK_UPLOADED:     { label: 'Artwork Output and Upload', abbr: 'A' },
}

/** Maps a ReportData field onto the category it represents. */
const DATA_FIELD_BY_CATEGORY: Record<Category, keyof ReportData> = {
  EDIT: 'edits',
  MU_CREATED: 'muCreated',
  CHECKING_COMPONENTS: 'checkingComponents',
  ARTWORK_UPLOADED: 'artworkUploaded',
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 'YYYY-MM-DD' -> '27, July, 2026'. Splits the string instead of using Date,
 *  which would read it as UTC midnight and drift a day in negative timezones. */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${d}, ${MONTHS[Number(m) - 1] ?? m}, ${y}`
}

/** Client code at the start of a file name: everything before the first
 *  '_', '-' or space. 'SOUWI_1026_Blessings_128_M.pdf' -> 'SOUWI'. */
export function clientPrefix(fileName: string): string {
  const match = fileName.trim().match(/^[^_\-\s]+/)
  return match ? match[0].toUpperCase() : 'SIN CLIENTE'
}

/** Monday of the week containing `d`, as 'YYYY-MM-DD'. getDay() is 0=Sunday,
 *  so Sunday counts as the *end* of the week, not the start of a new one. */
export function weekStartKey(d: Date = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysSinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Shifts a 'YYYY-MM-DD' key by n days, staying in local time. */
export function addDaysToKey(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** The last N Mondays, newest first — used to populate the week picker. */
export function recentWeekStarts(count = 12, from: Date = new Date()): string[] {
  const current = weekStartKey(from)
  return Array.from({ length: count }, (_, i) => addDaysToKey(current, -7 * i))
}

export interface DailyRowForWeek {
  report_date: string
  data: ReportData | null
}

/**
 * Builds the weekly report text out of that week's dailies: every file worked on,
 * grouped by client, with the kind of work at the end of each line. The same file
 * touched twice under the same category is listed once.
 */
export function buildWeeklyReport(rows: DailyRowForWeek[], weekStart: string): string {
  const byClient = new Map<string, { name: string; label: string }[]>()
  const seen = new Set<string>()

  for (const row of rows) {
    if (!row.data) continue
    for (const cat of Object.keys(CATEGORY_META) as Category[]) {
      const files = row.data[DATA_FIELD_BY_CATEGORY[cat]]
      if (!Array.isArray(files)) continue
      for (const file of files as { name: string }[]) {
        if (!file?.name) continue
        const label = CATEGORY_META[cat].label
        const key = `${file.name}||${label}`
        if (seen.has(key)) continue
        seen.add(key)
        const client = clientPrefix(file.name)
        if (!byClient.has(client)) byClient.set(client, [])
        byClient.get(client)!.push({ name: file.name, label })
      }
    }
  }

  const lines: string[] = []
  lines.push('What I Did This Week:')
  lines.push(`(${formatDateKey(weekStart)} - ${formatDateKey(addDaysToKey(weekStart, 6))})`)
  lines.push('')

  if (byClient.size === 0) {
    lines.push('No files logged this week.')
    return lines.join('\n')
  }

  for (const client of [...byClient.keys()].sort()) {
    lines.push(client)
    const files = byClient.get(client)!.sort((a, b) => a.name.localeCompare(b.name))
    for (const f of files) lines.push(`\t• ${f.name} — ${f.label}`)
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

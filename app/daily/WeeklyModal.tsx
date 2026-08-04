'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, type ReportData } from '@/lib/supabaseClient'
import {
  buildWeeklyReport, formatDateKey, addDaysToKey, recentWeekStarts,
  type DailyRowForWeek,
} from '@/lib/reportUtils'
import { useAuth } from '@/app/components/AuthGate'

export default function WeeklyModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const weeks = recentWeekStarts(12)
  const [weekStart, setWeekStart] = useState(weeks[0])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedContent, setSavedContent] = useState<string | null>(null)

  /** Rebuilds the text from that week's dailies, ignoring anything saved. */
  const regenerate = useCallback(async (week: string): Promise<string> => {
    if (!supabase) return ''
    const { data, error } = await supabase
      .from('daily_reports')
      .select('report_date, data')
      .eq('user_id', user.id)
      .gte('report_date', week)
      .lte('report_date', addDaysToKey(week, 6))
      .order('report_date', { ascending: true })
    if (error) throw new Error(error.message)
    return buildWeeklyReport((data ?? []) as unknown as DailyRowForWeek[], week)
  }, [user.id])

  // A saved weekly wins over a freshly generated one: once edited by hand, that text is
  // the report. Regenerating is an explicit action.
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    // Switching weeks must clear the previous week's text and status before the new fetch
    // resolves, otherwise the old report stays on screen looking like the new one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    setSaveState('idle')

    const load = async () => {
      const { data: saved, error: savedErr } = await supabase!
        .from('weekly_reports')
        .select('content')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle()
      if (savedErr) throw new Error(savedErr.message)
      if (saved?.content) {
        setSavedContent(saved.content)
        return saved.content
      }
      setSavedContent(null)
      return await regenerate(weekStart)
    }

    load()
      .then(result => { if (!cancelled) { setText(result); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })

    return () => { cancelled = true }
  }, [weekStart, user.id, regenerate])

  const handleSave = async () => {
    if (!supabase) return
    setSaveState('saving')
    const { error } = await supabase.from('weekly_reports').upsert(
      { user_id: user.id, week_start: weekStart, content: text },
      { onConflict: 'user_id,week_start' }
    )
    if (error) {
      setSaveState('error')
      console.error('No se pudo guardar el semanal:', error.message)
    } else {
      setSavedContent(text)
      setSaveState('saved')
    }
  }

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      setText(await regenerate(weekStart))
      setSaveState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const dirty = savedContent === null ? text.trim().length > 0 : text !== savedContent

  return (
    <div className="daily-overlay ed-overlay fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal ed-dialog w-full max-w-2xl h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 shrink-0 px-6 py-4 border-b border-[var(--line)]">
          <h2 className="text-xl font-medium tracking-[-0.02em]">Semanal</h2>
          <button onClick={onClose} className="ed-btn ed-btn--quiet">Cerrar</button>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap px-6 py-3 border-b border-[var(--line)]">
          <span className="ed-label">Semana del</span>
          <select
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="ed-select"
          >
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {formatDateKey(w)}{i === 0 ? ' (esta semana)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleRegenerate}
            title="Vuelve a construirlo desde los dailys de esa semana, descartando lo editado a mano"
            className="ed-btn ed-btn--quiet ml-auto"
          >
            Regenerar
          </button>
        </div>

        {error && <p className="text-xs px-6 py-3 text-[var(--ink)]">{error}</p>}

        {loading ? (
          <p className="ed-label px-6 py-4">Cargando</p>
        ) : (
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setSaveState('idle') }}
            spellCheck={false}
            className="flex-1 min-h-0 !border-0 !rounded-none ed-textarea text-[12px] p-6 whitespace-pre"
          />
        )}

        <div className="flex items-center gap-4 shrink-0 px-6 py-4 border-t border-[var(--line)]">
          <button
            onClick={handleSave}
            disabled={loading || saveState === 'saving'}
            className="ed-btn ed-btn--solid"
          >
            {saveState === 'saving' ? 'Guardando' : 'Guardar'}
          </button>
          <span className="ed-label">
            {saveState === 'saved' && !dirty && 'Guardado'}
            {saveState === 'error' && 'No se pudo guardar'}
            {saveState !== 'saving' && dirty && 'Sin guardar'}
          </span>
        </div>
      </div>
    </div>
  )
}

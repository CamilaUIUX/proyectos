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
    <div className="daily-overlay fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal pixel-frame bg-black border border-white w-full max-w-2xl h-[85vh] flex flex-col gap-3 p-4"
        onClick={e => e.stopPropagation()}
      >
        <span className="corner-tl" />
        <span className="corner-tr" />

        <div className="flex items-center justify-between gap-4 shrink-0">
          <h2 className="text-base font-bold text-white uppercase">Semanal</h2>
          <button onClick={onClose} className="text-[11px] uppercase text-gray-600 hover:bg-gray-600 hover:text-black border border-gray-600 px-2 py-1 cursor-pointer">
            Cerrar
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className="text-[10px] uppercase text-gray-600">Semana del:</span>
          <select
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className="bg-black border border-white text-white text-[11px] px-2 py-1 outline-none cursor-pointer"
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
            className="text-[10px] uppercase text-gray-600 hover:bg-gray-600 hover:text-black border border-gray-600 px-2 py-1 cursor-pointer"
          >
            Regenerar
          </button>
        </div>

        {error && <p className="text-xs text-white border border-white px-3 py-2">{error}</p>}

        {loading ? (
          <p className="text-xs uppercase text-gray-600">Cargando...</p>
        ) : (
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setSaveState('idle') }}
            spellCheck={false}
            className="flex-1 min-h-0 border border-gray-600 p-3 text-[11px] text-white bg-black font-mono whitespace-pre leading-relaxed resize-none outline-none focus:border-white"
          />
        )}

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleSave}
            disabled={loading || saveState === 'saving'}
            className="pixel-btn px-3 py-1.5 text-[11px] font-bold uppercase cursor-pointer disabled:dither"
          >
            {saveState === 'saving' ? 'Guardando...' : 'Guardar'}
          </button>
          <span className="text-[10px] uppercase text-gray-600">
            {saveState === 'saved' && !dirty && 'Guardado'}
            {saveState === 'error' && 'No se pudo guardar'}
            {saveState !== 'saving' && dirty && 'Sin guardar'}
          </span>
        </div>
      </div>
    </div>
  )
}

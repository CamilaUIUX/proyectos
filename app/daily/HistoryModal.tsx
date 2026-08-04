'use client'

import { useEffect, useState } from 'react'
import { supabase, type DailyReportRow } from '@/lib/supabaseClient'
import { formatDateKey } from '@/lib/reportUtils'
import { useAuthedUser } from '@/app/components/AuthProvider'

export default function HistoryModal({ onClose }: { onClose: () => void }) {
  const { isAdmin, user } = useAuthedUser()
  const [rows, setRows] = useState<DailyReportRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase
      .from('daily_reports')
      .select('id, user_id, report_date, content, data, updated_at, profiles(email)')
      .order('report_date', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setRows((data ?? []) as unknown as DailyReportRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const selected = rows.find(r => r.id === selectedId) ?? null
  // Only your own reports are editable — RLS would reject the write anyway, so don't offer it.
  const canEdit = selected?.user_id === user.id

  const openReport = (row: DailyReportRow) => {
    setSelectedId(row.id)
    setDraft(row.content)
    setSaveState('idle')
  }

  const handleSave = async () => {
    if (!supabase || !selected || !canEdit) return
    setSaveState('saving')
    const { error } = await supabase
      .from('daily_reports')
      .update({ content: draft })
      .eq('id', selected.id)
    if (error) {
      setSaveState('error')
      console.error('No se pudo guardar el cambio:', error.message)
    } else {
      setRows(prev => prev.map(r => r.id === selected.id ? { ...r, content: draft } : r))
      setSaveState('saved')
    }
  }

  // Only admins ever receive other people's rows, so this list is empty for everyone else.
  const people = Array.from(
    new Set(rows.filter(r => r.user_id !== user.id).map(r => r.profiles?.email ?? r.user_id))
  )

  const visible = personFilter === 'all'
    ? rows
    : personFilter === 'mine'
      ? rows.filter(r => r.user_id === user.id)
      : rows.filter(r => (r.profiles?.email ?? r.user_id) === personFilter)

  const dirty = selected != null && draft !== selected.content

  return (
    <div className="daily-overlay ed-overlay fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal ed-dialog w-full max-w-4xl h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 shrink-0 px-6 py-4 border-b border-[var(--line)]">
          <div className="flex items-baseline gap-4">
            <h2 className="text-xl font-medium tracking-[-0.02em]">Historial</h2>
            <span className="ed-label tabular-nums">{String(visible.length).padStart(2, '0')} registros</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && people.length > 0 && (
              <select
                value={personFilter}
                onChange={e => { setPersonFilter(e.target.value); setSelectedId(null) }}
                className="ed-select"
              >
                <option value="all">Todos</option>
                <option value="mine">Solo los míos</option>
                {people.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <button onClick={onClose} className="ed-btn ed-btn--quiet">Cerrar</button>
          </div>
        </div>

        {loading && <p className="ed-label px-6 py-4">Cargando</p>}
        {error && <p className="text-xs px-6 py-4 text-[var(--ink)]">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="text-sm text-[var(--ink-2)] px-6 py-6 leading-relaxed">
            Todavía no hay reportes guardados. Se guardan solos a medida que trabajas.
          </p>
        )}

        {visible.length > 0 && (
          <div className="flex-1 min-h-0 grid sm:grid-cols-[minmax(0,15rem)_1fr]">
            <div className="overflow-y-auto border-r border-[var(--line)] flex flex-col">
              {visible.map(r => {
                const isSel = selectedId === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => openReport(r)}
                    className={`text-left px-5 py-3 border-b border-[var(--line)] cursor-pointer transition-colors duration-150 ${
                      isSel ? 'bg-[var(--accent)]' : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <span className="block text-[13px] tabular-nums">{formatDateKey(r.report_date)}</span>
                    {isAdmin && r.user_id !== user.id && (
                      <span className="block ed-label mt-1 truncate">{r.profiles?.email ?? r.user_id}</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="min-h-0 flex flex-col">
              {selected ? (
                <>
                  <textarea
                    value={draft}
                    onChange={e => { setDraft(e.target.value); setSaveState('idle') }}
                    readOnly={!canEdit}
                    spellCheck={false}
                    className={`flex-1 min-h-0 !border-0 !rounded-none ed-textarea text-[12px] p-6 whitespace-pre ${
                      canEdit ? '' : 'text-[var(--ink-2)] cursor-not-allowed'
                    }`}
                  />
                  <div className="flex items-center gap-4 shrink-0 px-6 py-4 border-t border-[var(--line)]">
                    {canEdit ? (
                      <>
                        <button
                          onClick={handleSave}
                          disabled={!dirty || saveState === 'saving'}
                          className="ed-btn ed-btn--solid"
                        >
                          {saveState === 'saving' ? 'Guardando' : 'Guardar cambios'}
                        </button>
                        <span className="ed-label">
                          {saveState === 'saved' && !dirty && 'Guardado'}
                          {saveState === 'error' && 'No se pudo guardar'}
                          {dirty && saveState !== 'saving' && 'Sin guardar'}
                        </span>
                      </>
                    ) : (
                      <span className="ed-chip ed-chip--muted">Reporte de otra persona · solo lectura</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="ed-label p-6">Elige una fecha</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

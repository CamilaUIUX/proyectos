'use client'

import { useEffect, useState } from 'react'
import { supabase, type DailyReportRow } from '@/lib/supabaseClient'
import { formatDateKey } from '@/lib/reportUtils'
import { useAuth } from '@/app/components/AuthGate'

export default function HistoryModal({ onClose }: { onClose: () => void }) {
  const { isAdmin, user } = useAuth()
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
    <div className="daily-overlay fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal pixel-frame bg-black border border-white w-full max-w-3xl h-[85vh] flex flex-col gap-3 p-4"
        onClick={e => e.stopPropagation()}
      >
        <span className="corner-tl" />
        <span className="corner-tr" />

        <div className="flex items-center justify-between gap-4 shrink-0">
          <h2 className="text-base font-bold text-white uppercase">Historial</h2>
          <button onClick={onClose} className="text-[11px] uppercase text-gray-600 hover:bg-gray-600 hover:text-black border border-gray-600 px-2 py-1 cursor-pointer">
            Cerrar
          </button>
        </div>

        {isAdmin && people.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase text-gray-600">Ver:</span>
            <select
              value={personFilter}
              onChange={e => { setPersonFilter(e.target.value); setSelectedId(null) }}
              className="bg-black border border-white text-white text-[11px] px-2 py-1 outline-none cursor-pointer"
            >
              <option value="all">Todos</option>
              <option value="mine">Solo los míos</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        {loading && <p className="text-xs uppercase text-gray-600">Cargando...</p>}
        {error && <p className="text-xs text-white border border-white px-3 py-2">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="text-xs text-gray-600 uppercase leading-relaxed">
            Todavía no hay reportes guardados. Se guardan solos a medida que trabajas.
          </p>
        )}

        {visible.length > 0 && (
          <div className="flex-1 min-h-0 grid sm:grid-cols-[minmax(0,14rem)_1fr] gap-3">
            <div className="overflow-y-auto border border-gray-600 flex flex-col">
              {visible.map(r => {
                const isSel = selectedId === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => openReport(r)}
                    className={`text-left px-3 py-2 border-b border-gray-600 last:border-b-0 cursor-pointer ${
                      isSel ? 'bg-white text-black' : 'text-white hover:bg-gray-600 hover:text-black'
                    }`}
                  >
                    <span className="block text-[11px] font-bold">{formatDateKey(r.report_date)}</span>
                    {isAdmin && r.user_id !== user.id && (
                      <span className="block text-[9px] opacity-70 truncate">{r.profiles?.email ?? r.user_id}</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="min-h-0 flex flex-col gap-2">
              {selected ? (
                <>
                  <textarea
                    value={draft}
                    onChange={e => { setDraft(e.target.value); setSaveState('idle') }}
                    readOnly={!canEdit}
                    spellCheck={false}
                    className={`flex-1 min-h-0 border border-gray-600 p-3 text-[11px] text-white bg-black font-mono whitespace-pre leading-relaxed resize-none outline-none focus:border-white ${
                      canEdit ? '' : 'opacity-70 cursor-not-allowed'
                    }`}
                  />
                  <div className="flex items-center gap-3 shrink-0">
                    {canEdit ? (
                      <>
                        <button
                          onClick={handleSave}
                          disabled={!dirty || saveState === 'saving'}
                          className="pixel-btn px-3 py-1.5 text-[11px] font-bold uppercase cursor-pointer disabled:dither"
                        >
                          {saveState === 'saving' ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                        <span className="text-[10px] uppercase text-gray-600">
                          {saveState === 'saved' && !dirty && 'Guardado'}
                          {saveState === 'error' && 'No se pudo guardar'}
                          {dirty && saveState !== 'saving' && 'Sin guardar'}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] uppercase text-gray-600">
                        Reporte de otra persona · solo lectura
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-600 uppercase">Elige una fecha</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { supabase, type DailyReportRow, type ReportData } from '@/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthGate'

/** report_date is a plain 'YYYY-MM-DD'; split it rather than using Date, which would
 *  interpret it as UTC midnight and show the previous day in negative timezones. */
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export default function HistoryModal({
  onClose,
  onLoad,
}: {
  onClose: () => void
  onLoad: (data: ReportData, date: string) => void
}) {
  const { isAdmin, user } = useAuth()
  const [rows, setRows] = useState<DailyReportRow[]>([])
  const [selected, setSelected] = useState<DailyReportRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [copied, setCopied] = useState(false)

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

  // Only admins ever receive other people's rows, so this list is empty for everyone else.
  const people = Array.from(
    new Set(rows.filter(r => r.user_id !== user.id).map(r => r.profiles?.email ?? r.user_id))
  )

  const visible = personFilter === 'all'
    ? rows
    : personFilter === 'mine'
      ? rows.filter(r => r.user_id === user.id)
      : rows.filter(r => (r.profiles?.email ?? r.user_id) === personFilter)

  const handleCopy = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked (e.g. no HTTPS) — the text stays selectable on screen */ }
  }

  return (
    <div className="daily-overlay fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal pixel-frame bg-black border border-white w-full max-w-2xl max-h-[85vh] flex flex-col gap-3 p-4"
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
              onChange={e => { setPersonFilter(e.target.value); setSelected(null) }}
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
            {/* Lista de fechas */}
            <div className="overflow-y-auto border border-gray-600 flex flex-col">
              {visible.map(r => {
                const isSel = selected?.id === r.id
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`text-left px-3 py-2 border-b border-gray-600 last:border-b-0 cursor-pointer ${
                      isSel ? 'bg-white text-black' : 'text-white hover:bg-gray-600 hover:text-black'
                    }`}
                  >
                    <span className="block text-[11px] font-bold">{formatDate(r.report_date)}</span>
                    {isAdmin && r.user_id !== user.id && (
                      <span className="block text-[9px] opacity-70 truncate">{r.profiles?.email ?? r.user_id}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Detalle */}
            <div className="min-h-0 flex flex-col gap-2">
              {selected ? (
                <>
                  <pre className="flex-1 overflow-auto border border-gray-600 p-3 text-[11px] text-white whitespace-pre-wrap leading-relaxed">
                    {selected.content || '(vacío)'}
                  </pre>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={handleCopy} className="pixel-btn px-3 py-1.5 text-[11px] font-bold uppercase cursor-pointer">
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    {selected.user_id === user.id && selected.data && (
                      <button
                        onClick={() => { onLoad(selected.data as ReportData, selected.report_date); onClose() }}
                        className="text-[11px] uppercase text-gray-600 hover:bg-gray-600 hover:text-black border border-gray-600 px-2 py-1.5 cursor-pointer"
                        title="Trae ese día al editor para seguir trabajándolo"
                      >
                        Cargar en el editor
                      </button>
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

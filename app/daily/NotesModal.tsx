'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthedUser } from '@/app/components/AuthProvider'

/**
 * Bloc de notas del admin: un único bloque de texto libre por cuenta, sin
 * fecha ni versión — se sobrescribe a sí mismo, así que nunca "vence" ni
 * desaparece con el tiempo, solo cambia cuando el admin lo edita.
 */
export default function NotesModal({ onClose }: { onClose: () => void }) {
  const { user, isAdmin } = useAuthedUser()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Última versión confirmada en la base — evita reescribir cuando el texto
  // no cambió y sirve para saber si queda algo pendiente de guardar.
  const savedRef = useRef('')

  useEffect(() => {
    if (!supabase || !isAdmin) { setLoading(false); return }
    let cancelled = false
    supabase
      .from('admin_notes')
      .select('content')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        const content = data?.content ?? ''
        setText(content)
        savedRef.current = content
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [user.id, isAdmin])

  // Autoguardado con debounce: escribe 900ms después de que dejas de teclear.
  useEffect(() => {
    if (!supabase || !isAdmin || loading || text === savedRef.current) return
    const timer = setTimeout(async () => {
      setSaveState('saving')
      const { error: err } = await supabase!
        .from('admin_notes')
        .upsert({ user_id: user.id, content: text }, { onConflict: 'user_id' })
      if (err) {
        setSaveState('error')
        console.error('No se pudieron guardar las notas:', err.message)
      } else {
        savedRef.current = text
        setSaveState('saved')
      }
    }, 900)
    return () => clearTimeout(timer)
  }, [text, isAdmin, loading, user.id])

  if (!isAdmin) return null

  return (
    <div className="daily-overlay ed-overlay fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="daily-modal ed-dialog w-full max-w-2xl h-[75vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 shrink-0 px-6 py-4 border-b border-[var(--line)]">
          <h2 className="text-xl font-medium tracking-[-0.02em]">Notas</h2>
          <button onClick={onClose} className="ed-btn ed-btn--quiet">Cerrar</button>
        </div>

        {error && <p className="text-xs px-6 py-3 text-[var(--ink)]">{error}</p>}

        {loading ? (
          <p className="ed-label px-6 py-4">Cargando</p>
        ) : (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
            autoFocus
            placeholder="Recordatorios sobre clientes..."
            className="flex-1 min-h-0 !border-0 !rounded-none ed-textarea text-[13px] p-6 whitespace-pre-wrap"
          />
        )}

        <div className="flex items-center gap-3 shrink-0 px-6 py-4 border-t border-[var(--line)]">
          <span className="ed-label">
            {saveState === 'saving' && 'Guardando'}
            {saveState === 'saved' && 'Guardado'}
            {saveState === 'error' && 'No se pudo guardar'}
            {saveState === 'idle' && 'Se guarda solo, automáticamente'}
          </span>
        </div>
      </div>
    </div>
  )
}

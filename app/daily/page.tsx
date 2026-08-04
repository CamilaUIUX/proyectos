'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, localDateKey, type ReportData } from '@/lib/supabaseClient'
import { CATEGORY_META, MONTHS, type Category } from '@/lib/reportUtils'
import { useAuth } from '@/app/components/AuthProvider'
import HistoryModal from './HistoryModal'
import WeeklyModal from './WeeklyModal'

interface FileEntry { id: string; name: string }
interface Bullet { id: string; text: string }
interface PendingBatch { files: string[] }

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for browsers without crypto.randomUUID (older browsers, non-HTTPS contexts).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
function makeBullet(text: string): Bullet { return { id: uid(), text } }
function makeEntry(name: string): FileEntry { return { id: uid(), name } }

// Also reused by the midnight rollover, which resets the day to these same defaults.
function defaultTomorrowBullets(): Bullet[] {
  return [makeBullet('Keep working on pending tasks'), makeBullet('Meeting')]
}
function defaultBlockerBullets(): Bullet[] { return [makeBullet('None')] }

function todayLabel(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const month = MONTHS[d.getMonth()]
  const yyyy = String(d.getFullYear())
  return `${dd}, ${month}, ${yyyy}`
}

function generateReport(
  edits: FileEntry[],
  muCreated: FileEntry[],
  checkingComponents: FileEntry[],
  artworkUploaded: FileEntry[],
  tomorrowBullets: Bullet[],
  blockerBullets: Bullet[],
  isFriday: boolean,
  isMonday: boolean
): string {
  const tomorrowLabel = isFriday ? 'Monday' : 'Tomorrow'
  const lines: string[] = []

  lines.push('What I Did Today:')
  lines.push('')
  lines.push('Kept an eye on emails and communications')
  lines.push('Checked proofs for updates')
  lines.push(isMonday ? 'Attend: Creative/Production Team Meeting' : 'Attend:')

  const didLines: string[] = []
  if (edits.length > 0) {
    didLines.push(CATEGORY_META.EDIT.label)
    edits.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (muCreated.length > 0) {
    if (didLines.length > 0) didLines.push('')
    didLines.push(CATEGORY_META.MU_CREATED.label)
    muCreated.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (checkingComponents.length > 0) {
    if (didLines.length > 0) didLines.push('')
    didLines.push(CATEGORY_META.CHECKING_COMPONENTS.label)
    checkingComponents.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (artworkUploaded.length > 0) {
    if (didLines.length > 0) didLines.push('')
    didLines.push(CATEGORY_META.ARTWORK_UPLOADED.label)
    artworkUploaded.forEach(f => didLines.push(`\t• ${f.name}`))
  }
  if (didLines.length > 0) {
    lines.push('')
    lines.push(...didLines)
  }
  lines.push('')

  lines.push(`What I'll do ${tomorrowLabel}:`)
  tomorrowBullets.filter(b => b.text.trim()).forEach(b => lines.push(`\t• ${b.text}`))
  lines.push('')

  lines.push('Blockers/Issues:')
  blockerBullets.filter(b => b.text.trim()).forEach(b => lines.push(`\t• ${b.text}`))

  return lines.join('\n')
}

function BulletSection({ label, tone, bullets, onUpdate, onRemove, onAdd }: {
  label: string
  tone: 'yellow' | 'blue'
  bullets: Bullet[]
  onUpdate: (id: string, text: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="ed-label">{label}</p>
      <div className="flex flex-col gap-2.5">
        {bullets.map(b => (
          <div key={b.id} className="daily-in flex items-center gap-2.5">
            <input
              type="text" value={b.text} onChange={e => onUpdate(b.id, e.target.value)}
              className={`tj-pill flex-1 ${tone === 'yellow' ? 'tj-pill--yellow' : 'tj-pill--blue'}`}
              placeholder="Escribe aquí..."
            />
            <button
              onClick={() => onRemove(b.id)}
              title="Quitar"
              className={`tj-dot ${tone === 'yellow' ? 'tj-dot--yellow' : 'tj-dot--blue'}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button onClick={onAdd} className="ed-btn ed-btn--quiet self-start">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add item
      </button>
    </div>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Bold in the copied report has to come from real <strong> markup, not a Unicode
// "fake bold" character set — those swap in a fixed lookalike glyph set that ignores
// whatever font the paste target (Slack, Gmail, Notion…) is using. Writing both
// text/html and text/plain to the clipboard lets rich-text targets render bold in
// their own font while plain-text targets still get a clean fallback.
function reportTextToHtml(text: string): string {
  const boldLines = new Set([
    'What I Did Today:',
    "What I'll do Tomorrow:",
    "What I'll do Monday:",
    'Blockers/Issues:',
    CATEGORY_META.EDIT.label,
    CATEGORY_META.MU_CREATED.label,
    CATEGORY_META.CHECKING_COMPONENTS.label,
    CATEGORY_META.ARTWORK_UPLOADED.label,
  ])
  const body = text
    .split('\n')
    .map(line => boldLines.has(line) ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line))
    .join('\n')
  return `<div style="white-space:pre-wrap">${body}</div>`
}

function DailyPipView({
  edits, muCreated, checkingComponents, artworkUploaded,
  removingFileIds,
  onRemoveEdit, onRemoveMu, onRemoveChecking, onRemoveArtwork,
  pendingBatch, onFilesDropped, onConfirmCategory, onCancelBatch,
  onCopy, copied, minimized, onMinimize, onRestore,
}: {
  edits: FileEntry[]
  muCreated: FileEntry[]
  checkingComponents: FileEntry[]
  artworkUploaded: FileEntry[]
  removingFileIds: Set<string>
  onRemoveEdit: (id: string) => void
  onRemoveMu: (id: string) => void
  onRemoveChecking: (id: string) => void
  onRemoveArtwork: (id: string) => void
  pendingBatch: PendingBatch | null
  onFilesDropped: (files: FileList) => void
  onConfirmCategory: (cat: Category) => void
  onCancelBatch: () => void
  onCopy: () => void
  copied: boolean
  minimized: boolean
  onMinimize: () => void
  onRestore: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  const hasFiles = edits.length > 0 || muCreated.length > 0 || checkingComponents.length > 0 || artworkUploaded.length > 0

  const allCategories: { cat: Category; files: FileEntry[]; onRemove: (id: string) => void }[] = [
    { cat: 'EDIT',                files: edits,               onRemove: onRemoveEdit },
    { cat: 'MU_CREATED',          files: muCreated,           onRemove: onRemoveMu },
    { cat: 'CHECKING_COMPONENTS', files: checkingComponents,  onRemove: onRemoveChecking },
    { cat: 'ARTWORK_UPLOADED',    files: artworkUploaded,     onRemove: onRemoveArtwork },
  ]

  if (minimized) {
    const counts = allCategories.filter(c => c.files.length > 0)
    return (
      <div
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          onFilesDropped(e.dataTransfer.files)
          onRestore()
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
        }}
        className={`h-screen flex items-center px-3 gap-3 select-none overflow-hidden border-b transition-colors duration-200 ${
          isDragging ? 'bg-[var(--accent)] border-[var(--ink)]' : 'bg-[var(--surface)] border-[var(--line)]'
        }`}
      >
        {isDragging ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink)] shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="ed-label !text-[var(--ink)] shrink-0">Suelta aquí</span>
          </>
        ) : (
          <>
            <span className="ed-label shrink-0">Daily</span>
            {hasFiles && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--ink-2)] font-[family-name:var(--font-mono)] shrink-0">
                {counts.map((c, i) => (
                  <span key={c.cat}>{i > 0 && <span className="text-[var(--ink-3)] mr-1.5">/</span>}{c.files.length}{CATEGORY_META[c.cat].abbr}</span>
                ))}
              </div>
            )}
          </>
        )}
        <button
          onClick={onRestore}
          className="ed-icon-btn ml-auto shrink-0 !w-7 !h-7"
          title="Restaurar"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[var(--surface)] flex flex-col p-4 gap-3 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0 border-b border-[var(--line)] pb-2.5">
        <span className="ed-label">Daily</span>
        <button onClick={onMinimize} className="ed-btn ed-btn--quiet !py-1 !px-2" title="Minimizar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
          </svg>
          <span>Min</span>
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          onFilesDropped(e.dataTransfer.files)
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
        }}
        className={`shrink-0 rounded-[var(--radius)] border border-dashed flex flex-col items-center justify-center gap-2 select-none transition-colors duration-200 ${
          hasFiles ? 'h-20' : 'flex-1'
        } ${isDragging ? 'border-[var(--ink)] bg-[var(--accent)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
          className={isDragging ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className={`ed-label ${isDragging ? '!text-[var(--ink)]' : ''}`}>
          {isDragging ? 'Suelta aquí' : 'Arrastra archivos'}
        </p>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-2.5">
          {allCategories.map(({ cat, files, onRemove }) => files.length > 0 && (
            <div key={cat} className="flex flex-col">
              <p className="ed-label shrink-0 mb-1.5">{CATEGORY_META[cat].label}</p>
              {files.map(f => (
                <div key={f.id} className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} flex items-center gap-2 py-1 border-b border-[var(--line)] last:border-b-0`}>
                  <span className="flex-1 text-[11px] text-[var(--ink)] font-[family-name:var(--font-mono)] truncate">{f.name}</span>
                  <button onClick={() => onRemove(f.id)} className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors duration-150 cursor-pointer shrink-0 p-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Copy */}
      <button
        onClick={onCopy}
        className={`ed-btn shrink-0 w-full py-3 ${copied ? '!bg-[var(--accent-mint)] !border-[var(--accent-mint)]' : 'ed-btn--solid'}`}
      >
        {copied ? 'Copiado' : 'Copy Daily'}
      </button>

      {/* Category modal */}
      {pendingBatch && (
        <div
          className="daily-overlay ed-overlay fixed inset-0 flex items-end justify-center z-50 p-3"
          onClick={onCancelBatch}
        >
          <div
            className="daily-modal ed-dialog p-4 w-full flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1.5 border-b border-[var(--line)] pb-3">
              <p className="ed-label">
                {pendingBatch.files.length} archivo{pendingBatch.files.length !== 1 ? 's' : ''}
              </p>
              <h2 className="text-lg font-medium tracking-[-0.02em]">¿Qué tipo?</h2>
            </div>
            <div className="flex flex-col">
              {(Object.keys(CATEGORY_META) as Category[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => onConfirmCategory(cat)}
                  className="w-full py-2.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-muted)] transition-colors duration-150 cursor-pointer text-left px-1"
                >
                  <span className="text-xs">{CATEGORY_META[cat].label}</span>
                </button>
              ))}
            </div>
            <button onClick={onCancelBatch} className="ed-btn ed-btn--quiet self-start">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function copyStylesToWindow(target: Window) {
  const allCss: string[] = []
  ;[...document.styleSheets].forEach(sheet => {
    try {
      ;[...sheet.cssRules].forEach(rule => allCss.push(rule.cssText))
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  })
  if (allCss.length) {
    const style = target.document.createElement('style')
    style.textContent = allCss.join('\n')
    target.document.head.appendChild(style)
  }
  target.document.documentElement.style.cssText = 'background:#F1ECDC'
  target.document.body.style.cssText = 'background:#F1ECDC;margin:0;height:100%'
}

// Scoped per user: a shared key would hand one person's files to whoever logs in next
// on the same browser, and the autosave would then file them under that second account.
// Sin sesión se usa 'anon', que mantiene el trabajo libre separado del de cada cuenta.
function storageKey(userId: string | undefined): string { return `daily_files:${userId ?? 'anon'}` }

export default function DailyPage() {
  const [edits, setEdits] = useState<FileEntry[]>([])
  const [muCreated, setMuCreated] = useState<FileEntry[]>([])
  const [checkingComponents, setCheckingComponents] = useState<FileEntry[]>([])
  const [artworkUploaded, setArtworkUploaded] = useState<FileEntry[]>([])
  const [removingFileIds, setRemovingFileIds] = useState<Set<string>>(new Set())
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | null>(null)
  const [pendingBatchSource, setPendingBatchSource] = useState<'main' | 'pip'>('main')
  const [isDragging, setIsDragging] = useState(false)
  const [tomorrowBullets, setTomorrowBullets] = useState<Bullet[]>(defaultTomorrowBullets)
  const [blockerBullets, setBlockerBullets] = useState<Bullet[]>(defaultBlockerBullets)
  const [copied, setCopied] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [pipContainer, setPipContainer] = useState<Element | null>(null)
  const [pipMinimized, setPipMinimized] = useState(false)
  const [pipStatus, setPipStatus] = useState<'ok' | 'insecure' | 'unsupported'>('ok')
  const [editedReport, setEditedReport] = useState<string | null>(null)
  const [lastReportText, setLastReportText] = useState('')
  const [mounted, setMounted] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showWeekly, setShowWeekly] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // Starts already "loaded" when Supabase isn't configured, so the autosave below stays off
  // instead of waiting forever for a fetch that will never run.
  const [cloudLoaded, setCloudLoaded] = useState(!supabase)

  // user es null mientras no haya sesión: la app sigue funcionando, solo que guardando
  // en el navegador. Todo lo que toca la nube se activa únicamente cuando hay usuario.
  const { user, isAdmin, signOut, openLogin, canSignIn } = useAuth()
  const userId = user?.id

  const fileInputRef = useRef<HTMLInputElement>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLoad = useRef(false)
  const pipWindowRef = useRef<Window | null>(null)
  // Signature of what is already stored in Supabase, so the autosave can skip writing
  // content that is byte-for-byte what it just read back.
  const savedSignatureRef = useRef<string | null>(null)
  // Set as soon as the user touches anything, so a slow cloud response can't land on top
  // of files they already started dropping in.
  const userTouchedRef = useRef(false)

  // `mounted` starts false on both server and the first client render, so the two match
  // exactly. Only after that first render do we switch to the browser's real date — this
  // avoids "today"/"is it Friday" ever differing between server-rendered and client-rendered
  // text (this static page is built once, so its build-time date can differ from the date a
  // visitor actually loads it on).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isFriday = mounted && new Date().getDay() === 5
  const isMonday = mounted && new Date().getDay() === 1

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId))
      if (raw) {
        const parsed = JSON.parse(raw)
        // Yesterday's leftovers must not bleed into today: the day rolls over even if the
        // browser was closed at midnight, so anything stamped with another date is dropped.
        if (parsed.date !== localDateKey()) return
        // localStorage doesn't exist during server-side rendering, so this data can only
        // be loaded after mount, in an effect — not during the initial render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed.edits)) setEdits(parsed.edits)
        if (Array.isArray(parsed.muCreated)) setMuCreated(parsed.muCreated)
        if (Array.isArray(parsed.checkingComponents)) setCheckingComponents(parsed.checkingComponents)
        if (Array.isArray(parsed.artworkUploaded)) setArtworkUploaded(parsed.artworkUploaded)
      }
    } catch {}
  }, [userId])

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true
      return
    }
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify({
        date: localDateKey(), edits, muCreated, checkingComponents, artworkUploaded,
      }))
    } catch {}
  }, [edits, muCreated, checkingComponents, artworkUploaded, userId])

  useEffect(() => {
    // Browsers only expose the Document Picture-in-Picture API in a secure context
    // (HTTPS or localhost). Over plain http:// it is absent no matter the browser, so
    // distinguish that from "browser doesn't support it" to avoid a misleading message.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPipStatus(
      'documentPictureInPicture' in window ? 'ok'
        : !window.isSecureContext ? 'insecure'
        : 'unsupported'
    )
  }, [])

  useEffect(() => {
    return () => { pipWindowRef.current?.close() }
  }, [])

  const reportText = useMemo(
    () => generateReport(edits, muCreated, checkingComponents, artworkUploaded, tomorrowBullets, blockerBullets, isFriday, isMonday),
    [edits, muCreated, checkingComponents, artworkUploaded, tomorrowBullets, blockerBullets, isFriday, isMonday]
  )

  // Reset manual edits when the generated report changes (new files / bullet updates).
  // Done during render, not in an effect, so the stale edited text never flashes on screen first.
  if (reportText !== lastReportText) {
    setLastReportText(reportText)
    setEditedReport(null)
  }

  const displayText = editedReport ?? reportText

  const hasFiles = edits.length > 0 || muCreated.length > 0 || checkingComponents.length > 0 || artworkUploaded.length > 0

  const applyReportData = useCallback((data: ReportData) => {
    setEdits(data.edits ?? [])
    setMuCreated(data.muCreated ?? [])
    setCheckingComponents(data.checkingComponents ?? [])
    setArtworkUploaded(data.artworkUploaded ?? [])
    if (Array.isArray(data.tomorrowBullets) && data.tomorrowBullets.length > 0) {
      setTomorrowBullets(data.tomorrowBullets)
    }
    if (Array.isArray(data.blockerBullets) && data.blockerBullets.length > 0) {
      setBlockerBullets(data.blockerBullets)
    }
  }, [])

  // Pull today's report from Supabase. localStorage has already painted the screen by now,
  // so this only matters when opening the day from a different computer. Sin sesión no se
  // consulta nada: al iniciarla, este efecto se repite y trae lo que haya en la nube.
  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('daily_reports')
      .select('content, data')
      .eq('user_id', userId)
      .eq('report_date', localDateKey())
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        // If the user already started dropping files while this request was in flight,
        // their work wins — the response is stale by then.
        if (data?.data && !userTouchedRef.current) {
          applyReportData(data.data as ReportData)
          savedSignatureRef.current = JSON.stringify({ content: data.content, data: data.data })
        }
        setCloudLoaded(true)
      })
    return () => { cancelled = true }
  }, [userId, applyReportData])

  // Mirror of the newest values, so timers and handlers can save the current state without
  // being re-created (and without capturing stale values) on every keystroke.
  const latestRef = useRef({
    displayText, edits, muCreated, checkingComponents, artworkUploaded, tomorrowBullets, blockerBullets,
  })
  useEffect(() => {
    latestRef.current = {
      displayText, edits, muCreated, checkingComponents, artworkUploaded, tomorrowBullets, blockerBullets,
    }
  })

  /** Writes today's report immediately. Used by the autosave, by Limpiar and at midnight.
   *  Sin sesión no hace nada: el trabajo vive solo en el navegador. */
  const saveNow = useCallback(async () => {
    const db = supabase
    if (!db || !userId) return
    const s = latestRef.current
    const anyFiles = s.edits.length > 0 || s.muCreated.length > 0
      || s.checkingComponents.length > 0 || s.artworkUploaded.length > 0
    if (!anyFiles) return

    const payload: ReportData = {
      edits: s.edits, muCreated: s.muCreated, checkingComponents: s.checkingComponents,
      artworkUploaded: s.artworkUploaded, tomorrowBullets: s.tomorrowBullets,
      blockerBullets: s.blockerBullets,
    }
    const signature = JSON.stringify({ content: s.displayText, data: payload })
    if (signature === savedSignatureRef.current) return

    setSaveState('saving')
    const { error } = await db.from('daily_reports').upsert(
      { user_id: userId, report_date: localDateKey(), content: s.displayText, data: payload },
      { onConflict: 'user_id,report_date' }
    )
    if (error) {
      setSaveState('error')
      console.error('No se pudo guardar el reporte:', error.message)
    } else {
      savedSignatureRef.current = signature
      setSaveState('saved')
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
  }, [userId])

  // Autosave, debounced so it writes once you stop typing rather than on every keystroke.
  useEffect(() => {
    if (!supabase || !userId || !cloudLoaded || !hasFiles) return
    const timer = setTimeout(() => { void saveNow() }, 1500)
    return () => clearTimeout(timer)
  }, [
    cloudLoaded, hasFiles, displayText, saveNow, userId,
    edits, muCreated, checkingComponents, artworkUploaded, tomorrowBullets, blockerBullets,
  ])

  // At local midnight the day is closed: save what is on screen, then start the new day
  // blank. Covers leaving the tab open overnight; reopening on another day is handled by
  // the date stamp in localStorage.
  useEffect(() => {
    if (!mounted) return
    let timer: ReturnType<typeof setTimeout>
    const scheduleRollover = () => {
      const now = new Date()
      // A few seconds past midnight, so localDateKey() has certainly ticked over.
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timer = setTimeout(async () => {
        await saveNow()
        setEdits([]); setMuCreated([]); setCheckingComponents([]); setArtworkUploaded([])
        setTomorrowBullets(defaultTomorrowBullets())
        setBlockerBullets(defaultBlockerBullets())
        setEditedReport(null)
        savedSignatureRef.current = null
        userTouchedRef.current = false
        setSaveState('idle')
        scheduleRollover()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleRollover()
    return () => clearTimeout(timer)
  }, [mounted, saveNow])

  const handleFiles = useCallback((files: FileList | File[], source: 'main' | 'pip' = 'main') => {
    const names = Array.from(files).map(f => f.name)
    if (names.length === 0) return
    userTouchedRef.current = true
    setPendingBatch({ files: names })
    setPendingBatchSource(source)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files, 'main')
  }, [handleFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files, 'main')
    e.target.value = ''
  }

  const confirmCategory = (category: Category) => {
    if (!pendingBatch) return
    const entries = pendingBatch.files.map(makeEntry)
    if (category === 'EDIT') setEdits(prev => [...prev, ...entries])
    else if (category === 'MU_CREATED') setMuCreated(prev => [...prev, ...entries])
    else if (category === 'CHECKING_COMPONENTS') setCheckingComponents(prev => [...prev, ...entries])
    else if (category === 'ARTWORK_UPLOADED') setArtworkUploaded(prev => [...prev, ...entries])
    setPendingBatch(null)
  }

  const removeFileWithAnimation = (id: string, setter: React.Dispatch<React.SetStateAction<FileEntry[]>>) => {
    setRemovingFileIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setter(prev => prev.filter(f => f.id !== id))
      setRemovingFileIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 150)
  }

  const removeEdit = (id: string) => removeFileWithAnimation(id, setEdits)
  const removeMu = (id: string) => removeFileWithAnimation(id, setMuCreated)
  const removeChecking = (id: string) => removeFileWithAnimation(id, setCheckingComponents)
  const removeArtwork = (id: string) => removeFileWithAnimation(id, setArtworkUploaded)

  // Clearing only empties the screen: the day's report stays in the history. It is saved
  // first so whatever is on screen is never lost by pressing this.
  const handleClear = async () => {
    await saveNow()
    setEdits([])
    setMuCreated([])
    setCheckingComponents([])
    setArtworkUploaded([])
    setRemovingFileIds(new Set())
    setShowClearConfirm(false)
  }

  const handleCopy = useCallback(async () => {
    const markCopied = () => {
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }
    try {
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([displayText], { type: 'text/plain' }),
            'text/html': new Blob([reportTextToHtml(displayText)], { type: 'text/html' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(displayText)
      }
      markCopied()
    } catch {
      const el = document.createElement('textarea')
      el.value = displayText
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      markCopied()
    }
  }, [displayText])

  const openPip = async () => {
    if (pipActive) {
      pipWindowRef.current?.close()
      return
    }
    if (pipStatus !== 'ok') return
    try {
      const pipWin = await (window as any).documentPictureInPicture.requestWindow({
        width: 180,
        height: 52,
      })
      copyStylesToWindow(pipWin)
      const container = pipWin.document.createElement('div')
      pipWin.document.body.appendChild(container)
      pipWindowRef.current = pipWin
      setPipMinimized(true)
      setPipActive(true)
      setPipContainer(container)
      pipWin.addEventListener('pagehide', () => {
        setPipActive(false)
        setPipContainer(null)
        setPipMinimized(false)
        pipWindowRef.current = null
      })
      // Chromium clamps requestWindow's initial size to its own minimum on some
      // versions, silently ignoring a request this small — resizing explicitly
      // once the window's content is already in place (same as minimizePip does)
      // actually takes effect.
      //
      // Con su propio catch a propósito: el navegador puede rechazar el resize si
      // considera que la activación del clic ya caducó durante el await anterior.
      // Para entonces la ventana ya está abierta y es usable, así que tratarlo como
      // un fallo de apertura sería mentir en la consola.
      try {
        pipWin.resizeTo(180, 52)
      } catch {}
    } catch (err) {
      console.error('No se pudo abrir la ventana flotante:', err)
    }
  }

  const minimizePip = () => {
    pipWindowRef.current?.resizeTo(180, 52)
    setPipMinimized(true)
  }

  const restorePip = () => {
    pipWindowRef.current?.resizeTo(260, 420)
    setPipMinimized(false)
  }

  const updateTomorrow = (id: string, text: string) => {
    userTouchedRef.current = true
    setTomorrowBullets(prev => prev.map(b => b.id === id ? { ...b, text } : b))
  }
  const removeTomorrow = (id: string) =>
    setTomorrowBullets(prev => prev.filter(b => b.id !== id))
  const addTomorrow = () =>
    setTomorrowBullets(prev => [...prev, makeBullet('')])

  const updateBlocker = (id: string, text: string) => {
    userTouchedRef.current = true
    setBlockerBullets(prev => prev.map(b => b.id === id ? { ...b, text } : b))
  }
  const removeBlocker = (id: string) =>
    setBlockerBullets(prev => prev.filter(b => b.id !== id))
  const addBlocker = () =>
    setBlockerBullets(prev => [...prev, makeBullet('')])

  const allCategories: { cat: Category; files: FileEntry[]; onRemove: (id: string) => void }[] = [
    { cat: 'EDIT',                files: edits,               onRemove: removeEdit },
    { cat: 'MU_CREATED',          files: muCreated,           onRemove: removeMu },
    { cat: 'CHECKING_COMPONENTS', files: checkingComponents,  onRemove: removeChecking },
    { cat: 'ARTWORK_UPLOADED',    files: artworkUploaded,     onRemove: removeArtwork },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 sm:px-10 lg:px-16 py-10 pb-24">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Tarjeta 1: cabecera + título + zona de carga */}
        <section className="tj-card tj-card--notch px-6 sm:px-10 pt-7 pb-9">

          {/* Barra de sistema: el logo va acá cuando esté el arte final */}
          <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
            <div className="flex items-center gap-3 min-w-0">
              <span className="ed-label shrink-0">Hub / Daily</span>
              {user && <span className="ed-label truncate hidden sm:inline">{user.email}</span>}
              {isAdmin && <span className="ed-chip ed-chip--accent shrink-0">Admin</span>}
            </div>

            {/* Todas las acciones juntas, como antes: nada queda escondido */}
            <div className="flex items-center gap-2.5 shrink-0">
              {user && (
                <span className="ed-label hidden sm:inline mr-1">
                  {saveState === 'saving' && 'Guardando'}
                  {saveState === 'saved' && `Guardado ${savedAt ?? ''}`}
                  {saveState === 'error' && 'Sin guardar'}
                </span>
              )}
              {user && (
                <>
                  <button onClick={() => setShowHistory(true)} className="tj-nav-btn">Historial</button>
                  <button onClick={() => setShowWeekly(true)} className="tj-nav-btn">Semanal</button>
                </>
              )}
              {hasFiles && (
                <button onClick={() => setShowClearConfirm(true)} title="Limpiar (guarda antes de vaciar)" className="ed-icon-btn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
                  </svg>
                </button>
              )}
              <button
                onClick={openPip}
                disabled={pipStatus !== 'ok'}
                data-active={pipActive}
                title={
                  pipStatus === 'insecure'
                    ? 'La ventana flotante requiere HTTPS. Este sitio se está abriendo por http:// — el navegador bloquea esta función sin candado de seguridad.'
                    : pipStatus === 'unsupported'
                      ? 'Ventana flotante no disponible en este navegador (usa Chrome o Edge en computadora)'
                      : pipActive ? 'Cerrar ventana flotante' : 'Abrir ventana flotante'
                }
                className="ed-icon-btn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="1" />
                  <rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
              {user ? (
                <button onClick={signOut} className="ed-btn ed-btn--quiet">Salir</button>
              ) : canSignIn && (
                <button onClick={() => openLogin('signin')} className="ed-btn ed-btn--quiet">Entrar</button>
              )}
            </div>
          </header>

          {/* Título */}
          <h1 className="font-sans text-6xl sm:text-7xl font-extrabold tracking-[-0.02em] leading-[0.95] text-[var(--ink)]">
            Daily
          </h1>
          <p className="text-sm text-[var(--ink-2)] mt-4 max-w-[46ch] leading-relaxed">
            Genera tu reporte de actividad diaria.
            {user
              ? ' Se guarda solo mientras trabajas.'
              : ' Se guarda en este navegador mientras trabajas.'}
          </p>

          {/* Invitación a registrarse: el historial y el semanal necesitan cuenta */}
          {!user && canSignIn && (
            <div className="ed-module p-5 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex flex-col gap-1.5">
                <span className="ed-label">Historial</span>
                <p className="text-sm leading-relaxed max-w-[52ch]">
                  Si quieres guardar el historial de tu actividad, regístrate aquí.
                  Tus reportes quedan guardados y los puedes consultar desde cualquier
                  computadora.
                </p>
              </div>
              <button
                onClick={() => openLogin('signup')}
                className="ed-btn ed-btn--solid shrink-0 self-start sm:self-auto"
              >
                Registrarme
              </button>
            </div>
          )}

          {/* Zona de carga */}
          <div className="flex items-center justify-between pt-9 pb-3">
            <span className="ed-label">Archivos</span>
            <span className="ed-label tabular-nums">
              {String(edits.length + muCreated.length + checkingComponents.length + artworkUploaded.length).padStart(2, '0')}
            </span>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3 py-14 px-8 select-none transition-colors duration-200 ${
              isDragging
                ? 'border-[var(--ink)] bg-[var(--accent)]'
                : 'border-[var(--ink-3)] bg-[var(--surface-muted)] hover:border-[var(--ink-2)]'
            }`}
          >
            <svg
              width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
              className={isDragging ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-center flex flex-col gap-1.5">
              <p className="text-sm text-[var(--ink)]">
                {isDragging ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz clic para seleccionar'}
              </p>
              <p className="ed-label">Cualquier tipo · Múltiples a la vez</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleInputChange}
            />
          </div>
        </section>

        {/* Tarjeta 2: archivos por categoría */}
        <section className="tj-card px-6 sm:px-10 py-8">
          {hasFiles ? (
            <div className="flex flex-col gap-8">
              {allCategories.map(({ cat, files, onRemove }) => files.length > 0 && (
                <div key={cat}>
                  <h2 className="font-sans text-2xl font-extrabold tracking-[-0.01em] text-[var(--ink)] mb-1">
                    {CATEGORY_META[cat].label}
                  </h2>
                  <div className="flex flex-col">
                    {files.map(f => (
                      <div
                        key={f.id}
                        className={`${removingFileIds.has(f.id) ? 'daily-out' : 'daily-in'} group flex items-center gap-3 py-2.5 border-b border-[var(--line)] last:border-b-0`}
                      >
                        <span className="tj-badge">{CATEGORY_META[cat].abbr}</span>
                        <span className="flex-1 text-[13px] text-[var(--ink)] truncate">{f.name}</span>
                        <button
                          onClick={() => onRemove(f.id)}
                          title="Quitar"
                          className="text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors duration-150 cursor-pointer shrink-0 p-1"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="ed-label">Los archivos subidos aparecerán aquí</p>
          )}
        </section>

        {/* Tarjeta 3: notas y reporte final */}
        <section className="tj-card px-6 sm:px-10 py-8">
          <div className="grid lg:grid-cols-2 gap-8">
            <BulletSection
              label={`What I'll do ${isFriday ? 'Monday' : 'Tomorrow'}`}
              tone="yellow"
              bullets={tomorrowBullets}
              onUpdate={updateTomorrow}
              onRemove={removeTomorrow}
              onAdd={addTomorrow}
            />
            <BulletSection
              label="Blockers / Issues"
              tone="blue"
              bullets={blockerBullets}
              onUpdate={updateBlocker}
              onRemove={removeBlocker}
              onAdd={addBlocker}
            />
          </div>

          {/* Salida del reporte */}
          <div className="flex items-center justify-between py-3 ed-rule mt-8">
            <span className="ed-label">Reporte</span>
            <div className="flex items-center gap-3">
              <span className="ed-chip ed-chip--muted tabular-nums">{mounted ? todayLabel() : '—'}</span>
              {editedReport !== null && (
                <button onClick={() => setEditedReport(null)} className="ed-btn ed-btn--quiet">
                  Restaurar generado
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4">
            <textarea
              value={displayText}
              onChange={e => setEditedReport(e.target.value)}
              spellCheck={false}
              className="ed-textarea text-[13px] px-5 py-5 whitespace-pre w-full !rounded-2xl"
              style={{ minHeight: '12rem', height: `${(displayText.split('\n').length + 1) * 1.7}rem` }}
            />
            <button
              onClick={handleCopy}
              className={`w-full py-3.5 rounded-[var(--radius-pill)] font-medium text-[13px] uppercase tracking-[0.06em] cursor-pointer transition-colors duration-150 ${
                copied ? 'bg-[var(--accent-mint)] text-[var(--ink)]' : 'bg-[var(--accent)] text-[var(--ink)] hover:brightness-95'
              }`}
            >
              {copied ? 'Copiado' : 'Copiar Daily'}
            </button>
          </div>

          <div className="ed-rule mt-10" />
          <p className="ed-label py-4">
            Nuevas actualizaciones pronto. Estamos trabajajajando para ti
          </p>
        </section>

      </div>

      {/* Category Modal (main page) */}
      {pendingBatch && pendingBatchSource === 'main' && (
        <div
          className="daily-overlay ed-overlay fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-6 sm:pb-0"
          onClick={() => setPendingBatch(null)}
        >
          <div
            className="daily-modal ed-dialog w-full max-w-md flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2 border-b border-[var(--line)] px-6 py-5">
              <p className="ed-label">
                {pendingBatch.files.length} archivo{pendingBatch.files.length !== 1 ? 's' : ''} seleccionado{pendingBatch.files.length !== 1 ? 's' : ''}
              </p>
              <h2 className="text-xl font-medium tracking-[-0.02em]">¿Qué tipo de trabajo?</h2>
            </div>

            <div className="px-6 py-4 border-b border-[var(--line)] flex flex-col gap-1">
              {pendingBatch.files.slice(0, 5).map((name, i) => (
                <p key={i} className="text-[11px] text-[var(--ink-2)] font-[family-name:var(--font-mono)] truncate">{name}</p>
              ))}
              {pendingBatch.files.length > 5 && (
                <p className="ed-label mt-1">+ {pendingBatch.files.length - 5} más</p>
              )}
            </div>

            <div className="flex flex-col">
              {([
                ['EDIT', 'Archivo que ya existía · se estuvo trabajando'],
                ['MU_CREATED', 'Archivo nuevo · creado desde cero'],
                ['CHECKING_COMPONENTS', 'Revisión de códigos de componente'],
                ['ARTWORK_UPLOADED', 'Arte subido al sistema'],
              ] as [Category, string][]).map(([cat, hint]) => (
                <button
                  key={cat}
                  onClick={() => confirmCategory(cat)}
                  className="group w-full py-3.5 border-b border-[var(--line)] hover:bg-[var(--surface-muted)] transition-colors duration-150 cursor-pointer text-left px-6 flex items-center gap-4"
                >
                  <span className="ed-label shrink-0">{CATEGORY_META[cat].abbr}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="block text-sm">{CATEGORY_META[cat].label}</span>
                    <span className="block text-[11px] text-[var(--ink-2)]">{hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="px-6 py-4">
              <button onClick={() => setPendingBatch(null)} className="ed-btn ed-btn--quiet">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación antes de limpiar */}
      {showClearConfirm && (
        <div
          className="daily-overlay ed-overlay fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-6 sm:pb-0"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="daily-modal ed-dialog w-full max-w-md flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2 border-b border-[var(--line)] px-6 py-5">
              <span className="ed-label">Limpiar</span>
              <h2 className="text-xl font-medium tracking-[-0.02em]">¿Vaciar la pantalla?</h2>
            </div>

            <div className="px-6 py-5 border-b border-[var(--line)]">
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Se guarda el reporte de hoy antes de vaciar, así que queda en el historial.
                Pero la pantalla se limpia y no se puede deshacer desde aquí.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 px-6 py-4">
              <button onClick={() => setShowClearConfirm(false)} className="ed-btn ed-btn--quiet">
                Cancelar
              </button>
              <button onClick={handleClear} className="ed-btn ed-btn--solid">
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PiP portal */}
      {pipContainer && createPortal(
        <DailyPipView
          edits={edits}
          muCreated={muCreated}
          checkingComponents={checkingComponents}
          artworkUploaded={artworkUploaded}
          removingFileIds={removingFileIds}
          onRemoveEdit={removeEdit}
          onRemoveMu={removeMu}
          onRemoveChecking={removeChecking}
          onRemoveArtwork={removeArtwork}
          pendingBatch={pendingBatchSource === 'pip' ? pendingBatch : null}
          onFilesDropped={files => handleFiles(files, 'pip')}
          onConfirmCategory={confirmCategory}
          onCancelBatch={() => setPendingBatch(null)}
          onCopy={handleCopy}
          copied={copied}
          minimized={pipMinimized}
          onMinimize={minimizePip}
          onRestore={restorePip}
        />,
        pipContainer
      )}

      {/* Ambos leen de la nube, así que solo existen con sesión iniciada. */}
      {user && showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}

      {user && showWeekly && <WeeklyModal onClose={() => setShowWeekly(false)} />}
    </div>
  )
}

'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, type Profile } from '@/lib/supabaseClient'

// Debe coincidir con la regla de supabase/schema.sql. La base es la que manda:
// esto solo sirve para dar un mensaje claro antes de enviar el registro.
const ALLOWED_DOMAIN = '@connaxis.com'
const EXTRA_ALLOWED_EMAILS = ['camilamoratosoria@gmail.com']

function isAllowedEmail(email: string): boolean {
  const addr = email.trim().toLowerCase()
  return addr.endsWith(ALLOWED_DOMAIN) || EXTRA_ALLOWED_EMAILS.includes(addr)
}

interface AuthValue {
  /** null mientras no haya sesión: la app funciona igual, guardando solo en el navegador. */
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  /** False si faltan las claves de Supabase; entonces no se ofrece registro. */
  canSignIn: boolean
  openLogin: (mode?: 'signin' | 'signup') => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return value
}

/**
 * Para componentes que solo se montan con sesión iniciada (los modales de historial y
 * semanal). Evita repartir comprobaciones de null por sitios donde el usuario ya existe.
 */
export function useAuthedUser(): { user: User; isAdmin: boolean } {
  const { user, isAdmin } = useAuth()
  if (!user) throw new Error('useAuthedUser requiere una sesión iniciada')
  return { user, isAdmin }
}

/** Supabase surfaces English, sometimes cryptic, errors — translate the common ones. */
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.'
  if (m.includes('user already registered')) return 'Ese correo ya tiene una cuenta. Usa "Ya tengo cuenta".'
  if (m.includes('password should be')) return 'La contraseña debe tener al menos 8 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos.'
  // The database trigger that blocks other domains reaches the client as a generic
  // "Database error saving new user", so name the real reason.
  if (m.includes('database error')) return `No se pudo crear la cuenta. Ese correo no está autorizado (se permiten cuentas ${ALLOWED_DOMAIN}).`
  return message
}

function LoginModal({ initialMode, onClose }: { initialMode: 'signin' | 'signup'; onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || busy) return
    setError(null)
    setNotice(null)

    // The database rejects other domains regardless; checking here just turns a confusing
    // server error into a clear message before the request is even sent.
    if (mode === 'signup' && !isAllowedEmail(email)) {
      setError(`Ese correo no está autorizado. Se permiten cuentas ${ALLOWED_DOMAIN}.`)
      return
    }

    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) setError(friendlyError(error.message))
        else onClose()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) setError(friendlyError(error.message))
        else if (data.session) onClose()
        else {
          setNotice('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="daily-overlay ed-overlay fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="daily-modal ed-dialog w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[var(--line)]">
          <div className="flex flex-col gap-2">
            <span className="ed-label">Acceso</span>
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </h2>
          </div>
          <button onClick={onClose} className="ed-btn ed-btn--quiet shrink-0">Cerrar</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-6">
          <span className="ed-chip ed-chip--muted self-start">Solo correos {ALLOWED_DOMAIN}</span>

          <label className="flex flex-col gap-2">
            <span className="ed-label">Correo</span>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" placeholder={`nombre${ALLOWED_DOMAIN}`}
              className="ed-input"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="ed-label">Contraseña</span>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={8} placeholder="Mínimo 8 caracteres"
              className="ed-input"
            />
          </label>

          {error && (
            <p role="alert" className="ed-module border-l-2 border-l-[var(--ink)] px-3 py-2.5 text-[12px] leading-relaxed">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="px-3 py-2.5 text-[12px] leading-relaxed rounded-[var(--radius)] bg-[var(--accent-mint)]">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="ed-btn ed-btn--solid w-full py-3">
            {busy ? 'Espera...' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div className="px-6 py-4 border-t border-[var(--line)]">
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}
            className="ed-btn ed-btn--quiet"
          >
            {mode === 'signin' ? 'No tengo cuenta' : 'Ya tengo cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Envuelve la app sin bloquearla: el login es opcional. Sin sesión, Daily funciona
 * guardando en el navegador; con sesión se activan la nube, el historial y el semanal.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loginMode, setLoginMode] = useState<'signin' | 'signup' | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // Drop the old profile on sign-out so the next person to log in can never briefly
      // inherit the previous user's role.
      if (!next) setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile | null) ?? null)
      })
    return () => { cancelled = true }
  }, [userId])

  const openLogin = useCallback((mode: 'signin' | 'signup' = 'signin') => setLoginMode(mode), [])

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        profile,
        isAdmin: profile?.role === 'admin',
        canSignIn: supabaseConfigured,
        openLogin,
        signOut: async () => { await supabase?.auth.signOut() },
      }}
    >
      {children}
      {loginMode && <LoginModal initialMode={loginMode} onClose={() => setLoginMode(null)} />}
    </AuthContext.Provider>
  )
}

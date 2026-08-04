'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  user: User
  profile: Profile | null
  isAdmin: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Only callable from inside <AuthGate>, so the user is guaranteed to be signed in. */
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthGate>')
  return value
}

/** Supabase surfaces English, sometimes cryptic, errors — translate the common ones. */
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.'
  if (m.includes('user already registered')) return 'Ese correo ya tiene una cuenta. Usa "Ya tengo cuenta".'
  if (m.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos.'
  // The database trigger that blocks other domains reaches the client as a generic
  // "Database error saving new user", so name the real reason.
  if (m.includes('database error')) return `No se pudo crear la cuenta. Ese correo no está autorizado (se permiten cuentas ${ALLOWED_DOMAIN}).`
  return message
}

function SetupNeeded() {
  return (
    <div className="min-h-screen px-6 sm:px-10 py-16">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <span className="ed-label">Configuración pendiente</span>
        <h1 className="text-3xl font-medium tracking-[-0.02em]">Falta configurar Supabase</h1>
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          No encuentro las claves de conexión. Para que esto funcione:
        </p>
        <ol className="ed-module divide-y divide-[var(--line)]">
          {[
            <>Entra a tu proyecto en Supabase → <b>Settings</b> → <b>API</b>.</>,
            <>Copia <b>Project URL</b> y <b>anon key</b>.</>,
            <>Pégalos en el archivo <b>.env.local</b> del proyecto.</>,
            <>Reinicia el servidor (<b>npm run dev</b>).</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-4 px-4 py-3 text-sm leading-relaxed">
              <span className="ed-label pt-1 shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--ink-3)] leading-relaxed">
          En producción hay que agregar esas mismas dos variables en Vercel →
          Settings → Environment Variables.
        </p>
      </div>
    </div>
  )
}

function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) setError(friendlyError(error.message))
        else if (!data.session) {
          setNotice('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen px-6 sm:px-10 py-10 flex flex-col">
      <header className="flex items-baseline justify-between gap-6 pb-4 max-w-6xl mx-auto w-full">
        <span className="ed-label">Hub</span>
        <span className="ed-label">Acceso</span>
      </header>
      <div className="ed-rule max-w-6xl mx-auto w-full" />

      <div className="flex-1 flex items-center justify-center py-16">
        <div className="w-full max-w-sm flex flex-col gap-10">

          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-medium tracking-[-0.03em] leading-[1.05]">
              {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </h1>
            <span className="ed-chip ed-chip--muted self-start">Solo correos {ALLOWED_DOMAIN}</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                minLength={6} placeholder="Mínimo 6 caracteres"
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

          <div className="ed-rule" />

          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}
            className="ed-btn ed-btn--quiet self-start"
          >
            {mode === 'signin' ? 'No tengo cuenta' : 'Ya tengo cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Nothing to wait for when Supabase isn't configured — SetupNeeded renders either way.
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
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

  if (!supabaseConfigured) return <SetupNeeded />

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="ed-label">Cargando</p>
      </div>
    )
  }

  if (!session) return <LoginScreen />

  return (
    <AuthContext.Provider
      value={{
        user: session.user,
        profile,
        isAdmin: profile?.role === 'admin',
        signOut: async () => { await supabase?.auth.signOut() },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

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
    <div className="min-h-screen bg-black px-4 py-16">
      <div className="max-w-xl mx-auto pixel-frame border border-white p-6 flex flex-col gap-4">
        <span className="corner-tl" />
        <span className="corner-tr" />
        <h1 className="text-xl font-bold text-white uppercase">Falta configurar Supabase</h1>
        <p className="text-sm text-white leading-relaxed">
          No encuentro las claves de conexión. Para que esto funcione:
        </p>
        <ol className="text-sm text-white flex flex-col gap-2 list-decimal pl-5 leading-relaxed">
          <li>Entra a tu proyecto en Supabase → <b>Settings</b> → <b>API</b>.</li>
          <li>Copia <b>Project URL</b> y <b>anon key</b>.</li>
          <li>Pégalos en el archivo <b>.env.local</b> del proyecto.</li>
          <li>Reinicia el servidor (<b>npm run dev</b>).</li>
        </ol>
        <p className="text-xs text-gray-600 leading-relaxed">
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
    <div className="min-h-screen bg-black px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="pixel-frame border border-white flex items-center justify-between px-4 py-2">
          <span className="corner-tl" />
          <span className="corner-tr" />
          <p className="text-xs tracking-[0.3em] uppercase text-white">Hub // Acceso</p>
          <p className="text-xs tracking-[0.3em] uppercase text-white">{'///'}</p>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-white uppercase">
            {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </h1>
          <p className="text-xs text-gray-600 uppercase leading-relaxed">
            Solo correos {ALLOWED_DOMAIN}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase text-white tracking-wide">Correo</span>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" placeholder={`nombre${ALLOWED_DOMAIN}`}
              className="bg-black border border-white px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:bg-white focus:text-black"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase text-white tracking-wide">Contraseña</span>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6} placeholder="Mínimo 6 caracteres"
              className="bg-black border border-white px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:bg-white focus:text-black"
            />
          </label>

          {error && (
            <p role="alert" className="text-[11px] text-white border border-white px-3 py-2 leading-relaxed">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-[11px] text-white border border-white px-3 py-2 leading-relaxed">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="pixel-btn px-4 py-2.5 text-sm font-bold uppercase cursor-pointer disabled:dither">
            {busy ? 'Espera...' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}
          className="self-start text-[11px] uppercase text-gray-600 hover:bg-gray-600 hover:text-black border border-gray-600 px-2 py-1 cursor-pointer"
        >
          {mode === 'signin' ? 'No tengo cuenta' : 'Ya tengo cuenta'}
        </button>
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-600">Cargando...</p>
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

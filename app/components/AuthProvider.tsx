'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured, type AppAccessRow, type Profile } from '@/lib/supabaseClient'
import { InfoScreen } from '@/app/components/InfoScreen'

// Debe coincidir con la regla de supabase/schema.sql. La base es la que manda:
// esto solo sirve para dar un mensaje claro antes de enviar el registro.
const ALLOWED_DOMAIN = '@connaxis.com'
const EXTRA_ALLOWED_EMAILS = ['camilamoratosoria@gmail.com']

function isAllowedEmail(email: string): boolean {
  const addr = email.trim().toLowerCase()
  return addr.endsWith(ALLOWED_DOMAIN) || EXTRA_ALLOWED_EMAILS.includes(addr)
}

interface AuthValue {
  /** null hasta que haya sesión. Sin AuthGate delante, ningún componente llega a
   *  montarse con user en null: el login es obligatorio para todo el sitio. */
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  /** False mientras se resuelve la sesión inicial (una sola vez, al cargar la
   *  página). AuthGate lo usa para no mostrar la pantalla de login un instante
   *  antes de confirmar que sí había sesión guardada. */
  ready: boolean
  /** False mientras se resuelven el perfil (isAdmin) y la lista de accesos:
   *  MiniAppGate y AdminGate lo usan para no mostrar "sin acceso" un instante
   *  antes de saber si la cuenta sí lo tiene. */
  accessReady: boolean
  /** True si la cuenta puede usar esa mini-app: los admins pueden todas; el resto,
   *  solo las que tengan fila en app_access (ver supabase/schema.sql). */
  hasAppAccess: (slug: string) => boolean
  /** False si faltan las claves de Supabase; entonces no hay forma de exigir login. */
  canSignIn: boolean
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

/** Formulario de acceso, sin forma de cerrarlo: mientras no haya sesión es lo único
 *  que AuthGate deja ver de todo el sitio. */
function LoginForm() {
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
        // Sin error, onAuthStateChange actualiza la sesión y AuthGate deja pasar solo.
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
    <div className="ed-dialog w-full max-w-md flex flex-col">

      <div className="flex flex-col gap-2 px-6 py-5 border-b border-[var(--line)]">
        <span className="ed-label">Acceso</span>
        <h2 className="text-2xl font-medium tracking-[-0.02em]">
          {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
        </h2>
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
  )
}

/** Envuelve toda la app: mantiene la sesión sincronizada con Supabase. No decide
 *  qué se muestra — eso es trabajo de AuthGate. */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [allowedApps, setAllowedApps] = useState<Set<string> | null>(null)
  // Sin Supabase configurado no hay sesión que esperar: se da por "resuelta" de una vez.
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
      // Drop the old profile/accesos on sign-out so the next person to log in can
      // never briefly inherit the previous user's role o mini-apps.
      if (!next) {
        setProfile(null)
        setProfileReady(false)
        setAllowedApps(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    // Sin reset acá: profileReady ya arranca en false y el sign-out lo vuelve a
    // false (arriba), así que para cuando userId pasa a tener un valor nuevo ya
    // está en el estado correcto para esperar este fetch.
    supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setProfile((data as Profile | null) ?? null)
        setProfileReady(true)
      })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('app_access')
      .select('app_slug')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled) return
        setAllowedApps(new Set((data as Pick<AppAccessRow, 'app_slug'>[] ?? []).map(r => r.app_slug)))
      })
    return () => { cancelled = true }
  }, [userId])

  const isAdmin = profile?.role === 'admin'
  // Los admins no dependen de allowedApps: en cuanto se sabe el rol, ya está resuelto.
  const accessReady = profileReady && (isAdmin || allowedApps !== null)

  const hasAppAccess = useCallback(
    (slug: string) => isAdmin || (allowedApps?.has(slug) ?? false),
    [isAdmin, allowedApps]
  )

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        profile,
        isAdmin,
        ready,
        accessReady,
        hasAppAccess,
        canSignIn: supabaseConfigured,
        signOut: async () => { await supabase?.auth.signOut() },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** Bloquea todo el sitio hasta que haya sesión iniciada: el login ya no es opcional
 *  para ninguna mini-app. Debe ir dentro de <AuthProvider>, envolviendo el layout raíz. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready, canSignIn } = useAuth()

  // Evita el parpadeo de la pantalla de login mientras se confirma una sesión que
  // ya existía (localStorage de Supabase) — se resuelve en un instante, no vale la
  // pena un spinner para esto.
  if (!ready) return null

  if (!canSignIn) {
    return (
      <InfoScreen
        label="Configuración pendiente"
        message={
          <>
            Faltan las claves de Supabase (<code>NEXT_PUBLIC_SUPABASE_URL</code> /{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) en <code>.env.local</code>. El
            sitio requiere una cuenta para entrar y no puede validarla sin ellas.
          </>
        }
      />
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
        <LoginForm />
      </div>
    )
  }

  return <>{children}</>
}

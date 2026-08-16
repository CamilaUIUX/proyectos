'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type AppAccessRow, type Profile } from '@/lib/supabaseClient'
import { MINI_APPS } from '@/lib/miniApps'

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [access, setAccess] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `${userId}:${slug}` de los toggles en vuelo, para deshabilitar el checkbox
  // mientras se confirma y no perder un segundo clic en el camino.
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('id, email, role').order('email'),
      supabase.from('app_access').select('user_id, app_slug'),
    ]).then(([profilesRes, accessRes]) => {
      if (cancelled) return
      if (profilesRes.error) setError(profilesRes.error.message)
      else if (accessRes.error) setError(accessRes.error.message)
      else {
        setProfiles((profilesRes.data ?? []) as Profile[])
        const map = new Map<string, Set<string>>()
        for (const row of (accessRes.data ?? []) as AppAccessRow[]) {
          if (!map.has(row.user_id)) map.set(row.user_id, new Set())
          map.get(row.user_id)!.add(row.app_slug)
        }
        setAccess(map)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const toggleAccess = async (userId: string, slug: string, grant: boolean) => {
    if (!supabase) return
    const key = `${userId}:${slug}`
    setPending(prev => new Set(prev).add(key))

    // Optimista: refleja el cambio de una vez; se revierte si Supabase lo rechaza.
    const applyLocally = (granted: boolean) => setAccess(prev => {
      const next = new Map(prev)
      const set = new Set(next.get(userId) ?? [])
      granted ? set.add(slug) : set.delete(slug)
      next.set(userId, set)
      return next
    })
    applyLocally(grant)

    const { error } = grant
      ? await supabase.from('app_access').upsert(
          { user_id: userId, app_slug: slug },
          { onConflict: 'user_id,app_slug', ignoreDuplicates: true }
        )
      : await supabase.from('app_access').delete().eq('user_id', userId).eq('app_slug', slug)

    if (error) {
      applyLocally(!grant)
      setError(error.message)
    }

    setPending(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 sm:px-10 lg:px-16 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-1.5">
        <section className="tj-card px-6 sm:px-10 py-8">

          <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[var(--line)]">
            <div className="flex flex-col gap-1.5">
              <span className="ed-label">Admin</span>
              <h1 className="font-display text-4xl sm:text-5xl tracking-[-0.02em] text-[var(--ink)]">
                Usuarios
              </h1>
            </div>
            <Link href="/" className="ed-btn ed-btn--quiet">Volver al Hub</Link>
          </header>

          <p className="text-sm text-[var(--ink-2)] leading-relaxed pt-6 max-w-[70ch]">
            Quién puede entrar a cada mini-app. Al registrarse, toda cuenta @connaxis
            recibe acceso solo a Daily — cualquier otra mini-app se habilita acá.
            Los admins ven y usan todo, sin pasar por esta tabla.
          </p>

          {error && (
            <p role="alert" className="ed-module border-l-2 border-l-[var(--ink)] px-3 py-2.5 text-[12px] leading-relaxed mt-4">
              {error}
            </p>
          )}

          <div className="pt-6">
            {loading ? (
              <p className="ed-label">Cargando…</p>
            ) : profiles.length === 0 ? (
              <p className="ed-label">Todavía no hay cuentas registradas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="ed-row">
                      <th className="ed-label py-2.5 pr-4 font-normal">Correo</th>
                      <th className="ed-label py-2.5 pr-4 font-normal">Rol</th>
                      {MINI_APPS.map(app => (
                        <th key={app.slug} className="ed-label py-2.5 px-3 font-normal text-center whitespace-nowrap">
                          {app.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => {
                      const isAdminRow = p.role === 'admin'
                      const granted = access.get(p.id) ?? new Set<string>()
                      return (
                        <tr key={p.id} className="ed-row">
                          <td className="py-3 pr-4 text-[13px] text-[var(--ink)] truncate max-w-[240px]">
                            {p.email ?? '—'}
                          </td>
                          <td className="py-3 pr-4">
                            {isAdminRow
                              ? <span className="ed-chip ed-chip--accent">Admin</span>
                              : <span className="ed-label">Member</span>}
                          </td>
                          {MINI_APPS.map(app => {
                            const key = `${p.id}:${app.slug}`
                            return (
                              <td key={app.slug} className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isAdminRow || granted.has(app.slug)}
                                  disabled={isAdminRow || pending.has(key)}
                                  onChange={e => toggleAccess(p.id, app.slug, e.target.checked)}
                                  className="w-4 h-4 cursor-pointer accent-[var(--ink)] disabled:cursor-not-allowed"
                                  title={isAdminRow ? 'Los admins tienen acceso a todo' : undefined}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </section>
      </div>
    </div>
  )
}

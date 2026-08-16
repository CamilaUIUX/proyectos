'use client'

import Link from 'next/link'
import { MINI_APPS } from '@/lib/miniApps'
import { useAuth } from '@/app/components/AuthProvider'

export default function HomePage() {
  const { isAdmin, accessReady, hasAppAccess } = useAuth()
  const apps = MINI_APPS.filter(app => hasAppAccess(app.slug))

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 sm:px-10 lg:px-16 py-10">
      <div className="max-w-6xl mx-auto">
        <section className="tj-card tj-card--notch px-6 sm:px-10 py-8">

          {/* Cabecera del sistema */}
          <header className="flex items-baseline justify-between gap-6 pb-4 ed-rule border-t-0">
            <span className="ed-label">Hub</span>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link href="/admin" className="ed-btn ed-btn--quiet !py-1 !px-2">Admin</Link>
              )}
              <span className="ed-label">Índice / 001</span>
            </div>
          </header>

          <div className="ed-rule" />

          {/* Título editorial: grande, alineado a la izquierda, mucho aire */}
          <div className="grid lg:grid-cols-12 gap-6 pt-16 pb-20">
            <div className="lg:col-span-8">
              <h1 className="font-display text-5xl sm:text-7xl tracking-[-0.02em] leading-[0.95] text-[var(--ink)]">
                Mini-apps
              </h1>
            </div>
            <div className="lg:col-span-4 flex lg:justify-end lg:items-end">
              <p className="text-sm text-[var(--ink-2)] max-w-[28ch] leading-relaxed">
                Herramientas internas de uso diario. Selecciona una para empezar.
              </p>
            </div>
          </div>

          {/* Tabla de contenidos */}
          <div className="ed-rule" />
          <div className="flex items-center justify-between py-3">
            <span className="ed-label">Aplicaciones</span>
            <span className="ed-label">{String(apps.length).padStart(2, '0')}</span>
          </div>

          {!accessReady ? (
            <p className="ed-label py-6">Cargando…</p>
          ) : apps.length === 0 ? (
            <p className="ed-label py-6">Sin aplicaciones disponibles. Pide acceso a un administrador.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps.map((app, i) => (
                <Link
                  key={app.slug}
                  href={`/${app.slug}`}
                  className="ed-module group p-5 flex flex-col gap-8 hover:border-[var(--line-strong)] transition-colors duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="ed-label">{String(i + 1).padStart(3, '0')}</span>
                    <span className="ed-chip ed-chip--muted group-hover:ed-chip">Abrir</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="font-sans text-2xl font-bold tracking-[-0.01em] text-[var(--ink)]">
                      {app.name}
                    </h2>
                    <p className="text-sm text-[var(--ink-2)] leading-relaxed">{app.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

        </section>
      </div>
    </div>
  )
}

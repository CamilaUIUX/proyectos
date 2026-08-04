import Link from 'next/link'

interface MiniApp {
  name: string
  slug: string
  description: string
}

// Agregar una mini-app nueva: sumarla acá y crear su carpeta en app/<slug>/
const MINI_APPS: MiniApp[] = [
  { name: 'Daily', slug: 'daily', description: 'Genera tu reporte de actividad diaria' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen px-6 sm:px-10 lg:px-16 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Cabecera del sistema */}
        <header className="flex items-baseline justify-between gap-6 pb-4 ed-rule border-t-0">
          <span className="ed-label">Hub</span>
          <span className="ed-label">Índice / 001</span>
        </header>

        <div className="ed-rule" />

        {/* Título editorial: grande, alineado a la izquierda, mucho aire */}
        <div className="grid lg:grid-cols-12 gap-6 pt-16 pb-20">
          <div className="lg:col-span-8">
            <h1 className="text-5xl sm:text-7xl font-medium tracking-[-0.03em] leading-[0.95] text-[var(--ink)]">
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
          <span className="ed-label">{String(MINI_APPS.length).padStart(2, '0')}</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MINI_APPS.map((app, i) => (
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
                <h2 className="text-2xl font-medium tracking-[-0.02em] text-[var(--ink)]">
                  {app.name}
                </h2>
                <p className="text-sm text-[var(--ink-2)] leading-relaxed">{app.description}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}

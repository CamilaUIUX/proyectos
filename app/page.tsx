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
    <div className="min-h-screen bg-black px-4 py-16">
      <div className="max-w-3xl mx-auto flex flex-col gap-10">
        <div className="pixel-frame border border-white flex items-center justify-between px-4 py-2">
          <span className="corner-tl" />
          <span className="corner-tr" />
          <p className="text-xs tracking-[0.3em] uppercase text-white">Hub // 001</p>
          <p className="text-xs tracking-[0.3em] uppercase text-white">{'///'}</p>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">MINI-APPS</h1>
          <p className="text-sm text-white">Selecciona una app para empezar</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {MINI_APPS.map(app => (
            <Link
              key={app.slug}
              href={`/${app.slug}`}
              className="group flex flex-col gap-2 bg-black border border-white hover:bg-white p-6 transition-none"
            >
              <h2 className="text-lg font-bold text-white group-hover:text-black">
                {'//'}{app.name.toUpperCase()}_
              </h2>
              <p className="text-sm text-white group-hover:text-black">{app.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

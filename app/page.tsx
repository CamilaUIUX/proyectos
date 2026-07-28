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
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-16">
      <div className="max-w-3xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-[#666]">Hub</p>
          <h1 className="text-4xl font-black tracking-tight text-[#f5f5f5]">Mini-apps</h1>
          <p className="text-sm text-[#888]">Selecciona una app para empezar</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {MINI_APPS.map(app => (
            <Link
              key={app.slug}
              href={`/${app.slug}`}
              className="group flex flex-col gap-2 bg-[#0d0d0d] border border-[#222] hover:border-[#3a3a3a] rounded-2xl p-6 transition-all duration-200"
            >
              <h2 className="text-lg font-black text-[#f0f0f0] group-hover:text-white transition-colors">
                {app.name}
              </h2>
              <p className="text-sm text-[#777]">{app.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// Grotesca suiza para todo el texto; mono técnica para el reporte y los datos,
// que se leen como salida de un sistema y no como prosa.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Hub',
  description: 'Mini-apps',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}

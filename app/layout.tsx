import type { Metadata } from 'next'
import { Silkscreen } from 'next/font/google'
import './globals.css'

const silkscreen = Silkscreen({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pixel',
})

export const metadata: Metadata = {
  title: 'Hub',
  description: 'Mini-apps',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={silkscreen.variable}>
      <body>
        {children}
      </body>
    </html>
  )
}

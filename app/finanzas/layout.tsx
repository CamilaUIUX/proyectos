import type { Metadata, Viewport } from 'next'
import { MiniAppGate } from '@/app/components/MiniAppGate'
import { FinanzasShell } from './components/shell'
import { ServiceWorker } from './components/service-worker'
import './theme.css'

export const metadata: Metadata = {
  title: 'Finanzas',
  description: 'Tus cuentas y movimientos',
  // El manifest se enlaza SOLO desde acá y no con `app/manifest.ts`, que lo
  // inyectaría en todas las páginas del Hub. La instalación es de esta
  // mini-app.
  manifest: '/finanzas/manifest',
  appleWebApp: {
    // Sin esto, "Agregar a inicio" en iPhone abre Safari con su barra en vez
    // de la app a pantalla completa.
    capable: true,
    title: 'Finanzas',
    statusBarStyle: 'default',
  },
  icons: {
    // iOS no lee los íconos del manifest: necesita `apple-touch-icon`.
    apple: [{ url: '/finanzas/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

// Pinta la barra del navegador en iOS con el canvas claro de Finanzas en
// vez del fondo oscuro del resto del Hub (contexto_ui_finanzas.md, "El
// negro del Hub en iOS", del repo de referencia).
export const viewport: Viewport = { themeColor: '#F3F4F6', viewportFit: 'cover' }

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <MiniAppGate slug="finanzas">
      <ServiceWorker />
      <FinanzasShell>{children}</FinanzasShell>
    </MiniAppGate>
  )
}

/**
 * El manifest de Finanzas.
 *
 * Va como ruta DENTRO de la mini-app y no en `app/manifest.ts`: el archivo de
 * convención de Next inyecta el `<link rel="manifest">` en TODAS las páginas
 * del Hub, y la instalación (y más adelante las notificaciones) son solo de
 * Finanzas. Esto lo enlaza únicamente el layout de esta ruta.
 *
 * `start_url` / `scope` apuntan a /finanzas: quien lo agrega a la pantalla de
 * inicio quiere abrir Finanzas, no el portal del Hub.
 */
export function GET() {
  return Response.json(
    {
      name: 'Finanzas',
      short_name: 'Finanzas',
      description: 'Tus cuentas y movimientos',
      start_url: '/finanzas',
      scope: '/finanzas',
      display: 'standalone',
      // El verde oscuro del ícono, para que el splash no destelle en otro
      // color antes de que cargue la app.
      background_color: '#12281D',
      theme_color: '#F3F4F6',
      lang: 'es',
      icons: [
        { src: '/finanzas/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/finanzas/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` va aparte y con más margen: Android recorta a la forma
        // del sistema y un dibujo a sangre perdería las esquinas.
        { src: '/finanzas/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  )
}

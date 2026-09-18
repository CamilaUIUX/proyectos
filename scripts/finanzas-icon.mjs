// Genera los PNG del ícono de la PWA de Finanzas a partir de un SVG inline.
// Uso: node scripts/finanzas-icon.mjs   (necesita `sharp`, ya es dep de Next)
//
// Marca: campo verde oscuro del hero (#12281D) + tres barras ascendentes en
// lima (#C8F169), el mismo par de colores que la tarjeta de patrimonio.

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'finanzas')

const BG = '#12281D'
const LIME = '#C8F169'

/** `inset` = fracción de margen (0 = a sangre, 0.16 = versión maskable). */
function svg(inset) {
  const S = 512
  const pad = Math.round(S * inset)
  const w = S - pad * 2
  // Tres barras dentro del área útil.
  const gap = Math.round(w * 0.09)
  const bw = Math.round((w - gap * 2) / 3)
  const heights = [0.42, 0.66, 0.92].map(h => Math.round(w * h))
  const baseY = pad + w
  const r = Math.round(bw * 0.28)
  const bars = heights
    .map((h, i) => {
      const x = pad + i * (bw + gap)
      return `<rect x="${x}" y="${baseY - h}" width="${bw}" height="${h}" rx="${r}" fill="${LIME}"/>`
    })
    .join('')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
      `<rect width="${S}" height="${S}" rx="${Math.round(S * 0.22)}" fill="${BG}"/>` +
      bars +
      `</svg>`,
  )
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const jobs = [
    ['icon-180.png', 180, 0.06],
    ['icon-192.png', 192, 0.06],
    ['icon-512.png', 512, 0.06],
    ['icon-512-maskable.png', 512, 0.18],
  ]
  for (const [name, size, inset] of jobs) {
    await sharp(svg(inset)).resize(size, size).png().toFile(join(OUT, name))
    console.log('wrote', name)
  }
}

main()

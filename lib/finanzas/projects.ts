// Presupuesto por proyecto — sprint-10-perfiles-de-negocio.md. Sin imports
// de next/* ni del alias @/ — ver la nota de independencia en
// sprint-1-movimientos.md §5.1.

import { round2 } from './money'
import type { BudgetProject, Transaction } from './types'

/** Ingreso, gasto y ganancia de UN proyecto, en USD — bruto, sin restar
 *  `principal_usd`/reparto como hace el "gasto real" de Deudas (§0/§4.3:
 *  simplificación deliberada para la v1). Solo `flow_type === 'consumo'` —
 *  mismo filtro que `monthTotals` de transactions.ts: una transferencia
 *  nunca es ganancia ni pérdida, es la misma plata cambiando de cuenta. */
export function projectBalanceUsd(txs: Transaction[], projectId: string): { ingresoUsd: number; gastoUsd: number; gananciaUsd: number } {
  let ingresoUsd = 0
  let gastoUsd = 0
  for (const t of txs) {
    if (t.project_id !== projectId || t.flow_type !== 'consumo') continue
    if (t.type === 'ingreso') ingresoUsd += t.amount_usd
    else if (t.type === 'gasto') gastoUsd += t.amount_usd
  }
  return { ingresoUsd: round2(ingresoUsd), gastoUsd: round2(gastoUsd), gananciaUsd: round2(ingresoUsd - gastoUsd) }
}

/** Cuánto de su objetivo ya gastó (§4.3) — solo el gasto, no el ingreso: un
 *  proyecto que factura bien y gasta poco no debería verse "sobrepasado"
 *  solo por facturar. `pct` sin techo — la UI decide si lo clampea para
 *  una barra o lo muestra crudo ("150% del objetivo"). */
export function projectProgress(project: Pick<BudgetProject, 'target_amount_usd'>, txs: Transaction[], projectId: string): { gastoUsd: number; targetUsd: number; pct: number } {
  const { gastoUsd } = projectBalanceUsd(txs, projectId)
  const targetUsd = project.target_amount_usd
  return { gastoUsd, targetUsd, pct: targetUsd > 0 ? round2((gastoUsd / targetUsd) * 100) : 0 }
}

export interface ProjectComparisonRow {
  project: BudgetProject
  ingresoUsd: number
  gastoUsd: number
  gananciaUsd: number
  targetUsd: number
  pct: number
}

/** La vista de "Comparar" (§4.4) — todos los proyectos con su ganancia neta
 *  y su progreso, de mayor a menor ganancia. El llamador filtra
 *  activos/archivados antes si hace falta (mismo criterio que
 *  `<ProfilesPanel>`/`<PersonasPanel>`: la lista completa, un toggle en la
 *  UI para los archivados). */
export function compareProjects(projects: BudgetProject[], txs: Transaction[]): ProjectComparisonRow[] {
  return projects
    .map(project => {
      const { ingresoUsd, gastoUsd, gananciaUsd } = projectBalanceUsd(txs, project.id)
      const { targetUsd, pct } = projectProgress(project, txs, project.id)
      return { project, ingresoUsd, gastoUsd, gananciaUsd, targetUsd, pct }
    })
    .sort((a, b) => b.gananciaUsd - a.gananciaUsd)
}

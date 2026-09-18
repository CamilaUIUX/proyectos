'use client'

import { useMemo, useState } from 'react'
import { IconCoins, IconGift, IconListNumbers, IconPlus, IconTrash } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { groupByPerson } from '@/lib/finanzas/debts'
import { todayISO } from '@/lib/finanzas/dates'
import { planProgress } from '@/lib/finanzas/plans'
import type { Debt, DebtPlan } from '@/lib/finanzas/types'
import { Btn, EmptyState, Panel } from '../components/ui'
import { DebtSheet } from '../components/debt-sheet'
import { SettleSheet } from '../components/settle-sheet'
import { PlanSheet } from '../components/plan-sheet'
import { PlanDetailSheet } from '../components/plan-detail-sheet'
import { useFinanzas } from '../components/data-context'

function currencyGroups(debts: Debt[]): [string, Debt[]][] {
  const map = new Map<string, Debt[]>()
  for (const d of debts) {
    const list = map.get(d.currency) ?? []
    list.push(d)
    map.set(d.currency, list)
  }
  return Array.from(map.entries())
}

export default function DeudasPage() {
  const { loading, error, debts, people, plans, pendingDebtUsd, monthRepartidoUsd, rates, activeProfile, hidden, waiveDebt, deleteDebt } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => maskAmount(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency), hidden)
  const [debtSheetOpen, setDebtSheetOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<{ personName: string; debts: Debt[] } | null>(null)
  const [planTarget, setPlanTarget] = useState<Debt | null>(null)
  const [planDetailTarget, setPlanDetailTarget] = useState<DebtPlan | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pending = useMemo(() => debts.filter(d => d.status === 'pendiente'), [debts])
  const history = useMemo(() => debts.filter(d => d.status !== 'pendiente'), [debts])
  const today = todayISO()
  const pendingByPerson = useMemo(() => groupByPerson(pending, people, today), [pending, people, today])

  const show = (text: string) => maskAmount(text, hidden)

  async function handleWaive(id: string) {
    const result = await waiveDebt(id)
    if (result.error) setActionError(result.error)
  }
  async function handleDelete(id: string) {
    const result = await deleteDebt(id)
    if (result.error) setActionError(result.error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Deudas</h1>
        <Btn size="sm" onClick={() => setDebtSheetOpen(true)}>
          <IconPlus size={16} /> Nueva
        </Btn>
      </div>

      <Panel>
        <div style={{ fontSize: 13, color: 'var(--fz-ink-2)', fontWeight: 600 }}>Te deben</div>
        <div className="fz-tabular" style={{ fontSize: 28, fontWeight: 700 }}>
          {fmtUsd(pendingDebtUsd)}
        </div>
        {monthRepartidoUsd > 0 && (
          <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
            De lo que gastaste este mes, {fmtUsd(monthRepartidoUsd)} le toca a otros.
          </div>
        )}
      </Panel>

      {plans.length > 0 && (
        <div>
          <div className="fz-section-title">
            <h2 className="fz-truncate">Planes de pago</h2>
          </div>
          <Panel>
            {plans.map((plan, i) => {
              const person = people.find(p => p.id === plan.person_id)
              const progress = planProgress(plan.id, debts)
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanDetailTarget(plan)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '8px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--fz-hairline)',
                    cursor: 'pointer',
                  }}
                >
                  <IconListNumbers size={18} style={{ color: 'var(--fz-ink-3)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="fz-truncate" style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>
                      {plan.concept}
                    </span>
                    <span className="fz-truncate" style={{ display: 'block', fontSize: 12, color: 'var(--fz-ink-3)' }}>
                      {person?.name ?? '—'} · {progress.resolved}/{progress.total} cuotas
                    </span>
                  </span>
                  <span className="fz-tabular" style={{ fontWeight: 700, fontSize: 14 }}>
                    {fmtUsd(progress.pendingUsd)}
                  </span>
                </button>
              )
            })}
          </Panel>
        </div>
      )}

      <Panel>
        {error ? (
          <EmptyState icon={<IconCoins size={22} />} title="No se pudieron cargar las deudas" message={error} />
        ) : !loading && pendingByPerson.length === 0 ? (
          <EmptyState
            icon={<IconCoins size={22} />}
            title="Nadie te debe nada"
            message="Cargá una deuda suelta, o marcá un gasto como compartido desde el quick-add."
          />
        ) : (
          <>
            {actionError && (
              <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {actionError}
              </p>
            )}
            {pendingByPerson.map(({ person, debts: personDebts, pending_usd, oldest_days }) => (
            <div key={person.id} style={{ borderTop: '1px solid var(--fz-hairline)', padding: 'var(--fz-s3) 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>{person.name}</span>
                  {oldest_days != null && oldest_days > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginLeft: 6 }}>
                      la más vieja hace {oldest_days} {oldest_days === 1 ? 'día' : 'días'}
                    </span>
                  )}
                </span>
                <span className="fz-tabular" style={{ fontWeight: 700 }}>
                  {fmtUsd(pending_usd)}
                </span>
              </div>

              {currencyGroups(personDebts).map(([currency, group]) => (
                <div key={currency} style={{ marginBottom: 8 }}>
                  {group.map(d => {
                    // Solo se puede planificar una deuda suelta (sin origen
                    // en un gasto/fijo) que todavía no sea, ella misma, una
                    // cuota de otro plan (sprint-4-planes-de-pago.md §4.3).
                    const canPlan = !d.plan_id && !d.origin_transaction_id
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                        <span style={{ flex: 1, minWidth: 0 }} className="fz-truncate">
                          {d.concept ?? 'Gasto compartido'}
                          {d.plan_id ? ` · Cuota ${d.installment_number}` : ''}
                        </span>
                        <span className="fz-tabular">{show(formatMoney(d.amount, d.currency))}</span>
                        {canPlan && (
                          <button
                            type="button"
                            className="fz-icon-btn"
                            style={{ width: 28, height: 28 }}
                            onClick={() => setPlanTarget(d)}
                            aria-label="Planificar en cuotas"
                            title="Planificar en cuotas"
                          >
                            <IconListNumbers size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="fz-icon-btn"
                          style={{ width: 28, height: 28 }}
                          onClick={() => handleWaive(d.id)}
                          aria-label="Condonar"
                          title="Condonar (perdonar la deuda)"
                        >
                          <IconGift size={14} />
                        </button>
                        {/* Una cuota de un plan no se borra suelta — se
                         *  maneja desde el detalle del plan (B7). */}
                        {!d.plan_id && (
                          <button
                            type="button"
                            className="fz-icon-btn"
                            style={{ width: 28, height: 28, color: 'var(--fz-out-text)' }}
                            onClick={() => handleDelete(d.id)}
                            aria-label="Borrar"
                            title="Borrar"
                          >
                            <IconTrash size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <Btn size="sm" variant="soft" onClick={() => setSettleTarget({ personName: person.name, debts: group })}>
                    Cobrar en {currency}
                  </Btn>
                </div>
              ))}
            </div>
          ))}
          </>
        )}
      </Panel>

      {history.length > 0 && (
        <div>
          <button type="button" className="fz-link" onClick={() => setShowHistory(v => !v)}>
            {showHistory ? 'Ocultar historial' : `Ver historial (${history.length})`}
          </button>
          {showHistory && (
            <Panel style={{ marginTop: 'var(--fz-s3)' }}>
              {history.map(d => {
                const person = people.find(p => p.id === d.person_id)
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      fontSize: 13,
                      borderTop: '1px solid var(--fz-hairline)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }} className="fz-truncate">
                      {person?.name ?? '—'} · {d.concept ?? 'Gasto compartido'}
                      {d.plan_id ? ` · Cuota ${d.installment_number}` : ''}
                    </span>
                    <span className="fz-tabular">{show(formatMoney(d.amount, d.currency))}</span>
                    <span style={{ color: 'var(--fz-ink-3)' }}>{d.status === 'cobrada' ? 'Cobrada' : 'Condonada'}</span>
                  </div>
                )
              })}
            </Panel>
          )}
        </div>
      )}

      <DebtSheet open={debtSheetOpen} onClose={() => setDebtSheetOpen(false)} />
      {settleTarget && (
        <SettleSheet open onClose={() => setSettleTarget(null)} personName={settleTarget.personName} debts={settleTarget.debts} />
      )}
      <PlanSheet open={!!planTarget} onClose={() => setPlanTarget(null)} debt={planTarget} />
      <PlanDetailSheet open={!!planDetailTarget} onClose={() => setPlanDetailTarget(null)} plan={planDetailTarget} />
    </div>
  )
}

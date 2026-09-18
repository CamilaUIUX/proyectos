'use client'

import { useMemo, useState } from 'react'
import { IconPlus, IconReceipt2 } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { currentMonthKey, localDateKey } from '@/lib/finanzas/dates'
import { groupByDay, monthTotals } from '@/lib/finanzas/transactions'
import type { TransactionType } from '@/lib/finanzas/types'
import { Btn, EmptyState, Panel, Skeleton } from '../components/ui'
import { TxRow } from '../components/tx-row'
import { useFinanzas } from '../components/data-context'

/** "Hoy" / "Ayer" / "17 de agosto" — agrupación por día (contexto_ui_finanzas.md §17). */
function formatDayLabel(dateStr: string): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dateStr === localDateKey(today)) return 'Hoy'
  if (dateStr === localDateKey(yesterday)) return 'Ayer'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'long' })
}

type TypeFilter = TransactionType | 'todos'

export default function MovimientosPage() {
  // `feedTx`, no `allTx`: un ajuste de valor de una cuenta de inversión mueve
  // el saldo pero no se lista como movimiento (sprint-7 §4.7).
  const { loading, error: loadError, feedTx, categories, accounts, rates, activeProfile, hidden, openQuickAdd } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const [month, setMonth] = useState(currentMonthKey())
  const [type, setType] = useState<TypeFilter>('todos')
  const [accountId, setAccountId] = useState('todas')
  const [categoryId, setCategoryId] = useState('todas')

  const filtered = useMemo(
    () =>
      feedTx.filter(t => {
        if (t.date.slice(0, 7) !== month) return false
        if (type !== 'todos' && t.type !== type) return false
        if (accountId !== 'todas' && t.account_id !== accountId && t.to_account_id !== accountId) return false
        if (categoryId !== 'todas' && t.category_id !== categoryId) return false
        return true
      }),
    [feedTx, month, type, accountId, categoryId]
  )

  const totals = useMemo(() => monthTotals(filtered), [filtered])
  const groups = useMemo(() => groupByDay(filtered), [filtered])
  const show = (text: string) => maskAmount(text, hidden)
  const fmtUsd = (usd: number, opts?: { signed?: boolean }) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency, opts))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--fz-s2)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Movimientos</h1>
        <Btn size="sm" onClick={() => openQuickAdd()}>
          <IconPlus size={16} /> Nuevo
        </Btn>
      </div>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--fz-s2)' }}>
          <input type="month" className="fz-input" style={{ width: 'auto' }} value={month} onChange={e => setMonth(e.target.value)} />
          <select className="fz-input" style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value as TypeFilter)}>
            <option value="todos">Todos los tipos</option>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <select className="fz-input" style={{ width: 'auto' }} value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="todas">Todas las cuentas</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className="fz-input" style={{ width: 'auto' }} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <div className="fz-tiles">
        <div className="fz-tile fz-tile--in">
          <div className="fz-tile__label">Ingresado</div>
          <div className="fz-tile__value fz-tabular">{fmtUsd(totals.ingreso_usd)}</div>
        </div>
        <div className="fz-tile fz-tile--out">
          <div className="fz-tile__label">Gastado</div>
          <div className="fz-tile__value fz-tabular">{fmtUsd(totals.gasto_usd)}</div>
        </div>
      </div>

      <Panel>
        {loadError ? (
          <EmptyState icon={<IconReceipt2 size={22} />} title="No se pudieron cargar los movimientos" message={loadError} />
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon={<IconReceipt2 size={22} />} title="Nada por acá" message="Cambiá el filtro o registrá un movimiento nuevo." />
        ) : (
          groups.map(g => (
            <div key={g.date}>
              <div className="fz-day-header">
                <span>{formatDayLabel(g.date)}</span>
                <span className="fz-tabular">{fmtUsd(g.net_usd, { signed: true })}</span>
              </div>
              {g.transactions.map(tx => (
                <TxRow key={tx.id} tx={tx} onClick={() => openQuickAdd({ editing: tx })} />
              ))}
            </div>
          ))
        )}
      </Panel>
    </div>
  )
}

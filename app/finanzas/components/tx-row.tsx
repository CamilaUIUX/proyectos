'use client'

import { IconUserCircle } from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import type { Transaction } from '@/lib/finanzas/types'
import { CategoryIcon, TransferIcon } from './category-icon'
import { useFinanzas } from './data-context'

/** Fila de movimiento — aparece en Home ("Últimos movimientos") y en
 * Movimientos, con el mismo formato (contexto_ui_finanzas.md §6).
 * El toggle "Ocultar montos" (Home) enmascaraba los totales pero no cada
 * fila individual — cada movimiento seguía mostrando su monto exacto acá,
 * bug real de la revisión del Sprint 4. */
export function TxRow({ tx, onClick }: { tx: Transaction; onClick?: () => void }) {
  const { categories, accounts, people, settledByTxId, recurring, rates, activeProfile, hidden } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const category = categories.find(c => c.id === tx.category_id)
  const account = accounts.find(a => a.id === tx.account_id)
  const toAccount = tx.to_account_id ? accounts.find(a => a.id === tx.to_account_id) : undefined

  // Un ingreso que saldó una o más deudas se muestra como "Cobro de
  // <persona>", no como "Ingreso" — sprint-2-deudas.md §5. Todas las
  // deudas de un mismo cobro son siempre de la misma persona (§4.3), así
  // que alcanza con mirar la primera.
  const settled = settledByTxId.get(tx.id)
  const settledPerson = settled?.length ? people.find(p => p.id === settled[0].person_id) : undefined

  // Un movimiento generado por un fijo muestra su nombre en el subtítulo,
  // en vez de la descripción libre — sprint-3-fijos.md §5.
  const recurringTemplate = tx.recurring_id ? recurring.find(r => r.id === tx.recurring_id) : undefined

  const isTransfer = tx.type === 'transferencia'
  const title = settledPerson
    ? `Cobro de ${settledPerson.name}`
    : isTransfer
      ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
      : (category?.name ?? (tx.type === 'ingreso' ? 'Ingreso' : 'Gasto'))
  const subtitle = settledPerson
    ? account?.name || ''
    : isTransfer
      ? 'Transferencia'
      : recurringTemplate
        ? recurringTemplate.name
        : tx.description || account?.name || ''

  const amountClass = tx.type === 'ingreso' ? 'fz-tx-row__amount--in' : tx.type === 'gasto' ? 'fz-tx-row__amount--out' : ''
  const displayAmount = fromUsd(tx.amount_usd, displayCurrency, rates)
  const amountText =
    tx.type === 'gasto'
      ? formatMoney(-displayAmount, displayCurrency, { signed: true })
      : tx.type === 'ingreso'
        ? formatMoney(displayAmount, displayCurrency, { signed: true })
        : formatMoney(displayAmount, displayCurrency)

  return (
    <button
      type="button"
      className="fz-tx-row"
      onClick={onClick}
      style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', padding: 'var(--fz-s2) 0' }}
    >
      {settledPerson ? (
        <div className="fz-icon-chip">
          <IconUserCircle size={20} stroke={1.8} />
        </div>
      ) : isTransfer ? (
        <TransferIcon />
      ) : (
        <CategoryIcon icon={category?.icon} name={category?.name} />
      )}
      <div className="fz-tx-row__body">
        <div className="fz-tx-row__title">{title}</div>
        <div className="fz-tx-row__subtitle">{subtitle}</div>
      </div>
      <div>
        <div className={`fz-tx-row__amount fz-tabular ${amountClass}`}>{maskAmount(amountText, hidden)}</div>
        {tx.currency !== displayCurrency && (
          <div className="fz-tx-row__meta fz-tabular">{maskAmount(formatMoney(tx.amount, tx.currency), hidden)}</div>
        )}
      </div>
    </button>
  )
}

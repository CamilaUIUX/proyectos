'use client'

import { useMemo, useState } from 'react'
import { IconArchive, IconArrowDown, IconArrowUp, IconChartLine, IconPlus, IconRestore, IconWallet } from '@tabler/icons-react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { todayISO } from '@/lib/finanzas/dates'
import { CURRENCIES, type Account, type AccountWithBalance, type Currency } from '@/lib/finanzas/types'
import { Btn, EmptyState, Panel, Sheet } from '../components/ui'
import { CurrencyIcon } from '../components/currency-icon'
import { AccountValueSheet } from '../components/account-value-sheet'
import { useFinanzas } from '../components/data-context'

function AccountForm({
  editing,
  hasTx,
  frozenInvestment,
  onClose,
}: {
  editing: Account | null
  hasTx: boolean
  /** La cuenta ya tiene un ajuste de valor: el toggle "Cuenta de inversión"
   *  se muestra como indicador fijo, no se puede destildar (§4.8). */
  frozenInvestment: boolean
  onClose: () => void
}) {
  const { createAccount, updateAccount } = useFinanzas()
  const [name, setName] = useState(editing?.name ?? '')
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? 'USD')
  const [initialBalance, setInitialBalance] = useState(editing ? String(editing.initial_balance) : '')
  const [initialDate, setInitialDate] = useState(editing?.initial_balance_date ?? todayISO())
  const [isInvestment, setIsInvestment] = useState(editing?.is_investment ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre a la cuenta.')
    const balance = parseDecimalInput(initialBalance) ?? 0

    setSubmitting(true)
    const nextInvestment = frozenInvestment ? true : isInvestment
    const result = editing
      ? await updateAccount(editing.id, {
          name: name.trim(),
          currency,
          initial_balance: balance,
          initial_balance_date: initialDate,
          // Solo se manda si cambió — así una base sin la migración §17 no
          // rompe al editar una cuenta normal.
          ...(nextInvestment !== (editing.is_investment ?? false) ? { is_investment: nextInvestment } : {}),
        })
      : await createAccount({
          name: name.trim(),
          currency,
          initial_balance: balance,
          initial_balance_date: initialDate,
          ...(isInvestment ? { is_investment: true } : {}),
        })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={editing ? 'Editar cuenta' : 'Nueva cuenta'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
        <div>
          <label className="fz-field-label" htmlFor="fz-acc-name">
            Nombre
          </label>
          <input id="fz-acc-name" className="fz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Banco Unión" />
        </div>

        <div>
          <label className="fz-field-label" htmlFor="fz-acc-currency">
            Moneda
          </label>
          <select
            id="fz-acc-currency"
            className="fz-input"
            value={currency}
            onChange={e => setCurrency(e.target.value as Currency)}
            disabled={hasTx}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {hasTx && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              No se puede cambiar: esta cuenta ya tiene movimientos.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
          <div style={{ flex: 1 }}>
            <label className="fz-field-label" htmlFor="fz-acc-balance">
              Saldo inicial
            </label>
            <input
              id="fz-acc-balance"
              className="fz-input"
              inputMode="decimal"
              value={initialBalance}
              onChange={e => setInitialBalance(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="fz-field-label" htmlFor="fz-acc-date">
              Desde
            </label>
            <input id="fz-acc-date" type="date" className="fz-input" value={initialDate} onChange={e => setInitialDate(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: -8 }}>
          Solo para tu referencia — el saldo siempre suma todos los movimientos de la cuenta, sin importar su fecha.
        </p>

        {frozenInvestment ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fz-ink-2)' }}>
            <IconChartLine size={16} />
            Cuenta de inversión · ya tiene ajustes de valor, no se puede sacar
          </div>
        ) : (
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={isInvestment} onChange={e => setIsInvestment(e.target.checked)} />
              Cuenta de inversión
            </label>
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              Sus subas y bajas de valor no cuentan como gasto ni ingreso del mes. Se cargan desde &ldquo;Actualizar valor&rdquo;.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
            {error}
          </p>
        )}

        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cuenta'}
        </Btn>
      </div>
    </Sheet>
  )
}

function AccountRow({
  account,
  hasTx,
  onEdit,
  onUpdateValue,
  onError,
}: {
  account: AccountWithBalance
  hasTx: boolean
  onEdit: () => void
  onUpdateValue: () => void
  onError: (message: string) => void
}) {
  const { deleteOrArchiveAccount, reorderAccounts, accounts, rates, activeProfile, hidden } = useFinanzas()
  const displayCurrency = activeProfile?.display_currency ?? 'USD'

  const activeSorted = accounts.filter(a => !a.archived).sort((a, b) => a.sort_order - b.sort_order)
  const idx = activeSorted.findIndex(a => a.id === account.id)

  async function move(direction: -1 | 1) {
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= activeSorted.length) return
    const reordered = [...activeSorted]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    const result = await reorderAccounts(reordered.map((a, i) => ({ id: a.id, sort_order: i })))
    if (result.error) onError(result.error)
  }

  async function handleDelete() {
    const result = await deleteOrArchiveAccount(account.id)
    if (result.error) onError(result.error)
  }

  return (
    <div className="fz-tx-row">
      <CurrencyIcon currency={account.currency} size={40} />
      <div className="fz-tx-row__body">
        <div className="fz-tx-row__title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="fz-truncate">{account.name}</span>
          {account.is_investment && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--fz-ink-3)', fontWeight: 400 }}>
              <IconChartLine size={12} /> Inversión
            </span>
          )}
        </div>
        <div className="fz-tx-row__subtitle">{account.currency}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="fz-tabular" style={{ fontWeight: 700 }}>
          {maskAmount(formatMoney(account.balance, account.currency), hidden)}
        </div>
        {account.currency !== displayCurrency && (
          <div className="fz-tx-row__meta fz-tabular">
            ≈ {maskAmount(formatMoney(fromUsd(account.balance_usd, displayCurrency, rates), displayCurrency), hidden)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 4 }}>
        <button type="button" className="fz-icon-btn" style={{ width: 28, height: 28 }} onClick={() => move(-1)} disabled={idx <= 0} aria-label="Subir">
          <IconArrowUp size={14} />
        </button>
        <button
          type="button"
          className="fz-icon-btn"
          style={{ width: 28, height: 28 }}
          onClick={() => move(1)}
          disabled={idx < 0 || idx >= activeSorted.length - 1}
          aria-label="Bajar"
        >
          <IconArrowDown size={14} />
        </button>
      </div>
      {account.is_investment && (
        <button type="button" className="fz-icon-btn" onClick={onUpdateValue} aria-label="Actualizar valor" title="Actualizar valor">
          <IconChartLine size={16} />
        </button>
      )}
      <button type="button" className="fz-icon-btn" onClick={onEdit} aria-label="Editar">
        <IconWallet size={16} />
      </button>
      <button
        type="button"
        className="fz-icon-btn"
        style={{ color: 'var(--fz-out-text)' }}
        onClick={handleDelete}
        aria-label={hasTx ? 'Archivar' : 'Eliminar'}
      >
        <IconArchive size={16} />
      </button>
    </div>
  )
}

export default function CuentasPage() {
  const { accounts, allTx, investmentAdjustmentAccounts, loading, error: loadError, hidden, updateAccount } = useFinanzas()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [valueAccount, setValueAccount] = useState<AccountWithBalance | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const active = useMemo(() => accounts.filter(a => !a.archived).sort((a, b) => a.sort_order - b.sort_order), [accounts])
  const archived = useMemo(() => accounts.filter(a => a.archived), [accounts])

  function hasTx(accountId: string) {
    return allTx.some(t => t.account_id === accountId || t.to_account_id === accountId)
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(a: Account) {
    setEditing(a)
    setFormOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Cuentas</h1>
        <Btn size="sm" onClick={openCreate}>
          <IconPlus size={16} /> Nueva
        </Btn>
      </div>

      {actionError && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {actionError}
        </p>
      )}

      <Panel>
        {loadError ? (
          <EmptyState icon={<IconWallet size={22} />} title="No se pudieron cargar las cuentas" message={loadError} />
        ) : loading ? null : active.length === 0 ? (
          <EmptyState icon={<IconWallet size={22} />} title="Sin cuentas todavía" message="Creá la primera para empezar a registrar movimientos." />
        ) : (
          active.map(a => (
            <AccountRow
              key={a.id}
              account={a}
              hasTx={hasTx(a.id)}
              onEdit={() => openEdit(a)}
              onUpdateValue={() => setValueAccount(a)}
              onError={setActionError}
            />
          ))
        )}
      </Panel>

      {archived.length > 0 && (
        <div>
          <button type="button" className="fz-link" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
          </button>
          {showArchived && (
            <Panel style={{ marginTop: 'var(--fz-s3)' }}>
              {archived.map(a => (
                <div key={a.id} className="fz-tx-row">
                  <CurrencyIcon currency={a.currency} size={40} />
                  <div className="fz-tx-row__body">
                    <div className="fz-tx-row__title">{a.name}</div>
                    <div className="fz-tx-row__subtitle">{a.currency} · archivada</div>
                  </div>
                  <div className="fz-tabular" style={{ fontWeight: 700 }}>
                    {maskAmount(formatMoney(a.balance, a.currency), hidden)}
                  </div>
                  <button
                    type="button"
                    className="fz-icon-btn"
                    onClick={async () => {
                      const result = await updateAccount(a.id, { archived: false })
                      if (result.error) setActionError(result.error)
                    }}
                    aria-label="Reactivar"
                  >
                    <IconRestore size={16} />
                  </button>
                </div>
              ))}
            </Panel>
          )}
        </div>
      )}

      {formOpen && (
        <AccountForm
          editing={editing}
          hasTx={editing ? hasTx(editing.id) : false}
          frozenInvestment={editing ? investmentAdjustmentAccounts.has(editing.id) : false}
          onClose={() => setFormOpen(false)}
        />
      )}

      <AccountValueSheet open={valueAccount != null} account={valueAccount} onClose={() => setValueAccount(null)} />
    </div>
  )
}

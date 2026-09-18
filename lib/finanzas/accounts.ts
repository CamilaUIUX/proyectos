// Saldo de cuenta y patrimonio — siempre derivados de los movimientos,
// nunca guardados (sprint-1-movimientos.md §4.1 / §4.3). Sin imports de
// next/* — ver §5.1.

import { round2, roundFor } from './money'
import { toUsd } from './rates'
import type { Account, AccountWithBalance, RatesMap, Transaction } from './types'

/** Saldo de TODAS las cuentas en un solo recorrido de los movimientos —
 *  `Map<accountId, saldo>` en la moneda nativa de cada una.
 *
 *  Un solo `for` sobre `transactions` en vez de uno por cuenta (antes era
 *  O(cuentas × movimientos); ahora O(movimientos)) — igual que
 *  `computeBalances` de la referencia (lib/finanzas/accounts.ts).
 *
 *  A propósito NO filtra por `initial_balance_date`: esa columna es
 *  metadata ("el saldo inicial es a partir de esta fecha"), no un corte
 *  del libro contable — todo movimiento de la cuenta suma o resta, sin
 *  importar su fecha. Aclarado en la revisión del Sprint 2, porque el
 *  nombre del campo (y el label "Desde" del formulario) puede sugerir lo
 *  contrario. Filtrar por fecha rompería la regla más simple que sostiene
 *  todo el modelo: el saldo es la suma de TODO lo registrado, sin lógica
 *  condicional que se pueda desincronizar (§4.1 del sprint 1). */
export function computeBalances(accounts: Pick<Account, 'id' | 'currency' | 'initial_balance'>[], transactions: Transaction[]): Map<string, number> {
  const balances = new Map<string, number>()
  const currencyById = new Map<string, Account['currency']>()
  for (const a of accounts) {
    balances.set(a.id, a.initial_balance)
    currencyById.set(a.id, a.currency)
  }

  for (const tx of transactions) {
    if (balances.has(tx.account_id)) {
      const delta = tx.type === 'ingreso' ? tx.amount : -tx.amount // gasto y transferencia salen
      balances.set(tx.account_id, balances.get(tx.account_id)! + delta)
    }
    if (tx.type === 'transferencia' && tx.to_account_id && balances.has(tx.to_account_id)) {
      balances.set(tx.to_account_id, balances.get(tx.to_account_id)! + (tx.to_amount ?? tx.amount))
    }
  }

  for (const [id, value] of balances) {
    balances.set(id, roundFor(value, currencyById.get(id) ?? 'USD'))
  }
  return balances
}

/** Saldo de UNA cuenta, en su propia moneda. Conveniencia sobre
 *  `computeBalances` para los pocos sitios que solo necesitan una. */
export function computeBalance(account: Pick<Account, 'id' | 'currency' | 'initial_balance'>, transactions: Transaction[]): number {
  return computeBalances([account], transactions).get(account.id) ?? roundFor(account.initial_balance, account.currency)
}

/** Todas las cuentas con su saldo derivado y su equivalente en USD a la
 *  tasa ACTUAL (distinto de las transacciones, que congelan la suya —
 *  §4.3). No filtra archivadas: eso lo decide quien llama. */
export function withBalances(accounts: Account[], transactions: Transaction[], rates: RatesMap): AccountWithBalance[] {
  const balances = computeBalances(accounts, transactions)
  return accounts.map(account => {
    const balance = balances.get(account.id) ?? roundFor(account.initial_balance, account.currency)
    return {
      ...account,
      balance,
      balance_usd: round2(toUsd(balance, account.currency, rates)),
    }
  })
}

/** Patrimonio total: suma de los saldos no archivados, convertidos a USD hoy. */
export function totalUsd(accountsWithBalances: Pick<AccountWithBalance, 'balance_usd' | 'archived'>[]): number {
  return round2(accountsWithBalances.filter(a => !a.archived).reduce((sum, a) => sum + a.balance_usd, 0))
}

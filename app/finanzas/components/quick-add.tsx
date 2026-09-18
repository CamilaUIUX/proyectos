'use client'

import { useMemo, useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { formatMoney, maskAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/dates'
import { availableFrom, consumesBalance } from '@/lib/finanzas/transactions'
import { fromUsd, toUsd, usdPerUnit } from '@/lib/finanzas/rates'
import { SAVINGS_REASON_LABEL } from '@/lib/finanzas/savings'
import { decimalsFor, type SavingsReason, type Transaction, type TransactionType } from '@/lib/finanzas/types'
import { CategoryIcon } from './category-icon'
import { SplitEditor, type SplitRow } from './split-editor'
import { useFinanzas } from './data-context'
import { Btn, Segmented, Sheet } from './ui'

const TITLES: Record<TransactionType, string> = {
  gasto: 'Nuevo gasto',
  ingreso: 'Nuevo ingreso',
  transferencia: 'Nueva transferencia',
}

/** El componente más importante del Sprint 1 — meta: registrar en menos de
 * 10 segundos (sprint-1-movimientos.md §1 / §7 de contexto_ui_finanzas.md
 * del repo de referencia). Vive montado siempre en el layout; lo abre
 * cualquier pantalla vía useFinanzas().openQuickAdd(). */
export function QuickAdd() {
  const { quickAdd, closeQuickAdd, profiles, activeProfile } = useFinanzas()
  const base = quickAdd.editing ? `Editar ${quickAdd.editing.type}` : TITLES[quickAdd.lockType ?? 'gasto']
  // Con 2+ perfiles, el título recuerda a cuál cae esto — un movimiento
  // cargado en el equivocado no se puede mover entre perfiles después,
  // solo borrar y volver a cargar (§4.6 del sprint 8).
  const title = profiles.length > 1 && activeProfile ? `${base} · ${activeProfile.name}` : base

  return (
    <Sheet open={quickAdd.open} onClose={closeQuickAdd} title={title}>
      {/* `key` fuerza un montaje nuevo cada vez que cambia lo que se está
       * editando (o cada apertura genérica): el formulario arranca con sus
       * valores directo de las props, sin un efecto que los sincronice
       * después del primer render. */}
      {quickAdd.open && (
        <QuickAddForm key={quickAdd.editing?.id ?? quickAdd.lockType ?? 'new'} editing={quickAdd.editing ?? null} lockType={quickAdd.lockType} />
      )}
    </Sheet>
  )
}

function QuickAddForm({ editing, lockType }: { editing: Transaction | null; lockType?: TransactionType }) {
  const {
    closeQuickAdd,
    accounts,
    activeAccounts,
    categories,
    rates,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    createSharedExpense,
    availableForCategory,
    budgetLineCategories,
    budgetView,
    extendBudget,
    savingsGoals,
    savingsByAccount,
    savingsInAccount,
    budgetProjects,
    activeProfile,
    hidden,
  } = useFinanzas()
  // Sprint 10 §4.6 — el bloqueo de presupuesto es el único monto en USD que
  // este archivo muestra; se convierte a la moneda del perfil, igual que en
  // Presupuesto/Home/Ahorro/Deudas. Sin `show()`: este mensaje ya se
  // mostraba sin enmascarar antes de este sprint, no se le cambia eso acá.
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number) => formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency)
  const isEditing = Boolean(editing)

  const [type, setType] = useState<TransactionType>(editing?.type ?? lockType ?? 'gasto')
  const [accountId, setAccountId] = useState(() => {
    if (editing?.account_id) return editing.account_id
    // Para un gasto/ingreso, arrancar en la primera cuenta que NO sea de
    // inversión (§4.6); esas solo se cargan por "Actualizar valor".
    const t0 = editing?.type ?? lockType ?? 'gasto'
    const pool = t0 === 'transferencia' ? activeAccounts : activeAccounts.filter(a => !a.is_investment)
    return pool[0]?.id ?? activeAccounts[0]?.id ?? ''
  })
  const [toAccountId, setToAccountId] = useState(editing?.to_account_id ?? '')
  const [amountRaw, setAmountRaw] = useState(editing ? String(editing.amount) : '')
  const [toAmountRaw, setToAmountRaw] = useState(editing?.to_amount != null ? String(editing.to_amount) : '')
  // En edición el valor guardado es el real y no se recalcula solo; en alta
  // nueva empieza sin tocar, así la sugerencia (más abajo) puede seguir al
  // monto de origen hasta que el usuario la edite a mano.
  const [toAmountTouched, setToAmountTouched] = useState(isEditing)
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null)
  // Sprint 10: a qué proyecto de negocio pertenece, si a alguno — solo se
  // ofrece si el perfil tiene proyectos activos (§0/§4.2 de ese sprint).
  const [projectId, setProjectId] = useState<string | null>(editing?.project_id ?? null)
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [description, setDescription] = useState(editing?.description ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // "Es compartido" — solo para un gasto nuevo (sprint-2-deudas.md §0: es
  // la casilla de emergencia mientras no exista Fijos; editar un gasto que
  // ya generó deudas no está en el alcance de este sprint).
  const [shared, setShared] = useState(false)
  const [splits, setSplits] = useState<SplitRow[]>([])
  // Bloqueo de presupuesto (§4.6 del sprint 5) — solo un gasto NUEVO que pasa
  // el disponible de la línea de su categoría. Editar no dispara el bloqueo
  // en esta versión (recorte deliberado).
  const [budgetBlock, setBudgetBlock] = useState<{
    faltanteUsd: number
    lineId: string
    title: string
    spentUsd: number
    effectiveUsd: number
  } | null>(null)
  // Retiro de ahorro (§4.7 del sprint 6): un gasto etiquetado con un plan y su
  // motivo. Se ofrece solo si la cuenta tiene algo apartado.
  const [savingsMode, setSavingsMode] = useState(Boolean(editing?.savings_goal_id))
  const [savingsGoalId, setSavingsGoalId] = useState<string | null>(editing?.savings_goal_id ?? null)
  const [savingsReason, setSavingsReason] = useState<SavingsReason | null>(editing?.savings_reason ?? null)

  const account = accounts.find(a => a.id === accountId)
  const toAccount = accounts.find(a => a.id === toAccountId)
  const currency = account?.currency ?? 'USD'
  const amount = parseDecimalInput(amountRaw) ?? 0
  const show = (t: string) => maskAmount(t, hidden)

  const showSelector = isEditing || !lockType
  const showCap = consumesBalance(type)
  const balanceAvail = account
    ? availableFrom(account.balance, editing ? { type: editing.type, account_id: editing.account_id, amount: editing.amount } : undefined, accountId)
    : 0

  // Lo apartado en esta cuenta, revirtiendo el efecto del propio retiro si es
  // lo que se está editando (su −monto ya está descontado del apartado).
  const editingRetiroHere = editing?.savings_flow === 'retiro' && editing.account_id === accountId
  const apartadoInAccount = account
    ? (savingsByAccount.get(accountId) ?? 0) + (editingRetiroHere ? editing!.amount : 0)
    : 0

  // Planes con plata apartada en ESTA cuenta — los únicos de los que se puede
  // retirar acá (§4.6: no se saca lo que no se puso).
  const savingsOptions = useMemo(
    () =>
      savingsGoals
        .filter(g => !g.archived)
        .map(g => ({
          goal: g,
          has:
            savingsInAccount(g.id, accountId) +
            (editingRetiroHere && editing!.savings_goal_id === g.id ? editing!.amount : 0),
        }))
        .filter(o => o.has > 1e-9),
    [savingsGoals, accountId, savingsInAccount, editingRetiroHere, editing]
  )
  const canWithdraw = type === 'gasto' && apartadoInAccount > 1e-9 && (savingsOptions.length > 0 || Boolean(editing?.savings_goal_id))
  // `canWithdraw` en el AND: si `savingsMode` quedó encendido de una cuenta
  // anterior y la nueva no tiene nada apartado, no se trata como retiro (si no
  // el tope caía a 0 sin explicación — el bloque de chips ya no se muestra).
  const withdrawing = savingsMode && canWithdraw
  const goalHasHere = withdrawing && savingsGoalId ? savingsOptions.find(o => o.goal.id === savingsGoalId)?.has ?? 0 : 0

  // El tope: un gasto común no puede tocar lo apartado (piso de ahorro); un
  // retiro declarado se acota a lo que ese plan tiene en la cuenta.
  const available = withdrawing && savingsGoalId ? Math.min(goalHasHere, balanceAvail) : showCap ? balanceAvail - apartadoInAccount : balanceAvail
  const over = showCap && amount > available + 1e-9

  // El campo "Monto recibido" aparece en toda transferencia con destino: si
  // las monedas difieren es obligatorio (cuánto llegó de verdad); si son la
  // misma es opcional, para anotar la comisión que se comió el banco
  // (mandás 100, llegan 98).
  const isTransferWithDest = type === 'transferencia' && Boolean(toAccount)
  const crossCurrency = isTransferWithDest && toAccount!.currency !== currency
  const showToAmount = isTransferWithDest

  // Sugerencia derivada (origen → USD → destino) solo entre monedas
  // distintas; en la misma moneda el default es "igual que lo enviado", así
  // que el campo queda vacío y el placeholder muestra el monto de origen.
  // Nunca guardada en estado: se recalcula sola en cada render mientras no se
  // toque a mano, sin depender de un efecto.
  let suggestedToAmount = ''
  if (crossCurrency && toAccount) {
    const usd = toUsd(amount, currency, rates)
    const suggested = usd / usdPerUnit(toAccount.currency, rates)
    suggestedToAmount = suggested > 0 ? suggested.toFixed(decimalsFor(toAccount.currency)) : ''
  }
  const toAmountDisplay = toAmountTouched ? toAmountRaw : suggestedToAmount

  const categoryOptions = useMemo(
    () => categories.filter(c => c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto') && !c.archived),
    [categories, type]
  )
  // Un proyecto archivado no se ofrece para movimientos nuevos, pero uno ya
  // tageado a uno sigue viéndose al editar (mismo criterio que un ahorro
  // archivado en `withdrawing`, más abajo).
  const activeProjects = useMemo(
    () => budgetProjects.filter(p => !p.archived || p.id === editing?.project_id),
    [budgetProjects, editing]
  )

  // Las cuentas de inversión no se listan para Gasto ni Ingreso — sus subas y
  // bajas de valor se cargan desde "Actualizar valor" (sprint-7 §4.6). En una
  // transferencia sí (aportar/retirar plata real de una inversión es legítimo).
  const originAccounts = useMemo(
    () => (type === 'transferencia' ? activeAccounts : activeAccounts.filter(a => !a.is_investment)),
    [activeAccounts, type]
  )

  async function handleSubmit(opts?: { skipBudgetCheck?: boolean }) {
    setFormError(null)
    if (!amount || amount <= 0) return setFormError('Ingresa un monto válido.')
    if (!accountId) return setFormError('Elegí una cuenta.')
    if (type === 'transferencia' && !toAccountId) return setFormError('Elegí la cuenta destino.')
    if (over) {
      return setFormError(
        withdrawing && savingsGoalId
          ? `Este ahorro tiene ${formatMoney(available, currency)} en esta cuenta.`
          : `El monto supera el disponible (${formatMoney(available, currency)}).`
      )
    }
    if (withdrawing) {
      if (!savingsGoalId) return setFormError('Elegí de qué ahorro retirás.')
      if (!savingsReason) return setFormError('Elegí por qué retirás.')
    }

    // Bloqueo de presupuesto: solo un gasto nuevo con categoría que tiene línea.
    if (!opts?.skipBudgetCheck && !isEditing && type === 'gasto' && categoryId) {
      const avail = availableForCategory(categoryId)
      if (avail != null) {
        const amountUsd = toUsd(amount, currency, rates)
        const faltanteUsd = Math.round((amountUsd - avail) * 100) / 100
        if (faltanteUsd > 0) {
          const lc = budgetLineCategories.find(x => x.category_id === categoryId)
          const view = lc ? budgetView.lines.find(v => v.line_id === lc.line_id) : undefined
          if (view) {
            setBudgetBlock({
              faltanteUsd,
              lineId: view.line_id,
              title: view.title,
              spentUsd: view.spent_usd,
              effectiveUsd: view.effective_usd ?? 0,
            })
            return
          }
        }
      }
    }

    let toAmt: number | null = null
    if (crossCurrency) {
      toAmt = parseDecimalInput(toAmountDisplay)
      if (!toAmt || toAmt <= 0) return setFormError('Ingresa el monto recibido.')
    } else if (isTransferWithDest && toAmountTouched && toAmountRaw.trim() !== '') {
      // Comisión declarada en una transferencia de la misma moneda: opcional,
      // pero si se anota tiene que ser > 0 y no mayor que lo enviado.
      toAmt = parseDecimalInput(toAmountRaw)
      if (!toAmt || toAmt <= 0) return setFormError('El monto recibido tiene que ser mayor a cero.')
      if (toAmt > amount) return setFormError('En la misma moneda no puede llegar más de lo que salió.')
    }

    setSubmitting(true)

    let result: { error?: string }
    if (!isEditing && type === 'gasto' && shared && splits.length > 0) {
      result = await createSharedExpense({
        date,
        account_id: accountId,
        category_id: categoryId,
        amount,
        description: description.trim() || null,
        splits: splits.map(s => ({ person_id: s.person_id, amount: parseDecimalInput(s.amountRaw) ?? 0 })),
      })
    } else {
      // Los campos de ahorro solo se mandan cuando el movimiento es (o era) un
      // gasto: así editar la descripción de un aporte/traslado no le toca la
      // etiqueta (§4.7). En un gasto siempre se manda — `null` lo destaga si
      // se apagó el toggle.
      const touchesSavings = type === 'gasto' || editing?.savings_flow === 'retiro'
      const savingsFields = touchesSavings
        ? {
            savings_goal_id: withdrawing ? savingsGoalId : null,
            savings_reason: withdrawing ? savingsReason : null,
          }
        : {}
      const payload = {
        type,
        date,
        account_id: accountId,
        to_account_id: type === 'transferencia' ? toAccountId : null,
        category_id: type === 'transferencia' ? null : categoryId,
        amount,
        to_amount: toAmt,
        description: description.trim() || null,
        project_id: type === 'transferencia' ? null : projectId,
        ...savingsFields,
      }
      result = isEditing && editing ? await updateTransaction(editing, payload) : await createTransaction(payload)
    }

    setSubmitting(false)
    if (result.error) return setFormError(result.error)
    closeQuickAdd()
  }

  async function handleDelete() {
    if (!editing) return
    setSubmitting(true)
    const result = await deleteTransaction(editing.id)
    setSubmitting(false)
    if (result.error) return setFormError(result.error)
    closeQuickAdd()
  }

  // Un aporte o un traslado de ahorro se maneja desde Ahorros — el quick-add no
  // es el lugar para tocarle el monto o las cuentas (sprint-6-ahorro.md §4.7).
  if (editing && (editing.savings_flow === 'aporte' || editing.savings_flow === 'traslado')) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
        <p style={{ fontSize: 14, color: 'var(--fz-ink-2)' }}>
          Este movimiento es {editing.savings_flow === 'aporte' ? 'un aporte' : 'un traslado'} de ahorro. Se edita o se
          deshace desde la pantalla de Ahorros, no acá.
        </p>
        <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
          <button type="button" className="fz-icon-btn" style={{ color: 'var(--fz-out-text)' }} onClick={handleDelete} disabled={submitting} aria-label="Borrar movimiento">
            <IconTrash size={18} />
          </button>
          <Btn variant="soft" block onClick={closeQuickAdd}>
            Entendido
          </Btn>
        </div>
        {formError && (
          <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
            {formError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      {showSelector && (
        <Segmented
          value={type}
          onChange={t => {
            setType(t)
            // Pasar a Gasto/Ingreso con una cuenta de inversión elegida:
            // esa cuenta ya no es una opción válida (§4.6) — se cae a la
            // primera regular y se limpia el monto (como al cambiar de cuenta).
            if (t !== 'transferencia' && account?.is_investment) {
              setAccountId(activeAccounts.find(a => !a.is_investment)?.id ?? '')
              setAmountRaw('')
            }
          }}
          options={[
            { value: 'gasto', label: 'Gasto' },
            { value: 'ingreso', label: 'Ingreso' },
            { value: 'transferencia', label: 'Transferencia' },
          ]}
        />
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-qa-account">
          Cuenta
        </label>
        <select
          id="fz-qa-account"
          className="fz-input"
          value={accountId}
          onChange={e => {
            // Cambiar de cuenta puede cambiar la moneda — sin limpiar
            // "Monto" acá, el mismo número tipeado quedaba reinterpretado
            // en silencio bajo la moneda nueva (ej. "100" pensado en USD
            // pasaba a guardarse como 100 BOB, ≈7 veces menos). Bug real
            // encontrado en la revisión del Sprint 3. Mismo criterio que ya
            // se aplicaba al "monto recibido" de una transferencia.
            setAccountId(e.target.value)
            setAmountRaw('')
            setToAmountTouched(false)
            setToAmountRaw('')
            // El retiro de ahorro depende de qué plan tiene plata apartada en
            // ESTA cuenta — al cambiarla, el plan y el motivo elegidos pueden
            // no aplicar. Se resetean, igual que el monto.
            setSavingsMode(false)
            setSavingsGoalId(null)
            setSavingsReason(null)
          }}
        >
          {originAccounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency}
            </option>
          ))}
        </select>
      </div>

      {type === 'transferencia' && (
        <div>
          <label className="fz-field-label" htmlFor="fz-qa-to-account">
            Hacia
          </label>
          <select
            id="fz-qa-to-account"
            className="fz-input"
            value={toAccountId}
            onChange={e => {
              // Cambiar la cuenta destino invalida cualquier "monto
              // recibido" ya cargado: era la conversión para la moneda
              // anterior. Sin este reset, un monto viejo (ej. 696 en la
              // cuenta de Bolivianos) queda pegado como si fuera válido en
              // la moneda nueva (ej. BTC) — bug real encontrado en la
              // revisión del Sprint 1.
              setToAccountId(e.target.value)
              setToAmountTouched(false)
              setToAmountRaw('')
            }}
          >
            <option value="">Elegí la cuenta destino</option>
            {activeAccounts
              .filter(a => a.id !== accountId)
              .map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
          </select>
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-qa-amount">
          Monto
        </label>
        <div className="fz-amount-field">
          <span className="fz-amount-field__code">{currency}</span>
          <input id="fz-qa-amount" inputMode="decimal" placeholder="0" value={amountRaw} onChange={e => setAmountRaw(e.target.value)} autoFocus />
        </div>
        {showCap && account && (
          <div className={`fz-amount-hint${over ? ' fz-amount-hint--over' : ''}`}>
            <span>
              {withdrawing ? 'En este ahorro' : 'Disponible'} {formatMoney(Math.max(0, available), currency)}
              {!withdrawing && apartadoInAccount > 1e-9 && (
                <span style={{ color: 'var(--fz-ink-3)' }}> · {show(formatMoney(apartadoInAccount, currency))} en ahorros</span>
              )}
            </span>
            <button type="button" className="fz-link" onClick={() => setAmountRaw(String(Math.max(0, available)))}>
              MAX
            </button>
          </div>
        )}
      </div>

      {showToAmount && (
        <div>
          <label className="fz-field-label" htmlFor="fz-qa-to-amount">
            {crossCurrency ? 'Monto recibido' : 'Monto recibido (opcional)'}
          </label>
          <div className="fz-amount-field">
            <span className="fz-amount-field__code">{toAccount!.currency}</span>
            <input
              id="fz-qa-to-amount"
              inputMode="decimal"
              placeholder={crossCurrency ? '0' : String(amount || 0)}
              value={toAmountDisplay}
              onChange={e => {
                setToAmountTouched(true)
                setToAmountRaw(e.target.value)
              }}
            />
          </div>
          {crossCurrency && !toAmountTouched && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>Sugerido con la tasa de hoy.</p>
          )}
          {!crossCurrency && (
            <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
              Solo si el banco cobró comisión y llegó menos de lo que saliste.
            </p>
          )}
        </div>
      )}

      {type !== 'transferencia' && (
        <div>
          <label className="fz-field-label">Categoría</label>
          <div className="fz-chip-row">
            {categoryOptions.map(c => (
              <button
                key={c.id}
                type="button"
                className="fz-chip"
                data-active={categoryId === c.id}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              >
                <CategoryIcon icon={c.icon} name={c.name} size="sm" />
                {c.name}
              </button>
            ))}
            {categoryOptions.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>Sin categorías todavía — sembralas desde Ajustes.</span>
            )}
          </div>
        </div>
      )}

      {type !== 'transferencia' && activeProjects.length > 0 && (
        <div>
          <label className="fz-field-label">Proyecto (opcional)</label>
          <div className="fz-chip-row">
            {activeProjects.map(p => (
              <button
                key={p.id}
                type="button"
                className="fz-chip"
                data-active={projectId === p.id}
                onClick={() => setProjectId(projectId === p.id ? null : p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'gasto' && !isEditing && !withdrawing && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={shared}
              onChange={e => {
                setShared(e.target.checked)
                if (!e.target.checked) setSplits([])
              }}
            />
            Es compartido
          </label>
          {shared && (
            <div style={{ marginTop: 8 }}>
              <SplitEditor total={amount} currency={currency} splits={splits} onChange={setSplits} />
            </div>
          )}
        </div>
      )}

      {canWithdraw && (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={savingsMode}
              onChange={e => {
                setSavingsMode(e.target.checked)
                if (e.target.checked) {
                  setShared(false)
                  setSplits([])
                  if (!savingsGoalId && savingsOptions.length === 1) setSavingsGoalId(savingsOptions[0].goal.id)
                } else {
                  setSavingsGoalId(null)
                  setSavingsReason(null)
                }
              }}
            />
            Gastar de mis ahorros
          </label>

          {withdrawing && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 'var(--fz-s3)' }}>
              <div>
                <label className="fz-field-label">¿De qué ahorro?</label>
                <div className="fz-chip-row">
                  {savingsOptions.map(({ goal, has }) => (
                    <button
                      key={goal.id}
                      type="button"
                      className="fz-chip"
                      data-active={savingsGoalId === goal.id}
                      onClick={() => setSavingsGoalId(goal.id)}
                    >
                      {goal.name}
                      <span style={{ color: 'var(--fz-ink-3)', fontWeight: 400 }}> · {show(formatMoney(has, currency))}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="fz-field-label">¿Por qué?</label>
                <div className="fz-chip-row">
                  {(Object.keys(SAVINGS_REASON_LABEL) as SavingsReason[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      className="fz-chip"
                      data-active={savingsReason === r}
                      onClick={() => setSavingsReason(r)}
                    >
                      {SAVINGS_REASON_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="fz-field-label" htmlFor="fz-qa-date">
          Fecha
        </label>
        <input id="fz-qa-date" type="date" className="fz-input" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-qa-desc">
          Descripción (opcional)
        </label>
        <input id="fz-qa-desc" className="fz-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Almuerzo" />
      </div>

      {formError && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {formError}
        </p>
      )}

      {budgetBlock ? (
        <div className="fz-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--fz-out-tint)' }}>
          <div style={{ fontWeight: 700 }}>No alcanza el presupuesto</div>
          <div style={{ fontSize: 13, color: 'var(--fz-ink-2)' }}>
            {budgetBlock.title}: {fmtUsd(budgetBlock.spentUsd)} de {fmtUsd(budgetBlock.effectiveUsd)} — te faltan{' '}
            <strong>{fmtUsd(budgetBlock.faltanteUsd)}</strong> para este gasto.
          </div>
          <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
            <button type="button" className="fz-link" onClick={() => setBudgetBlock(null)}>
              Cancelar
            </button>
            <Btn
              variant="primary"
              block
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true)
                // Ampliar en la moneda de la línea: convertir el faltante USD.
                const line = budgetView.lines.find(v => v.line_id === budgetBlock.lineId)
                const faltanteNative = line ? budgetBlock.faltanteUsd / (line.rate || 1) : budgetBlock.faltanteUsd
                const ext = await extendBudget(budgetBlock.lineId, budgetView.period, faltanteNative)
                setSubmitting(false)
                if (ext.error) return setFormError(ext.error)
                setBudgetBlock(null)
                await handleSubmit({ skipBudgetCheck: true })
              }}
            >
              {submitting ? 'Ampliando…' : `Ampliar ${fmtUsd(budgetBlock.faltanteUsd)}`}
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
          {isEditing && (
            <button
              type="button"
              className="fz-icon-btn"
              onClick={handleDelete}
              disabled={submitting}
              aria-label="Borrar movimiento"
              style={{ color: 'var(--fz-out-text)' }}
            >
              <IconTrash size={18} />
            </button>
          )}
          <Btn variant="primary" block onClick={() => handleSubmit()} disabled={submitting || over}>
            {submitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar'}
          </Btn>
        </div>
      )}
    </div>
  )
}

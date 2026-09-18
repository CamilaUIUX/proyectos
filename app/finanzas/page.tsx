'use client'

import Link from 'next/link'
import {
  IconEye,
  IconEyeOff,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconArrowsLeftRight,
  IconWallet,
  IconReceipt2,
} from '@tabler/icons-react'
import { formatMoney, maskAmount } from '@/lib/finanzas/money'
import { fromUsd } from '@/lib/finanzas/rates'
import { pendingCount, fijosNeedAttention } from '@/lib/finanzas/recurring'
import { todayISO } from '@/lib/finanzas/dates'
import { CurrencyIcon } from './components/currency-icon'
import { EmptyState, Panel, SectionTitle, Skeleton } from './components/ui'
import { TxRow } from './components/tx-row'
import { ProfileSwitcher } from './components/profile-switcher'
import { CategoryPie } from './components/category-pie'
import { useFinanzas } from './components/data-context'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Saludo + selector de perfil + ojo de ocultar montos — en los TRES
 *  `return` de esta pantalla (el normal y los dos estados vacíos de más
 *  abajo), no solo el normal. Un perfil recién creado siempre entra por
 *  "sin cuentas todavía" (nace sin nada, sprint-8-perfiles.md §4.9) — sin
 *  esto, esa pantalla no tenía por dónde volver a otro perfil. Bug real
 *  encontrado en la revisión del sprint 8, análogo al de la referencia
 *  (§0.4 punto 2 de su sprint 8: "un perfil vacío no tenía forma de volver"). */
function HomeHeader() {
  const { profiles, activeProfile, hidden, toggleHidden } = useFinanzas()
  const greetingText = profiles.length > 1 && activeProfile ? `${greeting()}, ${activeProfile.name}` : greeting()

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--fz-s3)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{greetingText}</div>
        <ProfileSwitcher />
      </div>
      <button
        type="button"
        className="fz-eye"
        onClick={toggleHidden}
        aria-pressed={hidden}
        aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
      >
        {hidden ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </header>
  )
}

export default function FinanzasHome() {
  const {
    loading,
    error,
    accounts,
    activeAccounts,
    recentTx,
    totalUsd,
    monthGastoUsd,
    monthGastoRealUsd,
    monthIngresoUsd,
    monthTx,
    categories,
    dueDebtUsd,
    activeRecurring,
    allTx,
    rates,
    budgetView,
    savingsView,
    activeProfile,
    hidden,
    openQuickAdd,
  } = useFinanzas()

  // El delta del mes usa el gasto REAL (después de lo que le toca a otros),
  // no el bruto — es lo que de verdad te movió el bolsillo.
  const deltaUsd = monthIngresoUsd - monthGastoRealUsd
  const hayReparto = monthGastoRealUsd !== monthGastoUsd
  const show = (text: string) => maskAmount(text, hidden)
  // Sprint 10 §4.6 — todo total agregado (nunca el nativo de una cuenta) se
  // muestra en la moneda de visualización del perfil, no siempre en USD.
  const displayCurrency = activeProfile?.display_currency ?? 'USD'
  const fmtUsd = (usd: number, opts?: { signed?: boolean }) => show(formatMoney(fromUsd(usd, displayCurrency, rates), displayCurrency, opts))

  // Misma función que usa la pantalla Fijos — evita que la Home reimplemente
  // "qué le toca este mes" por su cuenta. El tile solo aparece si hay algo
  // que de verdad requiere atención (vencido, o vence en ≤ 3 días) — no el
  // día 1 del mes con todo "0 de N". Mismo criterio que `dueDebtUsd`.
  const fijosToday = todayISO()
  const { registered: registeredFijos, total: dueFijos } = pendingCount(activeRecurring, allTx, fijosToday)
  const fijosAlert = fijosNeedAttention(activeRecurring, allTx, fijosToday)

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s6)' }}>
        <HomeHeader />
        <EmptyState
          icon={<IconReceipt2 size={24} />}
          title="No se pudo cargar Finanzas"
          message={error}
        />
      </div>
    )
  }

  if (!loading && accounts.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s6)' }}>
        <HomeHeader />
        <EmptyState
          icon={<IconWallet size={24} />}
          title="Todavía no cargaste ninguna cuenta"
          message="Creá tu primera cuenta para empezar a registrar movimientos."
          action={
            <Link href="/finanzas/cuentas" className="fz-btn fz-btn--primary" style={{ marginTop: 12 }}>
              Crear cuenta
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s6)' }}>
      <HomeHeader />

      <div className="fz-hero-row">
        <div className="fz-hero">
          <div className="fz-hero__label">Patrimonio total</div>
          {loading ? (
            <Skeleton w={180} h={40} />
          ) : (
            <div className="fz-hero__amount fz-tabular">{fmtUsd(totalUsd)}</div>
          )}
          <div className="fz-hero__fx">1 USD = Bs {rates.BOB.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
        </div>

        <div className="fz-quick-actions">
          <button type="button" className="fz-quick-action" onClick={() => openQuickAdd({ lockType: 'gasto' })}>
            <IconArrowUpRight size={20} />
            Gasto
          </button>
          <button type="button" className="fz-quick-action" onClick={() => openQuickAdd({ lockType: 'ingreso' })}>
            <IconArrowDownLeft size={20} />
            Ingreso
          </button>
          <button type="button" className="fz-quick-action" onClick={() => openQuickAdd({ lockType: 'transferencia' })}>
            <IconArrowsLeftRight size={20} />
            Transferir
          </button>
        </div>
      </div>

      <Panel>
        <SectionTitle title="Ingresos y gastos" />
        <div className="fz-tiles">
          <div className="fz-tile fz-tile--in">
            <div className="fz-tile__icon">
              <IconArrowDownLeft size={18} />
            </div>
            <div className="fz-tile__label">Ingresos del mes</div>
            {loading ? <Skeleton w={80} h={22} /> : <div className="fz-tile__value fz-tabular">{fmtUsd(monthIngresoUsd)}</div>}
          </div>
          <div className="fz-tile fz-tile--out">
            <div className="fz-tile__icon">
              <IconArrowUpRight size={18} />
            </div>
            <div className="fz-tile__label">Gastos del mes{hayReparto ? ' · real' : ''}</div>
            {loading ? (
              <Skeleton w={80} h={22} />
            ) : (
              <div className="fz-tile__value fz-tabular">
                {fmtUsd(hayReparto ? monthGastoRealUsd : monthGastoUsd)}
              </div>
            )}
            {!loading && hayReparto && (
              <div style={{ fontSize: 11, color: 'var(--fz-ink-3)' }}>bruto {fmtUsd(monthGastoUsd)}</div>
            )}
          </div>
        </div>
        {!loading && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 'var(--fz-s4)',
              paddingTop: 'var(--fz-s3)',
              borderTop: '1px solid var(--fz-hairline)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-ink-2)' }}>Resultado del mes</span>
            <span className="fz-tabular" style={{ fontSize: 16, fontWeight: 700, color: deltaUsd >= 0 ? 'var(--fz-in-text)' : 'var(--fz-out-text)' }}>
              {fmtUsd(deltaUsd, { signed: true })}
            </span>
          </div>
        )}
      </Panel>

      <CategoryPie monthTx={monthTx} categories={categories} rates={rates} hidden={hidden} loading={loading} />

      {/* "Te deben $X" y "N de M fijos" — ni Deudas ni Fijos tienen ícono
       * propio en la tab bar de móvil todavía (sprint-2-deudas.md §0,
       * sprint-3-fijos.md §0): se llega desde acá y de la sidebar en
       * desktop. El de deudas solo si hay algo ya vencido/próximo; el de
       * fijos, solo si hay uno vencido o que vence en ≤ 3 días. */}
      {!loading && (dueDebtUsd > 0 || fijosAlert) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s3)' }}>
          {dueDebtUsd > 0 && (
            <Link
              href="/finanzas/deudas"
              className="fz-panel"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-ink-2)' }}>Te deben</span>
              <span className="fz-tabular" style={{ fontSize: 18, fontWeight: 700 }}>
                {fmtUsd(dueDebtUsd)}
              </span>
            </Link>
          )}
          {fijosAlert && (
            <Link
              href="/finanzas/fijos"
              className="fz-panel"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-ink-2)' }}>Fijos por registrar</span>
              <span className="fz-tabular" style={{ fontSize: 18, fontWeight: 700 }}>
                {registeredFijos} de {dueFijos}
              </span>
            </Link>
          )}
        </div>
      )}

      {!loading && budgetView.general && (
        <Link
          href="/finanzas/presupuesto"
          className="fz-panel"
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-ink-2)' }}>Presupuesto</span>
            <span className="fz-tabular" style={{ fontSize: 15, fontWeight: 700 }}>
              {fmtUsd(budgetView.general.spent_usd)} / {fmtUsd(budgetView.general.effective_usd)}
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              height: 8,
              borderRadius: 999,
              background: 'var(--fz-tint-neutral)',
              overflow: 'hidden',
              marginTop: 6,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${budgetView.general.bar.fillPct}%`,
                background: budgetView.general.bar.danger ? 'var(--fz-out)' : 'var(--fz-accent)',
                borderRadius: 999,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -2,
                bottom: -2,
                left: `calc(${budgetView.general.bar.tickPct}% - 1px)`,
                width: 2,
                background: 'var(--fz-ink)',
              }}
            />
          </div>
        </Link>
      )}

      {!loading && savingsView.has_pending && (
        <Link
          href="/finanzas/ahorro"
          className="fz-panel"
          style={{ display: 'block', textDecoration: 'none', color: 'inherit', borderLeft: '3px solid var(--fz-save)' }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fz-save-text)' }}>Es hora de organizar tus ahorros</div>
          <div style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 2 }}>
            {fmtUsd(savingsView.total_saved_usd)} guardado · guardá lo que dejó el mes pasado en cada plan
          </div>
        </Link>
      )}

      <Panel>
        <SectionTitle title="Movimientos" href="/finanzas/movimientos" actionLabel="Ver todos" />
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
            <Skeleton w="100%" h={56} />
          </div>
        ) : recentTx.length === 0 ? (
          <EmptyState icon={<IconReceipt2 size={22} />} title="Todavía no registraste nada" message="Usá el botón (+) para tu primer movimiento." />
        ) : (
          recentTx.map(tx => <TxRow key={tx.id} tx={tx} onClick={() => openQuickAdd({ editing: tx })} />)
        )}
      </Panel>

      <Panel>
        <SectionTitle title="Cuentas" href="/finanzas/cuentas" actionLabel="Ver todas" />
        {loading ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <Skeleton w={200} h={90} radius={20} />
            <Skeleton w={200} h={90} radius={20} />
          </div>
        ) : (
          <div className="fz-account-scroll">
            {activeAccounts.map(a => (
              <Link key={a.id} href="/finanzas/cuentas" className="fz-account-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CurrencyIcon currency={a.currency} />
                  <span className="fz-account-card__name">{a.name}</span>
                </div>
                <div className="fz-account-card__balance fz-tabular">{show(formatMoney(a.balance, a.currency))}</div>
                {a.currency !== displayCurrency && (
                  <div className="fz-account-card__usd fz-tabular">≈ {fmtUsd(a.balance_usd)}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

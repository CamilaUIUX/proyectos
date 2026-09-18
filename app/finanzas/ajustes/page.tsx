'use client'

import { useMemo, useState } from 'react'
import { IconArchive, IconPlus, IconRefresh, IconRestore, IconTrash } from '@tabler/icons-react'
import { CATEGORY_ICON_MAP, RATE_CURRENCIES, type CategoryKind, type RateCurrency } from '@/lib/finanzas/types'
import { parseDecimalInput } from '@/lib/finanzas/money'
import { PAIRS_FOR_CURRENCY, PAIR_LABEL, defaultPairFor, type QuotePair } from '@/lib/finanzas/quotes'
import { Btn, Panel, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/category-icon'
import { CurrencyIcon } from '../components/currency-icon'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { ProfileSheet } from '../components/profile-sheet'
import { PushSetup } from '../components/push-setup'
import { ACCENT_HEX, type AccentKey } from '@/lib/finanzas/profiles'
import { DEFAULT_NOTIF_PREFS } from '@/lib/finanzas/notifications'
import type { NotifPrefs } from '@/lib/finanzas/types'
import { useFinanzas } from '../components/data-context'

const ICON_OPTIONS = Object.keys(CATEGORY_ICON_MAP)

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diff) || diff < 0) return ''
  const min = Math.round(diff / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

function RateRow({ currency }: { currency: RateCurrency }) {
  const { rates, rateRows, updateRate, setRateMode } = useFinanzas()
  const row = rateRows.find(r => r.currency === currency)
  const auto = row?.auto ?? true
  const pair = (row?.quote_pair as QuotePair | null) ?? defaultPairFor(currency)
  const pairs = PAIRS_FOR_CURRENCY[currency]

  const [value, setValue] = useState(String(rates[currency]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveManual() {
    setError(null)
    const n = parseDecimalInput(value)
    if (!n || n <= 0) {
      // Campo vacío o inválido al perder el foco: antes se quedaba en blanco
      // para siempre (bug real de la revisión del Sprint 2). Resync al valor
      // guardado.
      setValue(String(rates[currency]))
      return
    }
    setSaving(true)
    const result = await updateRate(currency, n) // esto además pasa la tasa a manual
    setSaving(false)
    if (result.error) return setError(result.error)
    setValue(String(n))
  }

  async function toggleAuto(nextAuto: boolean) {
    setError(null)
    setSaving(true)
    const result = await setRateMode(currency, nextAuto, pair)
    setSaving(false)
    if (result.error) return setError(result.error)
    if (!nextAuto) setValue(String(rates[currency]))
  }

  async function changePair(nextPair: string) {
    setError(null)
    setSaving(true)
    const result = await setRateMode(currency, true, nextPair)
    setSaving(false)
    if (result.error) setError(result.error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--fz-s3)' }}>
        <CurrencyIcon currency={currency} />
        <span style={{ width: 48, fontWeight: 600, fontSize: 14 }}>{currency}</span>

        {auto ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1 }}>
            <span className="fz-tabular" style={{ fontWeight: 700 }}>
              {rates[currency].toLocaleString('en-US', { maximumFractionDigits: 6 })}
            </span>
            {row?.updated_at && <span style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>{relativeTime(row.updated_at)}</span>}
          </div>
        ) : (
          <input
            className="fz-input"
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={saveManual}
            style={{ maxWidth: 160, flex: 1 }}
          />
        )}

        <button
          type="button"
          className="fz-chip"
          data-active={auto}
          aria-pressed={auto}
          onClick={() => toggleAuto(!auto)}
          disabled={saving}
          title={auto ? 'Cambiar a manual' : 'Cambiar a automática'}
        >
          {auto ? 'Auto' : 'Manual'}
        </button>
      </div>

      {auto && pairs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, paddingLeft: 40, flexWrap: 'wrap' }}>
          {pairs.map(p => (
            <button
              key={p}
              type="button"
              className="fz-chip"
              data-active={pair === p}
              aria-pressed={pair === p}
              onClick={() => changePair(p)}
              disabled={saving}
              style={{ fontSize: 12 }}
            >
              {PAIR_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, paddingLeft: 40 }}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Grilla visual de íconos — reemplaza el `<select>` de slugs (era "elegir de
 *  un set fijo", igual que la referencia lo hace con una grilla). */
function IconPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {ICON_OPTIONS.map(slug => (
        <button
          key={slug}
          type="button"
          className="fz-chip"
          data-active={value === slug}
          aria-pressed={value === slug}
          onClick={() => onChange(slug)}
          style={{ padding: 8 }}
          title={slug}
        >
          <CategoryIcon icon={slug} name={slug} size="sm" />
        </button>
      ))}
    </div>
  )
}

function NewCategoryForm({ kind }: { kind: CategoryKind }) {
  const { createCategory } = useFinanzas()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICON_OPTIONS[0])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className="fz-chip" onClick={() => setOpen(true)} style={{ marginTop: 8 }}>
        <IconPlus size={14} /> Nueva categoría
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <input className="fz-input" style={{ maxWidth: 240 }} placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
      <IconPicker value={icon} onChange={setIcon} />
      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn
          size="sm"
          disabled={saving}
          onClick={async () => {
            setError(null)
            if (!name.trim()) return setError('Ponele un nombre.')
            setSaving(true)
            const result = await createCategory({ name: name.trim(), kind, icon })
            setSaving(false)
            if (result.error) return setError(result.error)
            setName('')
            setOpen(false)
          }}
        >
          {saving ? 'Creando…' : 'Crear'}
        </Btn>
        <button type="button" className="fz-link" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function CategoryList({ kind }: { kind: CategoryKind }) {
  const { categories, updateCategory } = useFinanzas()
  const list = categories.filter(c => c.kind === kind)
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{kind === 'gasto' ? 'Gasto' : 'Ingreso'}</h3>
      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {error}
        </p>
      )}
      {list.map(c => (
        <div key={c.id} className="fz-tx-row" style={{ opacity: c.archived ? 0.5 : 1 }}>
          <CategoryIcon icon={c.icon} name={c.name} size="sm" />
          <div className="fz-tx-row__body">
            <div className="fz-tx-row__title">{c.name}</div>
          </div>
          <button
            type="button"
            className="fz-icon-btn"
            onClick={async () => {
              setError(null)
              const result = await updateCategory(c.id, { archived: !c.archived })
              if (result.error) setError(result.error)
            }}
            aria-label={c.archived ? 'Reactivar' : 'Archivar'}
          >
            {c.archived ? <IconRestore size={16} /> : <IconArchive size={16} />}
          </button>
        </div>
      ))}
      <NewCategoryForm kind={kind} />
    </div>
  )
}

function RefreshRatesButton() {
  const { refreshRatesNow } = useFinanzas()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="fz-link"
        disabled={busy}
        onClick={async () => {
          setError(null)
          setBusy(true)
          const result = await refreshRatesNow()
          setBusy(false)
          if (result.error) setError(result.error)
        }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <IconRefresh size={14} /> {busy ? 'Actualizando…' : 'Actualizar ahora'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  )
}

function PersonRow({ personId }: { personId: string }) {
  const { people, debts, updatePerson, deleteOrArchivePerson } = useFinanzas()
  const person = people.find(p => p.id === personId)
  const [name, setName] = useState(person?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!person) return null

  const debtCount = debts.filter(d => d.person_id === personId).length

  async function rename() {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed || trimmed === person!.name) {
      setName(person!.name)
      return
    }
    setBusy(true)
    const result = await updatePerson(personId, { name: trimmed })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      setName(person!.name)
    }
  }

  async function removeOrArchive() {
    setError(null)
    setBusy(true)
    const result = await deleteOrArchivePerson(personId)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderTop: '1px solid var(--fz-hairline)', opacity: person.archived ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="fz-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={rename}
          disabled={busy || person.archived}
          style={{ flex: 1 }}
        />
        {person.archived ? (
          <button
            type="button"
            className="fz-chip"
            disabled={busy}
            onClick={async () => {
              setError(null)
              const result = await updatePerson(personId, { archived: false })
              if (result.error) setError(result.error)
            }}
          >
            Reactivar
          </button>
        ) : (
          <button
            type="button"
            className="fz-icon-btn"
            style={{ color: 'var(--fz-out-text)' }}
            disabled={busy}
            onClick={removeOrArchive}
            aria-label={debtCount > 0 ? 'Archivar' : 'Borrar'}
            title={debtCount > 0 ? 'Tiene deudas — se archiva' : 'Borrar'}
          >
            {debtCount > 0 ? <IconArchive size={16} /> : <IconTrash size={16} />}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 12, fontWeight: 600 }}>
          {error}
        </p>
      )}
    </div>
  )
}

function PersonasPanel() {
  const { people } = useFinanzas()
  const active = people.filter(p => !p.archived)
  const archived = people.filter(p => p.archived)
  const [showArchived, setShowArchived] = useState(false)

  return (
    <Panel>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Personas</h2>
      {active.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fz-ink-3)' }}>
          Se crean solas al cargar una deuda o repartir un gasto. Acá las renombrás o archivás.
        </p>
      ) : (
        active.map(p => <PersonRow key={p.id} personId={p.id} />)
      )}
      {archived.length > 0 && (
        <>
          <button type="button" className="fz-link" style={{ marginTop: 8 }} onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
          </button>
          {showArchived && archived.map(p => <PersonRow key={p.id} personId={p.id} />)}
        </>
      )}
    </Panel>
  )
}

/** El toggle "gastado / disponible" (sprint-5-presupuesto.md §0, §5) y el
 *  atajo para poner tope a las categorías que todavía no tienen línea. Vive
 *  en Ajustes porque es una preferencia de lectura, no una acción del día a
 *  día — pero aplica igual en Presupuesto y en la Home. */
function PresupuestoPanel() {
  const { budgetViewMode, setBudgetViewMode, budgetView, categories } = useFinanzas()
  const [sheetOpen, setSheetOpen] = useState(false)

  const missingCount = useMemo(() => {
    const withLine = new Set<string>()
    for (const v of budgetView.lines) for (const id of v.category_ids) withLine.add(id)
    return categories.filter(c => c.kind === 'gasto' && !c.archived && !withLine.has(c.id)).length
  }, [budgetView, categories])

  return (
    <Panel>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Presupuesto</h2>
      <p style={{ fontSize: 13, color: 'var(--fz-ink-2)', marginBottom: 8 }}>
        En Presupuesto y en la Home, mostrar por defecto cuánto llevás gastado o cuánto te queda disponible.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['gastado', 'disponible'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            className="fz-chip"
            data-active={budgetViewMode === mode}
            aria-pressed={budgetViewMode === mode}
            onClick={() => setBudgetViewMode(mode)}
            style={{ textTransform: 'capitalize' }}
          >
            {mode}
          </button>
        ))}
      </div>

      {missingCount > 0 && (
        <button
          type="button"
          className="fz-link"
          onClick={() => setSheetOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12 }}
        >
          <IconPlus size={14} /> Agregar presupuesto a {missingCount} {missingCount === 1 ? 'categoría' : 'categorías'} que {missingCount === 1 ? 'falta' : 'faltan'}
        </button>
      )}

      <BudgetLineSheet open={sheetOpen} onClose={() => setSheetOpen(false)} editingId={null} />
    </Panel>
  )
}

/** Lista + "+ Nuevo perfil", mismo patrón que <PersonasPanel> (sprint-8-
 *  perfiles.md §5) — cada fila abre <ProfileSheet> para renombrar, cambiar
 *  el acento, o archivar/borrar. El default nunca muestra el ícono de
 *  archivar (§4.5, ya resuelto adentro del propio sheet). */
function ProfilesPanel() {
  const { profiles } = useFinanzas()
  const active = profiles.filter(p => !p.archived)
  const archived = profiles.filter(p => p.archived)
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined)

  return (
    <Panel>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Perfiles</h2>
      {active.map(p => (
        <button
          key={p.id}
          type="button"
          className="fz-tx-row"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => setEditingId(p.id)}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: ACCENT_HEX[p.accent as AccentKey] ?? ACCENT_HEX.verde,
              flexShrink: 0,
            }}
          />
          <div className="fz-tx-row__body">
            <div className="fz-tx-row__title">
              {p.name}
              {p.is_default && <span style={{ color: 'var(--fz-ink-3)', fontWeight: 400 }}> · default</span>}
            </div>
          </div>
        </button>
      ))}
      {archived.length > 0 && (
        <>
          <button type="button" className="fz-link" style={{ marginTop: 8 }} onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Ocultar archivados' : `Ver archivados (${archived.length})`}
          </button>
          {showArchived &&
            archived.map(p => (
              <button
                key={p.id}
                type="button"
                className="fz-tx-row"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', opacity: 0.55 }}
                onClick={() => setEditingId(p.id)}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 20, height: 20, borderRadius: '50%', background: ACCENT_HEX[p.accent as AccentKey] ?? ACCENT_HEX.verde, flexShrink: 0 }}
                />
                <div className="fz-tx-row__body">
                  <div className="fz-tx-row__title">{p.name}</div>
                </div>
              </button>
            ))}
        </>
      )}
      <Btn variant="soft" style={{ marginTop: 12 }} onClick={() => setEditingId(null)}>
        <IconPlus size={16} /> Nuevo perfil
      </Btn>
      <ProfileSheet open={editingId !== undefined} editingId={editingId ?? null} onClose={() => setEditingId(undefined)} />
    </Panel>
  )
}

/** Un switch por tipo con un ejemplo de aviso debajo — "es más barato
 *  entender 'Comida al 90% · Te quedan $32 de $320' que la etiqueta
 *  Presupuesto" (sprint-9-notificaciones.md §7 UI). Los ejemplos son texto
 *  fijo, no datos reales — no hace falta ver un aviso de verdad para
 *  entender qué tipo de aviso es cada uno. */
const NOTIF_TYPE_ROWS: { key: keyof Pick<NotifPrefs, 'fijos' | 'presupuesto' | 'ahorro' | 'deudas'>; label: string; example: string }[] = [
  { key: 'fijos', label: 'Fijos y cuotas', example: 'Alquiler venció · Bs 2.100 · vencía el 5' },
  { key: 'presupuesto', label: 'Presupuesto', example: 'Comida al 90% · Te quedan $32 de $320' },
  { key: 'ahorro', label: 'Ahorro', example: 'Te sobraron $214 en agosto · Sin repartir entre tus ahorros' },
  { key: 'deudas', label: 'Deudas', example: 'Ana te debe hace 30 días · $20' },
]

function NotificacionesPanel() {
  const { notifPrefs, updateNotifPrefs } = useFinanzas()
  const effective = notifPrefs ?? DEFAULT_NOTIF_PREFS
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // La hora local del navegador se manda junto con cualquier cambio — así
  // nadie tiene que elegir su propia zona horaria de una lista (§4.6: el
  // job corre en UTC, esto es lo que lo convierte a la hora de quien lee).
  async function save(patch: Partial<NotifPrefs>, key: string) {
    setError(null)
    setBusyKey(key)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || effective.timezone
    const result = await updateNotifPrefs({ ...patch, timezone })
    setBusyKey(null)
    if (result.error) setError(result.error)
  }

  return (
    <Panel>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Notificaciones</h2>
      <PushSetup />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {NOTIF_TYPE_ROWS.map(row => (
          <label key={row.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              checked={effective[row.key]}
              disabled={busyKey === row.key}
              onChange={e => save({ [row.key]: e.target.checked }, row.key)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{row.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--fz-ink-3)' }}>{row.example}</span>
            </span>
          </label>
        ))}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={effective.recordar_anotar}
            disabled={busyKey === 'recordar_anotar'}
            onChange={e => save({ recordar_anotar: e.target.checked }, 'recordar_anotar')}
            style={{ marginTop: 2 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Recordar anotar</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--fz-ink-3)' }}>¿Gastaste algo hoy? · Anotalo antes de que se te olvide</span>
          </span>
        </label>

        {effective.recordar_anotar && (
          <div style={{ display: 'flex', gap: 'var(--fz-s3)', marginLeft: 26 }}>
            <div>
              <label className="fz-field-label" htmlFor="fz-notif-mediodia">
                Mediodía
              </label>
              <input
                id="fz-notif-mediodia"
                type="time"
                className="fz-input"
                step={900}
                value={effective.recordar_mediodia}
                onChange={e => save({ recordar_mediodia: e.target.value }, 'recordar_mediodia')}
              />
            </div>
            <div>
              <label className="fz-field-label" htmlFor="fz-notif-noche">
                Noche
              </label>
              <input
                id="fz-notif-noche"
                type="time"
                className="fz-input"
                step={900}
                value={effective.recordar_noche}
                onChange={e => save({ recordar_noche: e.target.value }, 'recordar_noche')}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
          {error}
        </p>
      )}
    </Panel>
  )
}

export default function AjustesPage() {
  const { categories, loading, seedCategoriesIfEmpty } = useFinanzas()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Ajustes</h1>

      <Panel>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Tipo de cambio</h2>
        <p style={{ fontSize: 13, color: 'var(--fz-ink-2)', marginBottom: 8 }}>
          Automáticas: la app las trae de una fuente pública al abrir (Bs de{' '}
          <span style={{ whiteSpace: 'nowrap' }}>bo.dolarapi.com</span>, cripto de CoinGecko). Poné una a mano para fijarla —
          el refresco no la vuelve a tocar hasta que la reactives.
        </p>
        {loading ? (
          // <RateRow> arranca su `value` desde `rates[currency]` una sola
          // vez, al montarse (mismo motivo que <PlanForm> y compañía: evita
          // un efecto de sincronización). Si se montara mientras `rates`
          // todavía es el fallback (buildRatesMap([]) antes de que load()
          // resuelva), ese valor de arranque quedaría pegado ahí para
          // siempre; perder el foco del campo sin haberlo tocado (onBlur →
          // save()) guardaría el fallback y pisaría la tasa real ya
          // guardada, sin ningún aviso. Se resuelve montando <RateRow> recién
          // cuando `rates` ya es el de verdad — mismo criterio que ya usa
          // "Sembrar categorías" acá abajo con `categories`. Bug real,
          // revisión del Sprint 4 (segunda pasada).
          <Skeleton w="100%" h={40} />
        ) : (
          <>
            {RATE_CURRENCIES.map(c => (
              <RateRow key={c} currency={c} />
            ))}
            <RefreshRatesButton />
          </>
        )}
      </Panel>

      <Panel>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Categorías</h2>
        {loading ? (
          // Mientras `categories` todavía no llegó, length es 0 de forma
          // transitoria — mostrar el botón acá permitía sembrar de nuevo
          // sobre categorías que en realidad ya existen (duplicados), antes
          // de que terminara de cargar. Bug real de la revisión del Sprint 1.
          <Skeleton w="100%" h={40} />
        ) : categories.length === 0 ? (
          <Btn onClick={() => seedCategoriesIfEmpty()}>Sembrar categorías iniciales</Btn>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s5)' }}>
            <CategoryList kind="gasto" />
            <CategoryList kind="ingreso" />
          </div>
        )}
      </Panel>

      {!loading && <PresupuestoPanel />}

      {!loading && <PersonasPanel />}

      {!loading && <ProfilesPanel />}

      {!loading && <NotificacionesPanel />}
    </div>
  )
}

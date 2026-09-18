'use client'

import { useState } from 'react'
import { IconArchive, IconRestore, IconTrash } from '@tabler/icons-react'
import { ACCENT_HEX, ACCENT_KEYS, ACCENT_LABEL, type AccentKey } from '@/lib/finanzas/profiles'
import { CURRENCIES, type Currency, type FinProfile } from '@/lib/finanzas/types'
import { Btn, Segmented, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Crear o editar un perfil — nombre + acento, y borrar/archivar para uno
 *  existente (sprint-8-perfiles.md §5). El default nunca ofrece borrar ni
 *  archivar (§4.5) — ni el checkbox ni el botón existen para ese caso. */
export function ProfileSheet({ open, onClose, editingId }: { open: boolean; onClose: () => void; editingId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Editar perfil' : 'Nuevo perfil'}>
      {open && <ProfileForm key={editingId ?? 'new'} editingId={editingId} onClose={onClose} />}
    </Sheet>
  )
}

function ProfileForm({ editingId, onClose }: { editingId: string | null; onClose: () => void }) {
  const {
    profiles,
    createProfile,
    updateProfile,
    deleteOrArchiveProfile,
    activeProfileId,
    accounts,
    categories,
    allTx,
    people,
    debts,
    recurring,
    plans,
    budgetLines,
    savingsGoals,
  } = useFinanzas()

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null
  // Solo se puede saber de antemano si ESTE borrado va a terminar en archivar
  // cuando el perfil que se edita es el activo — es el único cuyas 14 tablas
  // ya están cargadas en memoria (mismo criterio que <CuentaRow> con `hasTx`,
  // sprint-8-perfiles.md §4.5). Para un perfil no activo en esta misma lista
  // no hay nada que precalcular: se intenta borrar y, si la base lo rechaza,
  // se archiva sola — el botón se queda con el texto genérico.
  const isActiveProfile = editing?.id === activeProfileId
  const activeHasData =
    isActiveProfile &&
    (accounts.length > 0 ||
      categories.length > 0 ||
      allTx.length > 0 ||
      people.length > 0 ||
      debts.length > 0 ||
      recurring.length > 0 ||
      plans.length > 0 ||
      budgetLines.length > 0 ||
      savingsGoals.length > 0)

  const [name, setName] = useState(editing?.name ?? '')
  const [tipo, setTipo] = useState<FinProfile['tipo']>(editing?.tipo ?? 'personal')
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(editing?.display_currency ?? 'USD')
  const [accent, setAccent] = useState<AccentKey>((editing?.accent as AccentKey) ?? 'verde')
  // Sprint 9 · Notificaciones §7 UI — encendido por default, igual que la
  // columna en la base. Un perfil nuevo no lo manda (§0 del sprint 9: no
  // hace falta, la base ya lo pone en true), solo se puede apagar editando.
  const [notify, setNotify] = useState(editing?.notify ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre.')

    setSubmitting(true)
    const result = editing
      ? await updateProfile(editing.id, { name: name.trim(), accent, notify, tipo, display_currency: displayCurrency })
      : await createProfile({ name: name.trim(), accent, tipo, display_currency: displayCurrency })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleArchiveToggle() {
    if (!editing) return
    setSubmitting(true)
    const result = editing.archived
      ? await updateProfile(editing.id, { archived: false })
      : await deleteOrArchiveProfile(editing.id)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <label className="fz-field-label" htmlFor="fz-profile-name">
          Nombre
        </label>
        <input
          id="fz-profile-name"
          className="fz-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej. Negocio"
          autoFocus
        />
      </div>

      <div>
        <label className="fz-field-label">Tipo</label>
        <Segmented
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'personal', label: 'Personal' },
            { value: 'negocio', label: 'Negocio' },
          ]}
        />
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
          {tipo === 'negocio'
            ? 'Suma Proyectos al menú, y "Ahorro" pasa a llamarse "Fondos de ahorro".'
            : 'Personal muestra Ahorro y no muestra Proyectos.'}
        </p>
      </div>

      <div>
        <label className="fz-field-label" htmlFor="fz-profile-currency">
          Moneda de visualización
        </label>
        <select
          id="fz-profile-currency"
          className="fz-input"
          value={displayCurrency}
          onChange={e => setDisplayCurrency(e.target.value as Currency)}
        >
          {CURRENCIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)', marginTop: 4 }}>
          Todos los totales de este perfil se muestran en esta moneda, convertidos a la tasa de hoy — no cambia nada guardado.
        </p>
      </div>

      <div>
        <label className="fz-field-label">Acento</label>
        <div className="fz-chip-row">
          {ACCENT_KEYS.map(key => (
            <button
              key={key}
              type="button"
              className="fz-chip"
              data-active={accent === key}
              onClick={() => setAccent(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span
                aria-hidden="true"
                style={{ width: 12, height: 12, borderRadius: '50%', background: ACCENT_HEX[key], display: 'inline-block' }}
              />
              {ACCENT_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
          Notificar de este perfil
        </label>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
        {editing && !editing.is_default && (
          <button
            type="button"
            className="fz-icon-btn"
            style={{ color: 'var(--fz-out-text)' }}
            onClick={handleArchiveToggle}
            disabled={submitting}
            aria-label={editing.archived ? 'Reactivar perfil' : isActiveProfile ? (activeHasData ? 'Archivar perfil' : 'Borrar perfil') : 'Archivar o borrar perfil'}
            title={editing.archived ? 'Reactivar' : isActiveProfile ? (activeHasData ? 'Archivar' : 'Borrar') : 'Archivar o borrar'}
          >
            {editing.archived ? <IconRestore size={18} /> : activeHasData || !isActiveProfile ? <IconArchive size={18} /> : <IconTrash size={18} />}
          </button>
        )}
        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear perfil'}
        </Btn>
      </div>

      {editing && !editing.is_default && !editing.archived && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          {isActiveProfile
            ? activeHasData
              ? 'Este perfil tiene datos — se archiva en vez de borrarse. Se puede reactivar después.'
              : 'Este perfil no tiene datos todavía — se puede borrar directo.'
            : 'Si tiene datos, se archiva en vez de borrarse — se puede reactivar después.'}
        </p>
      )}
      {editing?.archived && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          Este perfil está archivado. Reactivarlo lo vuelve a mostrar en el selector.
        </p>
      )}
    </div>
  )
}

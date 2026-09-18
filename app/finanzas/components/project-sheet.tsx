'use client'

import { useState } from 'react'
import { IconArchive, IconRestore, IconTrash } from '@tabler/icons-react'
import { parseDecimalInput } from '@/lib/finanzas/money'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { Btn, Sheet } from './ui'
import { useFinanzas } from './data-context'

/** Crear o editar un proyecto — nombre + objetivo + moneda, y borrar/archivar
 *  para uno existente (sprint-10-perfiles-de-negocio.md §4.7). El objetivo
 *  se congela al crear y NO se puede editar después — cambiar la meta a
 *  mitad de camino falsearía el progreso ya mostrado (mismo criterio que la
 *  moneda de una cuenta con movimientos, en otras pantallas de esta app). */
export function ProjectSheet({ open, onClose, editingId }: { open: boolean; onClose: () => void; editingId: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Editar proyecto' : 'Nuevo proyecto'}>
      {open && <ProjectForm key={editingId ?? 'new'} editingId={editingId} onClose={onClose} />}
    </Sheet>
  )
}

function ProjectForm({ editingId, onClose }: { editingId: string | null; onClose: () => void }) {
  const { budgetProjects, allTx, createProject, updateProject, deleteOrArchiveProject } = useFinanzas()

  const editing = editingId ? budgetProjects.find(p => p.id === editingId) ?? null : null
  const hasMovements = editing ? allTx.some(t => t.project_id === editing.id) : false

  const [name, setName] = useState(editing?.name ?? '')
  const [targetRaw, setTargetRaw] = useState(editing ? String(editing.target_amount) : '')
  const [currency, setCurrency] = useState<Currency>(editing?.target_currency ?? 'USD')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Ponele un nombre.')
    const target = editing ? null : parseDecimalInput(targetRaw)
    if (!editing && (!target || target <= 0)) return setError('Ingresá un monto objetivo válido.')

    setSubmitting(true)
    const result = editing
      ? await updateProject(editing.id, { name: name.trim() })
      : await createProject({ name: name.trim(), target_amount: target!, target_currency: currency })
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  async function handleArchiveToggle() {
    if (!editing) return
    setSubmitting(true)
    const result = editing.archived ? await updateProject(editing.id, { archived: false }) : await deleteOrArchiveProject(editing.id)
    setSubmitting(false)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fz-s4)' }}>
      <div>
        <label className="fz-field-label" htmlFor="fz-project-name">
          Nombre
        </label>
        <input
          id="fz-project-name"
          className="fz-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej. Campaña Cliente X"
          autoFocus
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--fz-s3)' }}>
        <div style={{ flex: 1 }}>
          <label className="fz-field-label" htmlFor="fz-project-target">
            Monto objetivo
          </label>
          <div className="fz-amount-field">
            <span className="fz-amount-field__code">{currency}</span>
            <input
              id="fz-project-target"
              inputMode="decimal"
              value={editing ? String(editing.target_amount) : targetRaw}
              onChange={e => setTargetRaw(e.target.value)}
              placeholder="0"
              disabled={Boolean(editing)}
            />
          </div>
        </div>
        <div style={{ width: 110 }}>
          <label className="fz-field-label" htmlFor="fz-project-currency">
            Moneda
          </label>
          <select
            id="fz-project-currency"
            className="fz-input"
            value={currency}
            disabled={Boolean(editing)}
            onChange={e => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {editing && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          El objetivo se congela al crear un proyecto — no se puede editar después. Si cambió, lo más simple es archivar este y crear uno nuevo.
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--fz-out-text)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--fz-s2)' }}>
        {editing && (
          <button
            type="button"
            className="fz-icon-btn"
            style={{ color: 'var(--fz-out-text)' }}
            onClick={handleArchiveToggle}
            disabled={submitting}
            aria-label={editing.archived ? 'Reactivar proyecto' : hasMovements ? 'Archivar proyecto' : 'Borrar proyecto'}
            title={editing.archived ? 'Reactivar' : hasMovements ? 'Archivar' : 'Borrar'}
          >
            {editing.archived ? <IconRestore size={18} /> : hasMovements ? <IconArchive size={18} /> : <IconTrash size={18} />}
          </button>
        )}
        <Btn variant="primary" block onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear proyecto'}
        </Btn>
      </div>

      {editing && !editing.archived && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          {hasMovements
            ? 'Este proyecto tiene movimientos — se archiva en vez de borrarse. Se puede reactivar después.'
            : 'Este proyecto no tiene movimientos todavía — se puede borrar directo.'}
        </p>
      )}
      {editing?.archived && (
        <p style={{ fontSize: 12, color: 'var(--fz-ink-3)' }}>
          Este proyecto está archivado. Reactivarlo lo vuelve a mostrar en la lista y en el quick-add.
        </p>
      )}
    </div>
  )
}

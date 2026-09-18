'use client'

import { useMemo, useState } from 'react'
import { IconPlus, IconUserCircle } from '@tabler/icons-react'
import { useFinanzas } from './data-context'

/** Combobox de persona con creación inline — escribís el nombre, si no
 * existe se ofrece crearla ahí mismo, sin salir del formulario que la usa
 * (sprint-2-deudas.md §0, "Personas con creación inline"). */
export function PersonPicker({
  value,
  onChange,
  placeholder = 'Nombre de la persona',
}: {
  value: string | null
  onChange: (personId: string | null) => void
  placeholder?: string
}) {
  const { activePeople, people, createPerson, updatePerson } = useFinanzas()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = activePeople.find(p => p.id === value)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activePeople
    return activePeople.filter(p => p.name.toLowerCase().includes(q))
  }, [activePeople, query])

  const normQuery = query.trim().toLowerCase()
  const exactActive = activePeople.some(p => p.name.trim().toLowerCase() === normQuery)
  // Una persona archivada con ese mismo nombre: en vez de crear una segunda
  // (el índice único es parcial `where not archived`, así que la dejaría
  // pasar), se ofrece reactivar la que ya existe.
  const archivedMatch = people.find(p => p.archived && p.name.trim().toLowerCase() === normQuery)

  async function handleCreate() {
    const name = query.trim()
    if (!name || creating) return
    setError(null)
    setCreating(true)
    const result = archivedMatch
      ? await updatePerson(archivedMatch.id, { archived: false })
      : await createPerson(name)
    setCreating(false)
    if (result.error) {
      // Sin esto, un fallo (RLS, red, o el índice único) no mostraba nada.
      setError(result.error)
      return
    }
    const id = archivedMatch ? archivedMatch.id : (result as { id?: string }).id
    if (id) {
      onChange(id)
      setQuery('')
      setOpen(false)
    }
  }

  if (selected && !open) {
    return (
      <button
        type="button"
        className="fz-input"
        style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer' }}
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
      >
        <IconUserCircle size={18} style={{ color: 'var(--fz-tint-neutral-fg)' }} />
        {selected.name}
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="fz-input"
        value={query}
        placeholder={placeholder}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div
          className="fz-panel"
          style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 10, padding: 6, maxHeight: 220, overflowY: 'auto' }}
        >
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className="fz-chip"
              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(p.id)
                setQuery('')
                setOpen(false)
              }}
            >
              <IconUserCircle size={16} /> {p.name}
            </button>
          ))}
          {query.trim() && !exactActive && (
            <button
              type="button"
              className="fz-chip"
              data-active
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onMouseDown={e => e.preventDefault()}
              onClick={handleCreate}
              disabled={creating}
            >
              <IconPlus size={16} />{' '}
              {creating
                ? 'Guardando…'
                : archivedMatch
                  ? `Reactivar "${archivedMatch.name}"`
                  : `Crear "${query.trim()}"`}
            </button>
          )}
          {matches.length === 0 && !query.trim() && (
            <p style={{ fontSize: 13, color: 'var(--fz-ink-3)', padding: '6px 10px' }}>Escribí un nombre para buscar o crear.</p>
          )}
          {error && (
            <p role="alert" style={{ fontSize: 12, color: 'var(--fz-out-text)', fontWeight: 600, padding: '4px 10px' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { IconChevronDown, IconCheck, IconPlus } from '@tabler/icons-react'
import { ACCENT_HEX, type AccentKey } from '@/lib/finanzas/profiles'
import { Sheet } from './ui'
import { useFinanzas } from './data-context'
import { ProfileSheet } from './profile-sheet'

function Swatch({ accent }: { accent: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT_HEX[accent as AccentKey] ?? ACCENT_HEX.verde, display: 'inline-block', flexShrink: 0 }}
    />
  )
}

/** Botón del header del Home + su sheet de cambiar (sprint-8-perfiles.md
 *  §5). Solo se renderiza con 2+ perfiles (§4.3) — con uno solo no hay nada
 *  que elegir, y la app no le mete un selector de un solo ítem. Crear
 *  perfiles nuevos vive en Ajustes → Perfiles, no acá. */
export function ProfileSwitcher() {
  const { profiles, activeProfile } = useFinanzas()
  const [open, setOpen] = useState(false)

  if (profiles.length <= 1 || !activeProfile) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--fz-ink-2)',
        }}
      >
        <Swatch accent={activeProfile.accent} />
        {activeProfile.name}
        <IconChevronDown size={14} />
      </button>
      <ProfileSwitchSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ProfileSwitchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles, activeProfileId, switchProfile } = useFinanzas()
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined)
  const visible = profiles.filter(p => !p.archived)

  return (
    <>
      <Sheet open={open && editingId === undefined} onClose={onClose} title="Cambiar de perfil">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(p => (
            <button
              key={p.id}
              type="button"
              className="fz-panel"
              onClick={() => {
                switchProfile(p.id)
                onClose()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                padding: 'var(--fz-s3) var(--fz-s4)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                <Swatch accent={p.accent} />
                {p.name}
              </span>
              {p.id === activeProfileId && <IconCheck size={16} style={{ color: 'var(--fz-accent)' }} />}
            </button>
          ))}
          <button
            type="button"
            className="fz-chip"
            onClick={() => setEditingId(null)}
            style={{ justifyContent: 'center' }}
          >
            <IconPlus size={16} /> Nuevo perfil
          </button>
        </div>
      </Sheet>
      <ProfileSheet
        open={editingId !== undefined}
        editingId={editingId ?? null}
        onClose={() => {
          setEditingId(undefined)
          onClose()
        }}
      />
    </>
  )
}

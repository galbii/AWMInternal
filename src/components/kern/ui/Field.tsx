'use client'

// K 514-545 — the detail editor's field builders.

import React from 'react'

export function Field({
  label,
  value,
  type = 'text',
  onInput,
}: {
  label: string
  value: string
  type?: string
  onInput: (v: string) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value || ''} onChange={(e) => onInput(e.target.value)} />
    </div>
  )
}

export function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === '' ? '—' : o}
          </option>
        ))}
      </select>
    </div>
  )
}

export function EntitySelectField({
  label,
  list,
  value,
  onChange,
}: {
  label: string
  list: { id: string; name: string }[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * K 538-546 — an area/region/division manager, edited in place.
 *
 * Editing here writes to the ENTITY, so it updates that manager everywhere.
 * With no entity assigned the input is disabled and explains why.
 */
export function ManagerField({
  label,
  manager,
  disabledHint,
  onInput,
}: {
  label: string
  manager: string | null
  disabledHint: string
  onInput?: (v: string) => void
}) {
  const disabled = manager === null
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        disabled={disabled}
        placeholder={disabled ? disabledHint : undefined}
        value={disabled ? '' : manager}
        onChange={(e) => onInput?.(e.target.value)}
      />
    </div>
  )
}

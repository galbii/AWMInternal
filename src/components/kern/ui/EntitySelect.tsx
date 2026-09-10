'use client'

// K 253-257 (simpleSelect) — a "— placeholder —" plus one option per entity.

import React from 'react'

export default function EntitySelect({
  list,
  value,
  placeholder,
  onChange,
}: {
  list: { id: string; name: string }[]
  value: string | null
  placeholder: string
  onChange: (id: string | null) => void
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {list.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  )
}

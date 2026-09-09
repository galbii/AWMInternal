'use client'

// K 394-413 — the add/remove name list used for processors, LOAs and
// "serviced by". Enter or blur commits; the × removes.

import React, { useState } from 'react'

export default function ChipsEditor({
  values,
  placeholder,
  onChange,
}: {
  values: string[]
  placeholder: string
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const commit = (): void => {
    const v = draft.trim()
    if (!v) return
    if (!values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  return (
    <div className="chips">
      {values.map((v, i) => (
        <span className="chip-item" key={`${v}-${i}`}>
          <span>{v}</span>
          <button
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="chip-add"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}

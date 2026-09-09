'use client'

// K 850-854 — the segmented control used by every analytics tab.

import React from 'react'

export interface SegOption<T extends string | number> {
  v: T
  label: string
}

export default function SegToggle<T extends string | number>({
  options,
  current,
  onPick,
}: {
  options: SegOption<T>[]
  current: T
  onPick: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.v)}
          className={`seg-btn${o.v === current ? ' on' : ''}`}
          onClick={() => onPick(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

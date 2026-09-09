'use client'

// K 228-240 — the toolbar every list tab shares: an optional add button, an
// optional search box bound to the provider's shared filter, then whatever the
// tab appends, right-aligned after a spacer.

import React from 'react'

import { useKern } from '../KernProvider'

export default function Toolbar({
  addLabel,
  onAdd,
  showSearch,
  searchPlaceholder,
  children,
}: {
  addLabel?: string
  onAdd?: () => void
  showSearch?: boolean
  searchPlaceholder?: string
  children?: React.ReactNode
}) {
  const { filter, setFilter } = useKern()
  return (
    <div className="toolbar">
      {onAdd && (
        <button className="primary" onClick={onAdd}>
          + {addLabel}
        </button>
      )}
      {showSearch && (
        <input
          className="search"
          placeholder={searchPlaceholder ?? 'Search…'}
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
        />
      )}
      <div className="grow" />
      {children}
    </div>
  )
}

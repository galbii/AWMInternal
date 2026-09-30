'use client'

// The "view as" people picker — the CONTENTS of a ShellMenu panel, never a
// popover of its own (nesting two ShellMenus would double the outside-click,
// blur and Escape handling). Two hosts render it:
//
//  - the account menu, where an admin/dev STARTS emulating, and
//  - while emulating, the amber bar's own "Switch" pill, so hopping from one
//    person to the next is one click instead of exit → reload → reopen → pick.
//
// Switching mid-emulation needs no new server door: POST /api/emulate simply
// overwrites the cookie, and it authorizes off the real ACTOR, whose role
// src/lib/auth/viewer.ts re-checks on every request. The host reloads after a
// pick because every app's chrome and data are server-rendered as the viewer.
//
// Recents come from src/lib/users/view-as-recent.ts (per browser) and are
// PRUNED against the roster this component is handed, so an account that was
// deleted, blocked from view-as, or that this actor can no longer see simply
// falls out of the list.

import { Search } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { initialsOf } from '@/lib/users/initials'
import { readViewAsRecent, rememberViewAs } from '@/lib/users/view-as-recent'

export interface ViewAsPerson {
  id: string
  label: string
}

/** Below this many people the filter field is noise, not help. */
const SEARCH_FROM = 7

export interface ViewAsListProps {
  /** Every account the actor may view as: self and emulation-blocked excluded upstream. */
  people: ViewAsPerson[]
  /** The id being viewed as right now, or null when not emulating. */
  currentId: string | null
  /** True while a pick is in flight — the host owns the request. */
  disabled?: boolean
  /** The host popover's open state (ShellMenu passes it to its render function). */
  open?: boolean
  /** Take focus when the panel opens: for the Switch pill, whose panel IS this. */
  autoFocus?: boolean
  onPick: (userId: string) => void
}

export default function ViewAsList({
  people,
  currentId,
  disabled = false,
  open = false,
  autoFocus = false,
  onPick,
}: ViewAsListProps): React.JSX.Element {
  const [q, setQ] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Re-read on every open: another tab may have viewed as someone since.
  useEffect(() => setRecentIds(readViewAsRecent()), [open])

  // A closed panel is `inert`, so this can only ever run once it is live.
  useEffect(() => {
    if (open && autoFocus) inputRef.current?.focus()
    if (!open) setQ('')
  }, [open, autoFocus])

  const needle = q.trim().toLowerCase()

  const shown = useMemo(
    () => (needle ? people.filter((p) => p.label.toLowerCase().includes(needle)) : people),
    [people, needle],
  )

  // While filtering, the search covers everyone — splitting out recents would
  // just show the same person twice for no reason.
  const recent = useMemo(() => {
    if (needle) return []
    const byId = new Map(people.map((p) => [p.id, p]))
    const out: ViewAsPerson[] = []
    for (const id of recentIds) {
      const p = byId.get(id)
      if (p && p.id !== currentId) out.push(p)
    }
    return out
  }, [recentIds, people, needle, currentId])

  const pick = (id: string): void => {
    if (disabled || id === currentId) return
    rememberViewAs(id)
    onPick(id)
  }

  // `where` keeps the keys unique: a recent person is also in "Everyone".
  const row = (p: ViewAsPerson, where: 'r' | 'a'): React.JSX.Element => {
    const isNow = p.id === currentId
    return (
      <button
        key={where + p.id}
        type="button"
        className="va-item"
        data-shm-item
        disabled={disabled || isNow}
        aria-current={isNow ? 'true' : undefined}
        onClick={() => pick(p.id)}
      >
        <span className="va-av" aria-hidden="true">
          {initialsOf(p.label)}
        </span>
        <span className="va-name">{p.label}</span>
        {isNow ? <span className="va-now">now</span> : null}
      </button>
    )
  }

  return (
    <div className="va">
      {people.length >= SEARCH_FROM ? (
        <div className="va-search">
          <Search size={13} strokeWidth={2.25} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="va-input"
            placeholder="Filter people…"
            aria-label="Filter people"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter takes the top hit — type three letters and go.
              if (e.key !== 'Enter') return
              const first = shown.find((p) => p.id !== currentId)
              if (first) {
                e.preventDefault()
                pick(first.id)
              }
            }}
          />
        </div>
      ) : null}

      <div className="va-scroll">
        {recent.length > 0 ? (
          <>
            <div className="va-group">Recent</div>
            {recent.map((p) => row(p, 'r'))}
            <div className="va-group">Everyone</div>
          </>
        ) : null}
        {shown.length > 0 ? (
          shown.map((p) => row(p, 'a'))
        ) : (
          <p className="va-empty">No one matches that.</p>
        )}
      </div>
    </div>
  )
}

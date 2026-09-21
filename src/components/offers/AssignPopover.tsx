'use client'

// The assign picker: a small card pinned (fixed) beside whatever opened it — a
// row's avatar stack, or the selection bar's Assign button — listing everyone
// who can be assigned with a one-click toggle each. Toggles apply immediately
// (the provider is optimistic); nothing to save. Roles stay on the offer page.
//
// For a multi-offer target a person can be assigned to all, some, or none of
// the offers: the check shows which, and a click on "some" completes the set.

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { initialsOf } from '@/lib/users/initials'

import type { AssignUser } from './AssignmentsProvider'

export interface AssignTarget {
  ids: string[]
  /** Where the opener sits on screen — the card hangs from its right edge. */
  rect: DOMRect
  /** "Maya Okafor", or "3 selected". */
  title: string
}

export type AssignState = 'all' | 'some' | 'none'

interface AssignPopoverProps {
  target: AssignTarget
  users: AssignUser[]
  stateFor(userId: string): AssignState
  onToggle(userId: string, on: boolean): void | Promise<void>
  onClose(): void
}

const WIDTH = 272
const HEIGHT = 380
const GAP = 6
const EDGE = 8

function place(rect: DOMRect): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const right = Math.max(EDGE, Math.min(vw - rect.right, vw - WIDTH - EDGE))
  const below = rect.bottom + GAP + HEIGHT <= vh || rect.top < vh / 2
  return below
    ? { right, top: Math.min(rect.bottom + GAP, vh - EDGE - 120), bottom: 'auto' }
    : { right, bottom: vh - rect.top + GAP, top: 'auto' }
}

export default function AssignPopover({
  target,
  users,
  stateFor,
  onToggle,
  onClose,
}: AssignPopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [q, setQ] = useState('')
  const style = useMemo(() => place(target.rect), [target.rect])
  const searchable = users.length > 6

  useEffect(() => {
    // Outside click, Escape, or any scroll OUTSIDE the card closes it — a
    // fixed card cannot follow its anchor. Scrolling the list inside is fine.
    const inside = (t: EventTarget | null) => t instanceof Node && Boolean(ref.current?.contains(t))
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = (e: Event) => {
      if (!inside(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    ;(searchable ? searchRef.current : ref.current?.querySelector<HTMLElement>('.asg-opt'))?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, searchable])

  const needle = q.trim().toLowerCase()
  const shown = needle ? users.filter((u) => u.label.toLowerCase().includes(needle)) : users

  return (
    <div
      ref={ref}
      className="asg-pop"
      role="dialog"
      aria-label={'Assign ' + target.title}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="asg-head">
        Assign <strong>{target.title}</strong>
      </div>
      {searchable ? (
        <input
          ref={searchRef}
          type="text"
          className="asg-search"
          placeholder="Search people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      ) : null}
      <div className="asg-list">
        {shown.map((u) => {
          const st = stateFor(u.id)
          return (
            <button
              key={u.id}
              type="button"
              className={'asg-opt ' + st}
              role="checkbox"
              aria-checked={st === 'all' ? true : st === 'some' ? 'mixed' : false}
              onClick={() => void onToggle(u.id, st !== 'all')}
            >
              <span className="asg-av" aria-hidden="true">
                {initialsOf(u.label)}
              </span>
              <span className="asg-opt-label">{u.label}</span>
              <span className="asg-check" aria-hidden="true">
                {st === 'all' ? '✓' : st === 'some' ? '–' : ''}
              </span>
            </button>
          )
        })}
        {shown.length === 0 ? <div className="asg-empty">No one matches.</div> : null}
      </div>
      <div className="asg-foot">Roles are set on the offer&apos;s page.</div>
    </div>
  )
}

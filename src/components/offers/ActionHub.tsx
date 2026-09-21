'use client'

// The corner action hub: a brand-blue disc pinned to the bottom-right that
// unfolds, on hover or tap, into the app's "do something" surface — New
// Request as the hero row, with the import / export / backup operations
// grouped beneath it. It took over from the header's "+ New Request" button
// and "More ▾" menu when the header became a sidebar (2026-09).
//
// Interaction contract:
//  - Mouse: hovering the disc opens the hub after a short intent delay and
//    leaving (disc + card together) closes it after a longer one, so the
//    pointer can travel between the two without the card vanishing.
//  - Touch / keyboard: the disc is a plain toggle. Arrow keys walk the items,
//    Escape closes and hands focus back to the disc, tabbing out closes.
//  - The closed card is `inert` and visibility:hidden, so it is neither
//    focusable nor announced while folded away.

import type { LucideIcon } from 'lucide-react'
import { Plus } from 'lucide-react'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

export interface HubAction {
  id: string
  label: string
  /** One short line under the label: the file type, or what the action needs. */
  hint?: string
  icon: LucideIcon
  run: () => void | Promise<void>
}

export interface HubGroup {
  label: string
  actions: HubAction[]
}

export interface ActionHubProps {
  /** The hero row — the thing people come to the corner for. */
  primary: HubAction
  groups: HubGroup[]
}

const OPEN_DELAY_MS = 70
const CLOSE_DELAY_MS = 260

export default function ActionHub({ primary, groups }: ActionHubProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const schedule = useCallback(
    (next: boolean, ms: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => setOpen(next), ms)
    },
    [clearTimer],
  )

  useEffect(() => clearTimer, [clearTimer])

  // Any click outside closes; Escape closes and returns focus to the disc.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      fabRef.current?.focus()
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menuItems = (): HTMLButtonElement[] =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const focusFirst = () => {
    // The card becomes focusable only after the `inert` flip has committed.
    requestAnimationFrame(() => menuItems()[0]?.focus())
  }

  const select = (a: HubAction) => () => {
    clearTimer()
    setOpen(false)
    void a.run()
  }

  // Hover intent is a mouse-only affordance; touch and pen go through the click.
  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    schedule(true, OPEN_DELAY_MS)
  }
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    schedule(false, CLOSE_DELAY_MS)
  }

  // Tabbing out of the hub folds it away; focus moving within it does not.
  const onBlur = (e: React.FocusEvent) => {
    const el = rootRef.current
    const to = e.relatedTarget
    if (!(to instanceof Node)) return
    if (el && el.contains(to)) return
    setOpen(false)
  }

  const onFabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    clearTimer()
    setOpen(true)
    focusFirst()
  }

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = menuItems()
    if (!items.length) return
    const i = items.findIndex((el) => el === document.activeElement)
    let n = 0
    if (e.key === 'ArrowDown') n = (i + 1) % items.length
    else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length
    else if (e.key === 'End') n = items.length - 1
    e.preventDefault()
    items[n]?.focus()
  }

  const PrimaryIcon = primary.icon

  return (
    <div
      ref={rootRef}
      className={open ? 'ah open' : 'ah'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      <div
        ref={panelRef}
        id={panelId}
        className="ah-panel"
        role="menu"
        aria-label="Quick actions"
        inert={!open}
        onKeyDown={onPanelKeyDown}
      >
        <button type="button" role="menuitem" className="ah-hero" onClick={select(primary)}>
          <span className="ah-hero-icon" aria-hidden="true">
            <PrimaryIcon size={18} strokeWidth={2.25} />
          </span>
          <span className="ah-text">
            <span className="ah-label">{primary.label}</span>
            {primary.hint ? <span className="ah-hint">{primary.hint}</span> : null}
          </span>
        </button>

        {groups.map((g) => (
          <div className="ah-group" key={g.label}>
            <div className="ah-group-label">{g.label}</div>
            {g.actions.map((a) => {
              const Icon = a.icon
              return (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className="ah-item"
                  onClick={select(a)}
                >
                  <Icon className="ah-item-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="ah-text">
                    <span className="ah-label">{a.label}</span>
                    {a.hint ? <span className="ah-hint">{a.hint}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <button
        ref={fabRef}
        type="button"
        className="ah-fab"
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        title="New request and more"
        onClick={() => {
          clearTimer()
          setOpen((o) => !o)
        }}
        onKeyDown={onFabKeyDown}
      >
        <Plus size={24} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  )
}

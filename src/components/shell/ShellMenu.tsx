'use client'

// One small dark popover for the session bar. The app switcher and the account
// menu are both instances of it, so the two halves of the bar open, move and
// close the same way.
//
//  - Click toggles; outside click, Escape (focus returns to the trigger) and
//    tabbing out all close it.
//  - Arrow keys walk the items. Items opt in with `data-shm-item`; a native
//    <select> inside keeps its own arrow keys, and a text <input> (the view-as
//    filter) keeps Home/End/ArrowUp for editing — ArrowDown leaves it for the
//    list.
//  - Activating an item closes the popover, except a <select>, which stays
//    open while it is being used.
//  - The closed panel is `inert` and visibility:hidden, so it is neither
//    focusable nor announced while folded away.

import { ChevronDown } from 'lucide-react'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

export interface ShellMenuProps {
  /** Contents of the trigger button; a chevron is appended automatically. */
  trigger: React.ReactNode
  triggerClassName: string
  /** A short hint shown as the trigger's tooltip ("Switch app"). */
  triggerTitle?: string
  /** Which edge of the trigger the panel hangs from. */
  align?: 'start' | 'end'
  /** Set when every item is a menuitem*; leave unset for mixed content. */
  panelRole?: 'menu'
  panelLabel?: string
  /** A function child also receives the panel's open state (the view-as
      filter uses it to take focus and to reset itself on close). */
  children: React.ReactNode | ((close: () => void, open: boolean) => React.ReactNode)
}

const ITEM = '[data-shm-item]'

export default function ShellMenu({
  trigger,
  triggerClassName,
  triggerTitle,
  align = 'start',
  panelRole,
  panelLabel,
  children,
}: ShellMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  const close = useCallback(() => setOpen(false), [])

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
      triggerRef.current?.focus()
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = (): HTMLElement[] =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []).filter(
      (el) => !(el as HTMLButtonElement).disabled,
    )

  /** Focus the item at `i` (negative counts from the end) once the panel is live. */
  const focusItem = (i: number) => {
    requestAnimationFrame(() => {
      const list = items()
      if (list.length) list[(i + list.length) % list.length]?.focus()
    })
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    setOpen(true)
    focusItem(e.key === 'ArrowDown' ? 0 : -1)
  }

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const target = e.target as HTMLElement
    if (target.tagName === 'SELECT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return
    if (target.tagName === 'INPUT' && e.key !== 'ArrowDown') return
    const list = items()
    if (!list.length) return
    const i = list.indexOf(document.activeElement as HTMLElement)
    let n = 0
    if (e.key === 'ArrowDown') n = (i + 1) % list.length
    else if (e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length
    else if (e.key === 'End') n = list.length - 1
    e.preventDefault()
    list[n]?.focus()
  }

  // Tabbing out of the popover folds it away; focus moving within it does not.
  const onBlur = (e: React.FocusEvent) => {
    const to = e.relatedTarget
    if (!(to instanceof Node)) return
    if (rootRef.current?.contains(to)) return
    setOpen(false)
  }

  const onPanelClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest(ITEM)
    if (el && el.tagName !== 'SELECT') setOpen(false)
  }

  const cls = ['shm', align === 'end' ? 'shm-end' : '', open ? 'open' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={cls} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        title={triggerTitle}
        aria-haspopup={panelRole ?? 'true'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
        <ChevronDown className="shm-chev" size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className="shm-panel"
        role={panelRole}
        aria-label={panelLabel}
        inert={!open}
        onKeyDown={onPanelKeyDown}
        onClick={onPanelClick}
      >
        {typeof children === 'function' ? children(close, open) : children}
      </div>
    </div>
  )
}

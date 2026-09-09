'use client'

// K 198-207 — the destructive-action confirm. The source drove a native
// <dialog> imperatively via showModal(); here the element is rendered
// declaratively and showModal()/close() is called to match, which is what
// gives us the ::backdrop and focus trapping for free.

import React, { useEffect, useRef } from 'react'

import type { ConfirmState } from '@/lib/kern/types'

export default function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (state && !d.open) d.showModal()
    if (!state && d.open) d.close()
  }, [state])

  return (
    <dialog
      className="kern-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dlg-body">
        <h3>{state?.title}</h3>
        <div className="muted">{state?.msg}</div>
      </div>
      <div className="dlg-actions">
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="danger"
          onClick={() => {
            state?.onYes()
            onClose()
          }}
        >
          {state?.yesLabel || 'Delete'}
        </button>
      </div>
    </dialog>
  )
}

'use client'

// K 141-145 — one toast at a time, auto-dismissing.

import React, { useEffect } from 'react'

import type { ToastState } from '@/lib/kern/types'

export default function Toast({ state, onDone }: { state: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!state) return
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [state, onDone])

  if (!state) return null
  return (
    <div className={`toast show${state.err ? ' err' : ''}`} role="status" aria-live="polite">
      {state.msg}
    </div>
  )
}

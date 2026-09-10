'use client'

// K 855-862 — include/exclude the untagged "Other" production bucket. Shares
// state.prodExcluded with the Data tab's tick boxes on purpose: excluding Other
// in one place excludes it everywhere.

import React from 'react'

import { isIncluded } from '@/lib/kern/production'

import { useKern } from '../KernProvider'

export default function OtherToggle() {
  const { state, update } = useKern()
  const on = isIncluded(state, 'OTHER')
  return (
    <button
      className={`sm ${on ? 'primary' : 'ghost'}`}
      title="Include or exclude the untagged “Other” production from this view (shared with the Data tab)."
      onClick={() =>
        update((d) => {
          const next = { ...d.prodExcluded }
          if (on) next.OTHER = true
          else delete next.OTHER
          d.prodExcluded = next
        })
      }
    >
      {on ? '✓ ' : ''}Other
    </button>
  )
}

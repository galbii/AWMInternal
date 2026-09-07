'use client'

// Shell for /offers/[id]: the letter workspace (the SAME LetterView island the
// SPA uses — provider runs in standalone mode with view=editor/sub=letter) plus
// the history + assignments sidebar. The sidebar is a SIBLING of the letter and
// refreshes itself client-side only, so a sidebar update can never remount the
// contenteditable letter island and destroy hand edits.

import Link from 'next/link'
import React from 'react'

import LetterView from '@/components/offers/LetterView'

import OfferSidebar from './OfferSidebar'

interface OfferDetailProps {
  recordId: string
  name: string
  /** True while a dev is emulating — the letter is display-only. */
  readOnly: boolean
}

export default function OfferDetail({
  recordId,
  name,
  readOnly,
}: OfferDetailProps): React.JSX.Element {
  return (
    <div className="offer-detail">
      <div className="od-main">
        <div className="od-head">
          <Link className="od-back" href="/">
            ← All requests
          </Link>
          <h2>{name}</h2>
        </div>
        {readOnly && (
          <div className="od-readonly">Viewing as another user — changes are disabled.</div>
        )}
        <div className={readOnly ? 'od-letter od-letter-locked' : 'od-letter'}>
          <LetterView />
        </div>
      </div>
      <OfferSidebar recordId={recordId} />
    </div>
  )
}

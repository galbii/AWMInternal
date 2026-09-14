'use client'

// The offer workspace at /offers/[id]: everything needed to manage ONE offer
// letter end to end — the letter itself, the 42-question details form behind it,
// who is assigned, and the change history — without bouncing back to the SPA.
//
// Three structural rules this file exists to hold:
//
//  1. BOTH sub-views stay mounted and are shown/hidden by `.subview.active`,
//     exactly as OfferManager does. The letter is a contenteditable island
//     rendered once via dangerouslySetInnerHTML; unmounting it on a tab switch
//     would throw away the user's hand edits.
//  2. The sidebar is a SIBLING of the letter and refreshes itself client-side,
//     so a sidebar update can never re-render the letter island.
//  3. Tab switching goes through the provider (`openLetter` / `showSub`) rather
//     than local state, because `openLetter` is what flushes the form's pending
//     600ms autosave before the letter re-resolves from the record.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'

import LetterView from '@/components/offers/LetterView'
import { useOffers } from '@/components/offers/OffersProvider'
import RequestForm from '@/components/offers/RequestForm'
import type { EditorSub, Stage } from '@/lib/offers/types'

import OfferSidebar from './OfferSidebar'

const STAGE_LABEL: Record<Stage, string> = {
  pipeline: 'Pipeline',
  hired: 'Hired',
  archived: 'Archived',
}

interface OfferDetailProps {
  recordId: string
  /** Server-rendered name, so the header is right before the client hydrates. */
  name: string
  /** True while a dev is emulating — the whole workspace is display-only. */
  readOnly: boolean
}

export default function OfferDetail({
  recordId,
  name,
  readOnly,
}: OfferDetailProps): React.JSX.Element {
  const api = useOffers()
  const router = useRouter()

  const rec = api.records.find((r) => r.id === recordId) || null
  const d = rec ? rec.data : {}
  const stage: Stage = (rec && rec.stage) || 'pipeline'

  // Follow the live record once hydrated, so renaming on the details tab retitles
  // the page without a round trip.
  const title = (d.employeeName || '').trim() || (d.preferredName || '').trim() || name
  const meta = [d.position, d.branchName].filter(Boolean).join(' · ')

  const subViewCls = (s: EditorSub): string => (api.sub === s ? 'subview active' : 'subview')
  const subTabCls = (s: EditorSub): string => (api.sub === s ? 'subtab active' : 'subtab')

  /** Stage moves available from here, given where the record is now. */
  const stageActions: [Stage, string, string][] =
    stage === 'pipeline'
      ? [
          ['hired', 'Hired', 'od-mini ok'],
          ['archived', 'Archive', 'od-mini warn'],
        ]
      : stage === 'hired'
        ? [
            ['pipeline', 'To Pipeline', 'od-mini'],
            ['archived', 'Archive', 'od-mini warn'],
          ]
        : [['pipeline', 'Restore', 'od-mini']]

  return (
    <div className="offer-detail">
      <div className="od-main">
        <div className="od-head">
          <Link className="od-back" href="/offers">
            ← All requests
          </Link>
          <h2>{title}</h2>
          {meta ? <span className="od-sub">{meta}</span> : null}
          <span className={'od-stage od-stage-' + stage}>{STAGE_LABEL[stage]}</span>
          {readOnly ? null : (
            <div className="od-head-actions">
              {stageActions.map(([to, label, cls]) => (
                <button
                  key={to}
                  type="button"
                  className={cls}
                  onClick={() => api.setStage(recordId, to)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {readOnly && (
          <div className="od-readonly">Viewing as another user — changes are disabled.</div>
        )}

        <div className="subtabs">
          <button type="button" className={subTabCls('letter')} onClick={api.openLetter}>
            Offer Letter
          </button>
          <button
            type="button"
            className={subTabCls('details')}
            onClick={() => api.showSub('details')}
          >
            New Hire Details
          </button>
        </div>

        <div className={subViewCls('letter')}>
          <div className={readOnly ? 'od-letter od-letter-locked' : 'od-letter'}>
            <LetterView standalone />
          </div>
        </div>

        <div className={subViewCls('details')}>
          <div className={readOnly ? 'od-details od-details-locked' : 'od-details'}>
            <RequestForm standalone onDeleted={() => router.push('/offers')} />
          </div>
        </div>
      </div>

      <OfferSidebar recordId={recordId} />
    </div>
  )
}

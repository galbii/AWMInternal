'use client'

// The activity rail on /offers/[id]: the audit feed, newest first, with the
// actor's initials and a relative time. Purely presentational — the page
// fetches (useOfferTimeline) and hands the events down, so the rail can never
// trigger a fetch of its own, let alone a re-render of the letter island.
//
// The rail RESTS COLLAPSED (2026-09-26), the same contract as the offers
// sidebar's `.om-collapsed`: a slim vertical tab on the right edge, which
// POINTING AT unfolds into the full panel and CLICKING pins open. The panel is
// always in the markup — collapsing is CSS, not a second tree — because a peek
// has to be able to reveal it without React re-rendering anything beside the
// letter island.
//
// The grid COLUMN stays 44px through a peek; only `.od-side-inner` widens, and
// it widens OVER the letter. That matters more here than on the list view:
// `.letter-preview-area` is a size container driving the sheet's zoom steps, so
// reflowing the pane mid-sweep would re-scale the letter under the pointer.
//
// offers.css narrows the page grid with a `:has(.od-side-closed)` rule, so
// OfferDetail needs no knowledge of any of this.

import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import ActivityFeed from '@/components/offers/ActivityFeed'
import NoteComposer from '@/components/offers/NoteComposer'

import type { TimelineEvent } from './useOfferTimeline'

interface OfferSidebarProps {
  /** null while the first fetch is in flight. */
  events: TimelineEvent[] | null
  error: string | null
  onRefresh: () => void
  /** The offer these events belong to — the note composer posts against it. */
  offerId: string
  /** A note just added, shown at once rather than waiting for a refetch. */
  onNoteAdded: (event: TimelineEvent) => void
}

/** localStorage key for the pinned state (a new key; the frozen onhr_* set is untouched). */
const RAIL_KEY = 'onhr_activity_rail'

export default function OfferSidebar({
  events,
  error,
  onRefresh,
  offerId,
  onNoteAdded,
}: OfferSidebarProps): React.JSX.Element {
  // Rests collapsed. Only an explicit pin opens it, so the letter gets the
  // width by default and the feed is a hover away.
  const [pinned, setPinned] = useState(false)

  // Read after mount so the server and first client render agree (collapsed).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === 'open') setPinned(true)
    } catch {
      /* stay collapsed */
    }
  }, [])

  const toggle = (next: boolean): void => {
    setPinned(next)
    try {
      window.localStorage.setItem(RAIL_KEY, next ? 'open' : 'closed')
    } catch {
      /* the choice just does not persist */
    }
  }

  const n = events ? events.length : 0

  return (
    <aside className={pinned ? 'od-side' : 'od-side od-side-closed'}>
      <div className="od-side-inner">
        {/* The resting tab. Pointing at the rail reveals the panel (CSS);
            clicking pins it open. On a touch screen there is no hover, so this
            click is the only way in — exactly as it was before. */}
        <button
          type="button"
          className="od-rail-tab"
          onClick={() => toggle(true)}
          aria-expanded={false}
          title="Pin recent activity open"
        >
          <ChevronsLeft size={14} strokeWidth={2} aria-hidden="true" />
          <span className="od-rail-tab-label">Recent activity</span>
          {n > 0 ? <span className="od-rail-count">{n}</span> : null}
        </button>

        <section className="od-panel od-activity">
          <div className="od-panel-head">
            <h3>Recent activity</h3>
            <div className="od-panel-tools">
              <button className="od-mini" type="button" onClick={onRefresh}>
                Refresh
              </button>
              <button
                className="od-mini od-rail-toggle"
                type="button"
                onClick={() => toggle(!pinned)}
                aria-expanded={pinned}
                aria-label={pinned ? 'Collapse recent activity to a rail' : 'Pin recent activity open'}
                title={pinned ? 'Collapse to a rail' : 'Pin open'}
              >
                {pinned ? (
                  <ChevronsRight size={14} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ChevronsLeft size={14} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {/* Above the feed: a note IS a feed entry, written on purpose. */}
          <NoteComposer offerId={offerId} onAdded={onNoteAdded} />
          {error && <div className="od-error">{error}</div>}
          {!events && !error && <div className="od-dim">Loading…</div>}
          {events && events.length === 0 && <div className="od-dim">Nothing yet.</div>}
          {events && events.length > 0 && <ActivityFeed events={events} />}
        </section>
      </div>
    </aside>
  )
}

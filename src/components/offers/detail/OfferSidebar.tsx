'use client'

// The activity rail on /offers/[id]: the audit feed, newest first, with the
// actor's initials and a relative time. Purely presentational — the page
// fetches (useOfferTimeline) and hands the events down, so the rail can never
// trigger a fetch of its own, let alone a re-render of the letter island.
//
// The rail FOLDS: a control in its head tucks it into a slim vertical tab on
// the right edge (with the event count), and the tab opens it again. The
// choice is remembered per browser. offers.css narrows the page grid with a
// `:has(.od-side-closed)` rule, so OfferDetail needs no knowledge of it.

import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { relativeTime } from '@/lib/offers/summary'
import { initialsOf } from '@/lib/users/initials'

import type { TimelineEvent } from './useOfferTimeline'

const KIND_LABEL: Record<string, string> = {
  created: 'Created',
  'field-edit': 'Edited',
  'stage-change': 'Stage',
  'letter-updated': 'Letter',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  'assignment-role-change': 'Role',
  deleted: 'Deleted',
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

interface OfferSidebarProps {
  /** null while the first fetch is in flight. */
  events: TimelineEvent[] | null
  error: string | null
  onRefresh: () => void
}

/** localStorage key for the folded state (a new key; the frozen onhr_* set is untouched). */
const RAIL_KEY = 'onhr_activity_rail'

export default function OfferSidebar({
  events,
  error,
  onRefresh,
}: OfferSidebarProps): React.JSX.Element {
  const [open, setOpen] = useState(true)

  // Read after mount so the server and first client render agree (open).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === 'closed') setOpen(false)
    } catch {
      /* stay open */
    }
  }, [])

  const toggle = (next: boolean): void => {
    setOpen(next)
    try {
      window.localStorage.setItem(RAIL_KEY, next ? 'open' : 'closed')
    } catch {
      /* the choice just does not persist */
    }
  }

  if (!open) {
    const n = events ? events.length : 0
    return (
      <aside className="od-side od-side-closed">
        <button
          type="button"
          className="od-rail-tab"
          onClick={() => toggle(true)}
          aria-expanded={false}
          title="Show recent activity"
        >
          <ChevronsLeft size={14} strokeWidth={2} aria-hidden="true" />
          <span className="od-rail-tab-label">Recent activity</span>
          {n > 0 ? <span className="od-rail-count">{n}</span> : null}
        </button>
      </aside>
    )
  }

  return (
    <aside className="od-side">
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
              onClick={() => toggle(false)}
              aria-expanded={true}
              aria-label="Hide recent activity"
              title="Hide recent activity"
            >
              <ChevronsRight size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
        {error && <div className="od-error">{error}</div>}
        {!events && !error && <div className="od-dim">Loading…</div>}
        {events && events.length === 0 && <div className="od-dim">Nothing yet.</div>}
        {events && events.length > 0 && (
          <ol className="od-events">
            {events.map((e) => (
              <li key={e.id} className="od-event">
                <span className="od-avatar od-avatar-sm" title={e.actorLabel} aria-hidden="true">
                  {initialsOf(e.actorLabel)}
                </span>
                <div className="od-event-body">
                  <div className="od-summary">
                    <span className={`od-kind od-kind-${e.kind}`}>
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                    {e.summary}
                    {e.targetLabel && <> — {e.targetLabel}</>}
                    {e.kind === 'field-edit' && e.editCount > 1 && (
                      <span className="od-dim"> ({e.editCount} saves)</span>
                    )}
                  </div>
                  {e.changes.length > 0 && (
                    <details className="od-changes">
                      <summary>
                        {e.changes.length} change{e.changes.length === 1 ? '' : 's'}
                      </summary>
                      <ul>
                        {e.changes.map((c) => (
                          <li key={c.field}>
                            <strong>{c.label}:</strong>{' '}
                            <span className="od-from">{c.from || '(empty)'}</span> →{' '}
                            <span className="od-to">{c.to || '(empty)'}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="od-meta">
                    {e.actorLabel} ·{' '}
                    <time dateTime={e.at} title={fmtWhen(e.at)}>
                      {relativeTime(e.at)}
                    </time>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}

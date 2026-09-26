'use client'

// The activity list itself — the same markup on /offers/[id]'s rail and on
// the Analysis view's cross-offer feed (which passes `showOffer` so each
// entry names, and links to, the offer it belongs to). Purely presentational;
// whoever renders it owns the fetch.

import Link from 'next/link'
import React from 'react'

import { KIND_LABEL, type ActivityEvent } from '@/lib/offers/activity'
import { relativeTime } from '@/lib/offers/summary'
import { initialsOf } from '@/lib/users/initials'

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function ActivityFeed({
  events,
  showOffer,
}: {
  events: ActivityEvent[]
  /** Name and link the offer on each entry (the cross-offer feed). */
  showOffer?: boolean
}): React.JSX.Element {
  return (
    <ol className="od-events">
      {events.map((e) => (
        <li key={e.id} className="od-event">
          <span className="od-avatar od-avatar-sm" title={e.actorLabel} aria-hidden="true">
            {initialsOf(e.actorLabel)}
          </span>
          <div className="od-event-body">
            <div className="od-summary">
              <span className={`od-kind od-kind-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span>
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
              {showOffer && e.offerTitle ? (
                <>
                  {' · '}
                  {e.kind === 'deleted' ? (
                    <span className="od-offer-link od-offer-gone">{e.offerTitle}</span>
                  ) : (
                    <Link className="od-offer-link" href={'/offers/' + e.offerId}>
                      {e.offerTitle}
                    </Link>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

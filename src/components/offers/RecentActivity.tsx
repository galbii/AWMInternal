'use client'

// "Recent activity" on the Analysis view: every change across every request,
// newest first, with a kind filter and paging. Fed by /api/offer-activity.
//
// It loads when the Analysis view is opened and refetches on its own a few
// seconds after the record list changes (an autosave lands, a stage moves,
// an import arrives), the same settle the per-offer rail uses — so it keeps
// up without anyone pressing Refresh.

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { ACTIVITY_FILTERS, type ActivityEvent, type ActivityFilter } from '@/lib/offers/activity'

import ActivityFeed from './ActivityFeed'
import { useOffers } from './OffersProvider'

const PAGE = 40
/** The audit row is written by the save it rides on; give that save time to land. */
const SETTLE_MS = 2500

interface Page {
  events: ActivityEvent[]
  nextBefore: string | null
}

export default function RecentActivity(): React.JSX.Element {
  const api = useOffers()
  const active = api.view === 'analysis'

  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchPage = useCallback(
    async (f: ActivityFilter, before: string | null): Promise<Page | null> => {
      const q = new URLSearchParams({ limit: String(PAGE), filter: f })
      if (before) q.set('before', before)
      const res = await fetch('/api/offer-activity?' + q.toString(), {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) return null
      return (await res.json()) as Page
    },
    [],
  )

  const load = useCallback(
    async (f: ActivityFilter): Promise<void> => {
      setBusy(true)
      try {
        const page = await fetchPage(f, null)
        if (!page) {
          setError('Could not load activity.')
        } else {
          setError(null)
          setEvents(page.events)
          setNextBefore(page.nextBefore)
        }
      } catch {
        setError('Could not load activity.')
      }
      setBusy(false)
    },
    [fetchPage],
  )

  const more = async (): Promise<void> => {
    if (!nextBefore || busy) return
    setBusy(true)
    try {
      const page = await fetchPage(filter, nextBefore)
      if (!page) {
        setError('Could not load more.')
      } else {
        setError(null)
        setEvents((cur) => [...(cur || []), ...page.events])
        setNextBefore(page.nextBefore)
      }
    } catch {
      setError('Could not load more.')
    }
    setBusy(false)
  }

  // Load on opening the view (and whenever the filter changes while open).
  useEffect(() => {
    if (active) void load(filter)
  }, [active, filter, load])

  // Follow the records: a change lands, its audit row follows, then refetch.
  const stamp =
    api.records.length +
    '|' +
    api.records.reduce((m, r) => (r.updated > m ? r.updated : m), '') +
    '|' +
    api.records.map((r) => r.stage || 'pipeline').join('')
  const firstStamp = useRef(true)
  useEffect(() => {
    if (firstStamp.current) {
      firstStamp.current = false
      return
    }
    if (!active) return
    const t = window.setTimeout(() => {
      void load(filter)
    }, SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [stamp, active, filter, load])

  return (
    <section className="an-activity" aria-busy={busy}>
      <div className="an-activity-head">
        <div>
          <h3 className="an-h">Recent activity</h3>
          <p className="an-blurb">Every change across every request, newest first.</p>
        </div>
        <div className="an-activity-tools">
          <div className="an-chips" role="group" aria-label="Show">
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="an-chip"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="od-mini"
            type="button"
            onClick={() => void load(filter)}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="an-activity-body">
        {error && <div className="od-error">{error}</div>}
        {!events && !error && <div className="od-dim">Loading…</div>}
        {events && events.length === 0 && <div className="od-dim">Nothing yet.</div>}
        {events && events.length > 0 && <ActivityFeed events={events} showOffer />}
        {nextBefore ? (
          <button
            className="od-mini an-more"
            type="button"
            onClick={() => void more()}
            disabled={busy}
          >
            {busy ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
    </section>
  )
}

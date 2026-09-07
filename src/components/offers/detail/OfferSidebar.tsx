'use client'

// History + assignments panel for /offers/[id]. All data comes from
// /api/offer-timeline client-side — deliberately NOT server-revalidated, so a
// save here never re-renders the letter island next to it.

import React, { useCallback, useEffect, useState } from 'react'

import AssignmentsEditor from '@/components/offers/AssignmentsEditor'

interface TimelineChange {
  field: string
  label: string
  from: string
  to: string
}

interface TimelineEvent {
  id: string
  kind: string
  summary: string
  changes: TimelineChange[]
  targetLabel: string
  targetRole: string
  editCount: number
  actorLabel: string
  at: string
}

const KIND_LABEL: Record<string, string> = {
  'created': 'Created',
  'field-edit': 'Edited',
  'stage-change': 'Stage',
  'letter-updated': 'Letter',
  'assigned': 'Assigned',
  'unassigned': 'Unassigned',
  'assignment-role-change': 'Role',
  'deleted': 'Deleted',
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function OfferSidebar({ recordId }: { recordId: string }): React.JSX.Element {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/offer-timeline?id=${encodeURIComponent(recordId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setError('Could not load history.')
        return
      }
      setError(null)
      const data = (await res.json()) as { events: TimelineEvent[] }
      setEvents(data.events)
    } catch {
      setError('Could not load history.')
    }
  }, [recordId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <aside className="od-side">
      <section className="od-panel">
        <div className="od-panel-head">
          <h3>Assigned</h3>
        </div>
        <AssignmentsEditor recordId={recordId} onChanged={() => void load()} />
      </section>

      <section className="od-panel">
        <div className="od-panel-head">
          <h3>History</h3>
          <button className="od-mini" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {error && <div className="od-error">{error}</div>}
        {events && events.length === 0 && <div className="od-dim">No history yet.</div>}
        {events && (
          <ol className="od-events">
            {events.map((e) => (
              <li key={e.id} className="od-event">
                <span className={`od-kind od-kind-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span>
                <div className="od-event-body">
                  <div className="od-summary">
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
                    {e.actorLabel} · {fmtWhen(e.at)}
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

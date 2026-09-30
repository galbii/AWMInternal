'use client'

// "Add a note" — the one activity row a human writes on purpose.
//
// It sits at the top of the activity rail, above the feed, because a note is
// an entry in that feed rather than a property of the record: it goes through
// `offer-events` like every derived event and shows up in the cross-offer
// Analysis feed for free.
//
// WHOSE note is it? Whoever the app is acting as. While an admin is ACTING
// through view-as, `/api/offer-note` writes `actor` = the real human and
// `actingAs` = the emulated user, so the feed reads "Chance (as Dana)" — the
// composer says so before you type, because a note that quietly claimed to be
// someone else's would be the forgery the whole view-as design avoids.

import React, { useState } from 'react'

import { usePush } from '@/components/offers/PushProvider'
import { useViewer } from '@/components/shell/ViewerProvider'
import { MAX_NOTE, type ActivityEvent } from '@/lib/offers/activity'

export interface NoteComposerProps {
  offerId: string
  /** Called with the created event so the rail can show it without a refetch. */
  onAdded: (event: ActivityEvent) => void
}

export default function NoteComposer({ offerId, onAdded }: NoteComposerProps) {
  const viewer = useViewer()
  usePush()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Viewing (not acting) is read-only everywhere else, so the composer says so
  // rather than failing on submit.
  const readOnly = viewer.isEmulating && !viewer.isActing
  const asSomeoneElse = viewer.isActing

  const submit = async (): Promise<void> => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/offer-note', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerId, body: text }),
      })
      if (!res.ok) {
        setError((await res.text().catch(() => '')) || 'Could not add the note.')
        return
      }
      const data = (await res.json()) as { event?: ActivityEvent }
      if (data.event) onAdded(data.event)
      setBody('')
      setOpen(false)
    } catch {
      setError('Could not add the note.')
    } finally {
      setBusy(false)
    }
  }

  if (readOnly) {
    return (
      <p className="nc-readonly">
        Viewing as {viewer.name ? 'another user' : 'someone else'} — switch to “Act as” to add a
        note.
      </p>
    )
  }

  if (!open) {
    return (
      <button type="button" className="nc-open" onClick={() => setOpen(true)}>
        + Add a note
      </button>
    )
  }

  return (
    <div className="nc">
      <textarea
        className="nc-input"
        rows={3}
        autoFocus
        maxLength={MAX_NOTE}
        value={body}
        placeholder="What happened? This lands in the activity feed."
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl+Enter submits; Escape abandons. A note is short.
          if (e.key === 'Escape') {
            setOpen(false)
            setBody('')
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
        }}
      />
      {asSomeoneElse ? (
        <p className="nc-acting">Recorded as you, in their seat — the feed shows both names.</p>
      ) : null}
      {error ? <p className="nc-error">{error}</p> : null}
      <div className="nc-actions">
        <button
          type="button"
          className="od-mini"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setBody('')
            setError(null)
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="od-mini od-save"
          disabled={busy || !body.trim()}
          onClick={() => void submit()}
        >
          {busy ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </div>
  )
}

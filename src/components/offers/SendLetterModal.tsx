'use client'

// "Email this offer" — the modal behind the letter's ✉ Email button and the
// email address in the stage tables.
//
// It replaced composing in the user's own mail client (a `mailto:` deeplink to
// desktop Outlook, or the OWA compose URL). That route meant leaving the app,
// attaching the PDF by hand, and leaving no trace on the record; this one
// sends through Resend (/api/offer-email) and writes an 'email-sent' event, so
// the activity rail can show who mailed the offer and to whom.
//
// The PDF is built HERE because this is the only place it CAN be built:
// `letterToPdfBytes` rasterises the letter with html2canvas, in a browser,
// from the record's own letter config — hand edits and watermark included. The
// server receives it as base64 next to the note.

import React, { useCallback, useEffect, useState } from 'react'

import Modal from '@/components/shell/Modal'
import { usePush } from '@/components/offers/PushProvider'
import { STAMP_TEXT } from '@/lib/offers/official'
import { checkDraft, parseRecipients } from '@/lib/offers/email'
import { safeFileBase } from '@/lib/offers/format'
import { offerEmailBody, offerEmailSubject } from '@/lib/offers/letter-exports'
import { letterToPdfBytes } from '@/lib/offers/pdf'
import type { OfferRecord } from '@/lib/offers/types'

/**
 * btoa() takes a binary STRING, and spreading a megabyte of bytes into
 * String.fromCharCode in one call overflows the argument stack. Chunk it.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export interface SendLetterModalProps {
  open: boolean
  rec: OfferRecord | null
  onClose: () => void
  /** Reported by the provider as a toast — the modal never toasts itself. */
  onSent: (msg: string) => void
}

export default function SendLetterModal({
  open,
  rec,
  onClose,
  onSent,
}: SendLetterModalProps): React.JSX.Element {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [attach, setAttach] = useState(true)
  const [busy, setBusy] = useState<null | 'pdf' | 'send'>(null)
  const [error, setError] = useState<string | null>(null)

  // An un-pushed request, or a viewer who may not issue, sends a SAMPLE PDF.
  const push = usePush()
  const official = rec ? push.isOfficial(rec.id) : false
  const stamped = rec ? push.whyStamped(rec.id) : null

  // Refill from the record each time the modal opens: a draft abandoned on one
  // offer must never resurface addressed to the next one.
  const recId = rec ? rec.id : null
  useEffect(() => {
    if (!open || !rec) return
    setTo((rec.data && rec.data.email) || '')
    setCc('')
    setSubject(offerEmailSubject(rec))
    setMessage(offerEmailBody(rec))
    setAttach(true)
    setError(null)
    setBusy(null)
    // Keyed on the record id, not the object: autosave replaces `rec` on every
    // keystroke in the form behind the modal, which would wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recId])

  const send = useCallback(async (): Promise<void> => {
    if (!rec || busy) return
    const draft = {
      to: parseRecipients(to),
      cc: parseRecipients(cc),
      subject: subject.trim(),
      message,
    }
    const problem = checkDraft(draft)
    if (problem) {
      setError(problem.message)
      return
    }

    setError(null)
    try {
      let attachment: { filename: string; contentBase64: string } | null = null
      if (attach) {
        setBusy('pdf')
        // A draft letter is stamped by resolveLetter itself, so the attached
        // PDF carries the SAMPLE mark too (src/lib/offers/official.ts).
        const bytes = await letterToPdfBytes(rec, { official })
        attachment = {
          filename: 'Offer_Letter_' + safeFileBase(rec.data.employeeName || 'New Hire', 'letter') + '.pdf',
          contentBase64: toBase64(bytes),
        }
      }

      setBusy('send')
      const res = await fetch('/api/offer-email', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: rec.id,
          to: draft.to.join(', '),
          cc: draft.cc.join(', '),
          subject: draft.subject,
          message: draft.message,
          attachment,
        }),
      })

      if (res.ok) {
        onSent('Offer emailed to ' + draft.to.join(', ') + '.')
        onClose()
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      // Resend's own wording lands here ("domain is not verified", "you can
      // only send to your own address") — the person configuring it needs to
      // read it verbatim, not a euphemism.
      setError(body?.error || (await res.text().catch(() => '')) || 'The email could not be sent.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The email could not be sent.')
    } finally {
      setBusy(null)
    }
  }, [rec, busy, to, cc, subject, message, attach, official, onSent, onClose])

  return (
    <Modal
      open={open && rec !== null}
      title="Email this offer"
      onBackdrop={() => {
        if (!busy) onClose()
      }}
      foot={
        <>
          <button className="btn-light" onClick={onClose} disabled={busy !== null}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void send()} disabled={busy !== null}>
            {busy === 'pdf' ? 'Building PDF…' : busy === 'send' ? 'Sending…' : 'Send email'}
          </button>
        </>
      }
    >
      <div className="usm-form sle-form">
        {error && <div className="login-error">{error}</div>}
        <label>
          To
          <input
            type="text"
            value={to}
            placeholder="name@example.com"
            autoComplete="off"
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Cc <span className="od-dim">— optional</span>
          <input
            type="text"
            value={cc}
            placeholder="Separate several with commas"
            autoComplete="off"
            onChange={(e) => setCc(e.target.value)}
          />
        </label>
        <label>
          Subject
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label>
          Message
          <textarea
            className="sle-message"
            rows={9}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <label className="nu-role">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          <span>
            <strong>Attach the letter as a PDF</strong>{' '}
            <span className="od-dim">— exactly what “Download PDF” produces</span>
          </span>
        </label>
        {stamped ? (
          <p className="sle-stamp" role="status">
            <strong>SAMPLE.</strong> {STAMP_TEXT[stamped]}
          </p>
        ) : null}
        <p className="sle-note od-dim">
          Sent by All Western Mortgage. Replies come back to you, not to the sending address.
        </p>
      </div>
    </Modal>
  )
}

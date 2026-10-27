'use client'

// "Send for signature" — the letter goes to DocuSign and DocuSign emails the
// candidate a link to sign it. Opened from the letter's action bar through
// useSignature(), which only the /hiring pages provide.
//
// Like SendLetterModal, the PDF is built HERE because the browser is the only
// place it can be (`letterToPdf`, html2canvas). The same render also reports
// where the acceptance line landed (`signAt`), and that is where the sign-here
// and date tabs go: the rasterised PDF has no text for an anchor tab to find.
//
// Only a FINAL letter may be sent — pushed to HR, by someone who may issue
// (src/lib/offers/official.ts). The modal refuses a stamped letter up front,
// including one stamped by the letter's own Watermark tick, rather than
// stripping the stamp: the record's config is the one source of truth for the
// watermark, and no path may override it. /api/offer-signature re-checks.

import React, { useCallback, useEffect, useState } from 'react'

import Modal from '@/components/shell/Modal'
import { usePush } from '@/components/offers/PushProvider'
import { toBase64 } from '@/components/offers/SendLetterModal'
import { isEmailAddress } from '@/lib/offers/email'
import { safeFileBase } from '@/lib/offers/format'
import { resolveLetter } from '@/lib/offers/letter'
import { offerEmailSubject } from '@/lib/offers/letter-exports'
import { STAMP_TEXT } from '@/lib/offers/official'
import { letterToPdf } from '@/lib/offers/pdf'
import type { OfferRecord } from '@/lib/offers/types'

export interface SendForSignatureModalProps {
  open: boolean
  rec: OfferRecord | null
  onClose: () => void
  /** Reported by the provider as a toast — the modal never toasts itself. */
  onSent: (msg: string) => void
}

function defaultMessage(rec: OfferRecord): string {
  const d = rec.data || {}
  const first =
    (d.preferredName && d.preferredName.trim()) ||
    (d.employeeName || '').trim().split(/\s+/)[0] ||
    'there'
  return (
    'Hi ' +
    first +
    ',\n\nCongratulations! Your offer letter from All Western Mortgage is ready for your signature. ' +
    'Please review it and sign where indicated.\n\nWarm regards,\nAll Western Mortgage'
  )
}

export default function SendForSignatureModal({
  open,
  rec,
  onClose,
  onSent,
}: SendForSignatureModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<null | 'pdf' | 'send'>(null)
  const [error, setError] = useState<string | null>(null)

  const push = usePush()
  const official = rec ? push.isOfficial(rec.id) : false
  const stamped = rec ? push.whyStamped(rec.id) : null
  // The letter's own Watermark tick stamps an otherwise final letter.
  const ticked = rec && official ? Boolean(resolveLetter(rec, true).watermark?.on) : false
  const blocker = stamped
    ? STAMP_TEXT[stamped] + ' Only a final letter can go out for signature.'
    : ticked
      ? 'The Watermark tick is on, so this letter is stamped SAMPLE. Turn it off before sending for signature.'
      : null

  // Refill from the record each time the modal opens, keyed on the id so an
  // autosave behind the modal never wipes what was typed (as SendLetterModal).
  const recId = rec ? rec.id : null
  useEffect(() => {
    if (!open || !rec) return
    setName((rec.data && rec.data.employeeName) || '')
    setEmail((rec.data && rec.data.email) || '')
    setSubject(offerEmailSubject(rec))
    setMessage(defaultMessage(rec))
    setError(null)
    setBusy(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recId])

  const send = useCallback(async (): Promise<void> => {
    if (!rec || busy || blocker) return
    if (!name.trim()) return setError('Who is signing? Add the candidate’s name.')
    if (!isEmailAddress(email)) return setError('That email address does not look right.')
    if (!subject.trim()) return setError('Add a subject.')

    setError(null)
    try {
      setBusy('pdf')
      const pdf = await letterToPdf(rec, { official })
      if (!pdf.signAt) {
        setError('Could not find the signature line on this letter.')
        return
      }

      setBusy('send')
      const res = await fetch('/api/offer-signature', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: rec.id,
          signerName: name.trim(),
          signerEmail: email.trim(),
          subject: subject.trim(),
          message,
          filename:
            'Offer_Letter_' + safeFileBase(rec.data.employeeName || 'New Hire', 'letter') + '.pdf',
          pdfBase64: toBase64(pdf.bytes),
          signAt: pdf.signAt,
        }),
      })
      if (res.ok) {
        onSent('Sent to ' + email.trim() + ' for signature via DocuSign.')
        onClose()
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      // DocuSign's own wording lands here verbatim, like Resend's in the email modal.
      setError(body?.error || 'The letter could not be sent for signature.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The letter could not be sent for signature.')
    } finally {
      setBusy(null)
    }
  }, [rec, busy, blocker, name, email, subject, message, official, onSent, onClose])

  return (
    <Modal
      open={open && rec !== null}
      title="Send for signature"
      onBackdrop={() => {
        if (!busy) onClose()
      }}
      foot={
        <>
          <button className="btn-light" onClick={onClose} disabled={busy !== null}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void send()}
            disabled={busy !== null || blocker !== null}
          >
            {busy === 'pdf' ? 'Building PDF…' : busy === 'send' ? 'Sending…' : 'Send via DocuSign'}
          </button>
        </>
      }
    >
      <div className="usm-form sle-form">
        {error && <div className="login-error">{error}</div>}
        {blocker ? (
          <p className="sle-stamp" role="status">
            <strong>Not a final letter.</strong> {blocker}
          </p>
        ) : null}
        <label>
          Signer name
          <input type="text" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Signer email
          <input
            type="email"
            value={email}
            placeholder="name@example.com"
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Subject
          <input type="text" value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label>
          Message
          <textarea
            className="sle-message"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        <p className="sle-note od-dim">
          DocuSign emails the candidate a link to sign. Their signature and the date go on the
          acceptance line at the end of the letter.
        </p>
      </div>
    </Modal>
  )
}

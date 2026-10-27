'use client'

// "Send for signature" — the letter (plus any further agreements) goes to
// DocuSign, routed: the letter's SIGNATORY signs first on the "Warm regards"
// line, then the CANDIDATE on the acceptance line, then the reporting manager
// receives a copy of the completed documents (2026-10-27, HR's request).
// Opened from the letter's action bar through useSignature(), which only the
// /hiring pages provide.
//
// Like SendLetterModal, the PDF is built HERE because the browser is the only
// place it can be (`letterToPdf`, html2canvas). The same render reports where
// both signature lines landed (`signatoryAt`, `signAt`), and the letter's
// fields go there: the rasterised PDF has no text for an anchor tab to find.
//
// Extra agreements are files the app has never seen, so it cannot place their
// fields. With any attached, the envelope is created as a draft and DocuSign's
// tagging screen opens in a new tab; HR places those fields and sends there.
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
import { MAX_EXTRA_DOCS, isAcceptedExtra } from '@/lib/docusign/build'
import { isEmailAddress } from '@/lib/offers/email'
import { safeFileBase } from '@/lib/offers/format'
import { SIGNATORY, resolveLetter } from '@/lib/offers/letter'
import { offerEmailSubject } from '@/lib/offers/letter-exports'
import { STAMP_TEXT } from '@/lib/offers/official'
import { letterToPdf } from '@/lib/offers/pdf'
import { SIGNATORY_EMAIL } from '@/lib/offers/signatory-email'
import type { OfferRecord } from '@/lib/offers/types'

export interface SendForSignatureModalProps {
  open: boolean
  rec: OfferRecord | null
  onClose: () => void
  /** Reported by the provider as a toast — the modal never toasts itself. */
  onSent: (msg: string) => void
}

/** Matches what /api/offer-signature accepts per agreement (it checks again). */
const MAX_EXTRA_BYTES = 15 * 1024 * 1024

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
  const [internalName, setInternalName] = useState('')
  const [internalEmail, setInternalEmail] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [extras, setExtras] = useState<File[]>([])
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
  const review = extras.length > 0

  // Refill from the record each time the modal opens, keyed on the id so an
  // autosave behind the modal never wipes what was typed (as SendLetterModal).
  const recId = rec ? rec.id : null
  useEffect(() => {
    if (!open || !rec) return
    const key = resolveLetter(rec, true).signatory
    const sg = SIGNATORY[key] || SIGNATORY.kauffman
    setInternalName(sg.name)
    setInternalEmail(SIGNATORY_EMAIL[key] || '')
    setName((rec.data && rec.data.employeeName) || '')
    setEmail((rec.data && rec.data.email) || '')
    setManagerEmail('')
    setSubject(offerEmailSubject(rec))
    setMessage(defaultMessage(rec))
    setExtras([])
    setError(null)
    setBusy(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recId])

  const addFiles = (list: FileList | null): void => {
    if (!list) return
    const picked = Array.from(list)
    const wrong = picked.find((f) => !isAcceptedExtra(f.name))
    if (wrong) return setError(`${wrong.name}: attach PDF or Word files only.`)
    const big = picked.find((f) => f.size > MAX_EXTRA_BYTES)
    if (big) return setError(`${big.name} is too large to send.`)
    const next = [...extras, ...picked]
    if (next.length > MAX_EXTRA_DOCS) return setError(`Attach at most ${MAX_EXTRA_DOCS} agreements.`)
    setError(null)
    setExtras(next)
  }

  const send = useCallback(async (): Promise<void> => {
    if (!rec || busy || blocker) return
    if (!internalName.trim() || !isEmailAddress(internalEmail)) {
      return setError('Add the internal signer’s name and email.')
    }
    if (!name.trim() || !isEmailAddress(email)) return setError('Add the candidate’s name and email.')
    if (internalEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
      return setError('The internal signer and the candidate must be different people.')
    }
    if (managerEmail.trim() && !isEmailAddress(managerEmail)) {
      return setError('That reporting manager email does not look right.')
    }
    if (!subject.trim()) return setError('Add a subject.')

    // Opened NOW, inside the click, so a popup blocker lets it through; the
    // DocuSign URL arrives only after the PDF and the API call.
    const tab = review ? window.open('', '_blank') : null
    setError(null)
    try {
      setBusy('pdf')
      const pdf = await letterToPdf(rec, { official })
      if (!pdf.signAt || !pdf.signatoryAt) {
        tab?.close()
        setError('Could not find the signature lines on this letter.')
        return
      }
      const extraDocs = await Promise.all(
        extras.map(async (f) => ({
          filename: f.name,
          base64: toBase64(new Uint8Array(await f.arrayBuffer())),
        })),
      )

      setBusy('send')
      const res = await fetch('/api/offer-signature', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: rec.id,
          subject: subject.trim(),
          message,
          letter: {
            filename:
              'Offer_Letter_' + safeFileBase(rec.data.employeeName || 'New Hire', 'letter') + '.pdf',
            base64: toBase64(pdf.bytes),
          },
          extras: extraDocs,
          internal: { name: internalName.trim(), email: internalEmail.trim(), place: pdf.signatoryAt },
          candidate: { name: name.trim(), email: email.trim(), place: pdf.signAt },
          copyTo: managerEmail.trim() ? { email: managerEmail.trim() } : null,
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        error?: string
        reviewUrl?: string
      } | null
      if (res.ok && body?.reviewUrl) {
        if (tab) tab.location.href = body.reviewUrl
        else window.location.assign(body.reviewUrl)
        onSent('Opened DocuSign — place the fields on the extra documents, then press Send there.')
        onClose()
        return
      }
      if (res.ok) {
        onSent(`Sent via DocuSign: ${internalName.trim()} signs first, then ${name.trim()}.`)
        onClose()
        return
      }
      tab?.close()
      // DocuSign's own wording lands here verbatim, like Resend's in the email modal.
      setError(body?.error || 'The letter could not be sent for signature.')
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : 'The letter could not be sent for signature.')
    } finally {
      setBusy(null)
    }
  }, [
    rec,
    busy,
    blocker,
    review,
    internalName,
    internalEmail,
    name,
    email,
    managerEmail,
    subject,
    message,
    extras,
    official,
    onSent,
    onClose,
  ])

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
            {busy === 'pdf'
              ? 'Building PDF…'
              : busy === 'send'
                ? 'Sending…'
                : review
                  ? 'Continue in DocuSign'
                  : 'Send via DocuSign'}
          </button>
        </>
      }
    >
      <div className="usm-form sle-form sfs-form">
        {error && <div className="login-error">{error}</div>}
        {blocker ? (
          <p className="sle-stamp" role="status">
            <strong>Not a final letter.</strong> {blocker}
          </p>
        ) : null}

        <fieldset className="sfs-step">
          <legend>
            <span className="sfs-n">1</span> Signs first — AWM
          </legend>
          <label>
            Name
            <input
              type="text"
              value={internalName}
              autoComplete="off"
              onChange={(e) => setInternalName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={internalEmail}
              placeholder="name@allwestern.com"
              autoComplete="off"
              onChange={(e) => setInternalEmail(e.target.value)}
            />
          </label>
          <p className="od-dim sfs-hint">Signs on the letter’s “Warm regards” line.</p>
        </fieldset>

        <fieldset className="sfs-step">
          <legend>
            <span className="sfs-n">2</span> Signs second — the candidate
          </legend>
          <label>
            Name
            <input type="text" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              placeholder="name@example.com"
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="sfs-step">
          <legend>
            <span className="sfs-n">3</span> Gets a copy once signed{' '}
            <span className="od-dim">— optional</span>
          </legend>
          <label>
            Reporting manager email
            <input
              type="email"
              value={managerEmail}
              placeholder="manager@allwestern.com"
              autoComplete="off"
              onChange={(e) => setManagerEmail(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="sfs-step">
          <legend>
            Other agreements <span className="od-dim">— optional, PDF or Word</span>
          </legend>
          {extras.length ? (
            <ul className="sfs-files">
              {extras.map((f, i) => (
                <li key={f.name + i}>
                  <span>{f.name}</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={'Remove ' + f.name}
                    onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {extras.length < MAX_EXTRA_DOCS ? (
            <label className="btn-light sfs-add">
              + Add agreement
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          ) : null}
          {review ? (
            <p className="od-dim sfs-hint">
              DocuSign opens in a new tab so you can place both signers’ fields on these. The letter’s
              fields are already placed. Press Send there to finish.
            </p>
          ) : null}
        </fieldset>

        <label>
          Subject
          <input type="text" value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label>
          Message
          <textarea
            className="sle-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}

'use client'

// The public new-hire request form at /apply. Same questions, same controls
// and the same section cards as HR's New Hire Details form (FORM_SECTIONS +
// FieldBlock), with the HR-only concerns left out: no letter badges, no
// autosave, no custom letter-wording card. One sitting, one "Send request".
//
// LAYOUT (2026-09): two columns. A sticky LEFT RAIL holds the identity of the
// request — a live "who is joining" card, the New hire section and About you —
// because those answers are the context every later answer is given in, and a
// requester deep in the commission splits should still be able to see whose
// splits they are. The right column carries the work: role, pay, equipment,
// systems. Below 1080px the rail simply becomes the first block of one column.
//
// Nothing is stored until the send succeeds; the server (/api/apply) creates
// the pipeline record and answers with its id, shown here as the reference.

import React, { useMemo, useRef, useState } from 'react'

import FieldBlock from '@/components/offers/fields/FieldBlock'
import {
  fieldById,
  FORM_SECTIONS,
  type FormCard,
  type FormSection,
} from '@/components/offers/form-sections'
import { fmtDollarStr } from '@/lib/offers/format'
import { FIELDS, missingRequired } from '@/lib/offers/schema'
import type { OfferData } from '@/lib/offers/types'

/** HR's letter-wording overrides are not a requester's call. */
const HIDDEN_CARDS = new Set(['pay-wording'])

/** Sections that live in the rail rather than the main column. */
const RAIL_SECTIONS = new Set(['person'])

/** Denominator of the progress meter: every required question in the schema. */
const REQUIRED_TOTAL = FIELDS.filter((f) => f.req).length

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The signed-in colleague's own details, when there is a session. */
export interface SignedInAs {
  name: string
  email: string
}

interface ApplyFormProps {
  /** True when the deployment set APPLY_ACCESS_CODE — the form asks for it. */
  requiresCode: boolean
  /**
   * The page's headline, handed down from the server page so the copy stays
   * there while the layout decides where it sits — its own grid cell, level
   * with the top of the rail on wide screens and first of all on narrow ones.
   */
  hero?: React.ReactNode
  /**
   * The actor's name/email when the visitor happens to be signed in, else null.
   * Seeds About you and Branch Manager and is then forgotten: these are ORDINARY
   * editable fields, never locked, and nothing re-applies the seed once a value
   * has been changed or cleared.
   */
  signedInAs?: SignedInAs | null
}

type Phase = 'form' | 'sending' | 'done'

/** "Jordan Doe" → "JD". Empty name gives an empty mark, not a stray letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export default function ApplyForm({
  requiresCode,
  hero,
  signedInAs,
}: ApplyFormProps): React.JSX.Element {
  // Whoever is filling this in is, far more often than not, the branch manager
  // of the branch they are hiring into — so the answer is worth offering. It is
  // still a GUESS about a third party (unlike About you, which is simply them),
  // which is why the field wears a "from your account" note until it is changed.
  const seededData = useMemo<OfferData>(() => {
    const seed: OfferData = {}
    if (signedInAs?.name) seed.branchManager = signedInAs.name
    return seed
  }, [signedInAs?.name])

  const [data, setData] = useState<OfferData>(seededData)
  const [name, setName] = useState(signedInAs?.name ?? '')
  const [email, setEmail] = useState(signedInAs?.email ?? '')
  const [code, setCode] = useState('')
  /** Honeypot — a field people never see; bots fill it and get a polite no-op. */
  const [website, setWebsite] = useState('')
  const [missingIds, setMissingIds] = useState<string[]>([])
  const [youMissing, setYouMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  const [reference, setReference] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)

  const sections = useMemo<FormSection[]>(
    () =>
      FORM_SECTIONS.map((s) =>
        s.cards ? { ...s, cards: s.cards.filter((c) => !HIDDEN_CARDS.has(c.id)) } : s,
      ),
    [],
  )
  const railSections = useMemo(() => sections.filter((s) => RAIL_SECTIONS.has(s.id)), [sections])
  const mainSections = useMemo(() => sections.filter((s) => !RAIL_SECTIONS.has(s.id)), [sections])
  const missing = useMemo(() => missingRequired(data), [data])

  const setField = (id: string, value: string): void => {
    setData((d) => ({ ...d, [id]: value }))
    if (missingIds.length) setMissingIds((m) => m.filter((x) => x !== id))
  }
  const clearFields = (ids: string[]): void => {
    setData((d) => {
      const next = { ...d }
      ids.forEach((id) => {
        next[id] = ''
      })
      return next
    })
  }
  // formatDollarField (S2 489) — the same tidy-up HR's form applies on blur.
  const onDollarBlur = (id: string): void => {
    setData((d) => {
      const cur = d[id] || ''
      const formatted = fmtDollarStr(cur)
      return formatted === cur ? d : { ...d, [id]: formatted }
    })
  }

  /** The About-you answers are required too, so they count toward progress. */
  const youNeed =
    (name.trim() ? 0 : 1) +
    (EMAIL_RE.test(email.trim()) ? 0 : 1) +
    (requiresCode && !code.trim() ? 1 : 0)
  const youOk = youNeed === 0

  const progTotal = REQUIRED_TOTAL + (requiresCode ? 3 : 2)
  const progDone = Math.max(0, progTotal - missing.length - youNeed)
  const ready = progDone === progTotal

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const list = missingRequired(data)
    if (list.length || !youOk) {
      setMissingIds(list.map((f) => f.id))
      setYouMissing(!youOk)
      setError('Fill in the highlighted fields, then send again.')
      // Aim at the field itself, not at `.fld.missing`: the class is set by the
      // render this call has not caused yet, so on a first attempt there is no
      // `.missing` in the DOM to find. `list` is already in schema order, which
      // is the order the questions are rendered in — first gap first, whichever
      // column it is in. Only if every question is answered is the requester's
      // own block the thing in the way.
      const target = list.length
        ? formRef.current?.querySelector('[data-fid="' + list[0]?.id + '"]')
        : formRef.current?.querySelector('.apply-you')
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
      return
    }
    setPhase('sending')
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data,
          submitter: { name: name.trim(), email: email.trim() },
          code: requiresCode ? code.trim() : undefined,
          website,
        }),
      })
      if (res.status === 401) {
        setPhase('form')
        setYouMissing(true)
        setError('That request code is not right. Check with HR and try again.')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const out = (await res.json()) as { id?: string }
      setReference(out.id || '')
      setPhase('done')
      window.scrollTo({ top: 0 })
    } catch {
      setPhase('form')
      setError('The request could not be sent. Nothing you typed was lost; please try again.')
    }
  }

  const reset = (): void => {
    // A second request is still theirs to file: keep the seeded answers, drop
    // everything about the last new hire.
    setData(seededData)
    setMissingIds([])
    setYouMissing(false)
    setError(null)
    setReference('')
    setPhase('form')
    window.scrollTo({ top: 0 })
  }

  if (phase === 'done') {
    return (
      <section className="apply-done" role="status" aria-live="polite">
        <div className="apply-done-mark" aria-hidden="true">
          ✓
        </div>
        <h2>Request sent</h2>
        <p>
          HR has it. Your reference is <span className="apply-ref">{reference}</span>. Keep it in
          case you need to follow up.
        </p>
        <p className="apply-dim">
          Next, HR reviews the details and prepares the offer letter. Questions go to your HR
          contact.
        </p>
        <button type="button" className="btn-primary" onClick={reset}>
          Start another request
        </button>
      </section>
    )
  }

  const missingIn = (ids: string[]): number =>
    ids.filter((id) => {
      const f = fieldById(id)
      return f?.req && !(data[id] || '').trim()
    }).length

  /**
   * A seeded answer says so — but only while it is still the guess. The moment
   * it is edited or cleared the note goes, because it would then be a claim
   * about the account that is no longer true.
   */
  const seedNote = (id: string): React.ReactNode => {
    const seed = seededData[id]
    if (!seed || (data[id] || '') !== seed) return null
    return (
      <span className="apply-seeded">Filled in from your account — change it if that is wrong.</span>
    )
  }

  const renderField = (id: string) => {
    const f = fieldById(id)
    if (!f) return null
    return (
      <FieldBlock
        key={f.id}
        field={f}
        data={data}
        missing={missingIds.includes(f.id)}
        onChange={setField}
        onDollarBlur={onDollarBlur}
        onClearFields={clearFields}
        extra={seedNote(f.id)}
      />
    )
  }

  const renderCard = (c: FormCard) => (
    <div className="rf-card" id={'sec-' + c.id} key={c.id}>
      <div className="rf-card-head">
        <h4>{c.title}</h4>
      </div>
      {c.blurb && <p className="rf-blurb">{c.blurb}</p>}
      {c.fields.map(renderField)}
    </div>
  )

  const renderSection = (sec: FormSection) => {
    const need = missingIn(sec.fields ?? (sec.cards ?? []).flatMap((c) => c.fields))
    return (
      <section className="grp rf-sec" id={'sec-' + sec.id} key={sec.id}>
        <div className="grp-head rf-sec-head">
          <span className="rf-sec-title">{sec.title}</span>
          <span className="rf-sec-status">
            {need > 0 ? (
              <span className="rf-need">
                {need} required field{need === 1 ? '' : 's'} still needed
              </span>
            ) : (
              <span className="rf-complete">Complete</span>
            )}
          </span>
        </div>
        <div className="grp-body">
          {sec.blurb && <p className="rf-blurb rf-sec-blurb">{sec.blurb}</p>}
          {sec.fields?.map(renderField)}
          {sec.cards?.map(renderCard)}
        </div>
      </section>
    )
  }

  /** True while About you is still untouched from the session seed. */
  const youSeeded =
    !!signedInAs && name === signedInAs.name && email === signedInAs.email

  /* ---- the rail's identity card: a live mirror of what has been typed ---- */
  const whoName = (data.preferredName || data.employeeName || '').trim()
  const whoSub = [data.position, data.branchName].map((v) => (v || '').trim()).filter(Boolean)
  const whoMark = initials(whoName)

  const busy = phase === 'sending'

  return (
    <form
      ref={formRef}
      className="apply-form"
      autoComplete="off"
      noValidate
      onSubmit={(e) => void submit(e)}
    >
      <div className="apply-grid">
        {hero}

        {/* The rail is context, not navigation: who this request is about, and
            who is asking. Both stay on screen while the details are filled in.
            A plain div, not <aside> — these are required questions, not an
            aside from the form. */}
        <div className="apply-rail">
          <div className={'apply-who' + (whoName ? '' : ' apply-who-empty')} aria-hidden="true">
            <span className="apply-who-avatar">
              {whoMark || (
                /* No name yet: a neutral silhouette rather than an emoji, which
                   would drag a colour palette of its own onto the brand card. */
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <circle cx="12" cy="8.2" r="3.9" />
                  <path d="M12 13.4c-4 0-7.2 2.3-7.2 5.1v.9h14.4v-.9c0-2.8-3.2-5.1-7.2-5.1Z" />
                </svg>
              )}
            </span>
            <span className="apply-who-text">
              <span className="apply-who-name">{whoName || 'Your new hire'}</span>
              <span className="apply-who-sub">
                {whoSub.length ? whoSub.join(' · ') : 'Name, title and branch appear here'}
              </span>
            </span>
          </div>

          {railSections.map(renderSection)}

          <section
            className={'grp rf-sec apply-you' + (youMissing ? ' apply-you-missing' : '')}
            id="sec-you"
          >
            <div className="grp-head rf-sec-head">
              <span className="rf-sec-title">About you</span>
              <span className="rf-sec-status">
                {youOk ? (
                  <span className="rf-complete">Complete</span>
                ) : (
                  <span className="apply-hint">So HR can follow up</span>
                )}
              </span>
            </div>
            <div className="grp-body">
              {youSeeded ? (
                <p className="apply-seeded">
                  Filled in from your account. Change it if HR should reply to someone else.
                </p>
              ) : null}
              <div className={'fld' + (youMissing && !name.trim() ? ' missing' : '')}>
                <label className="q" htmlFor="apply-name">
                  Your name<span className="req">*</span>
                </label>
                <input
                  id="apply-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div
                className={'fld' + (youMissing && !EMAIL_RE.test(email.trim()) ? ' missing' : '')}
              >
                <label className="q" htmlFor="apply-email">
                  Your work email<span className="req">*</span>
                </label>
                <span className="help">HR replies here if anything needs clarifying.</span>
                <input
                  id="apply-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {requiresCode ? (
                <div className={'fld' + (youMissing && !code.trim() ? ' missing' : '')}>
                  <label className="q" htmlFor="apply-code">
                    Request code<span className="req">*</span>
                  </label>
                  <span className="help">Ask HR for the current code if you do not have it.</span>
                  <input
                    id="apply-code"
                    type="text"
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="apply-hp" aria-hidden="true">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="apply-col">{mainSections.map(renderSection)}</div>
      </div>

      <div className="apply-foot">
        <div className="apply-foot-inner">
          <div
            className={'apply-prog' + (ready ? ' is-ready' : '')}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progTotal}
            aria-valuenow={progDone}
            aria-label="Required questions answered"
          >
            <span className="apply-prog-track">
              <span
                className="apply-prog-fill"
                style={{ width: Math.round((progDone / progTotal) * 100) + '%' }}
              />
            </span>
            <span className="apply-prog-text">
              {ready
                ? 'Everything required is filled in'
                : `${progDone} of ${progTotal} required answers`}
            </span>
          </div>
          {error ? (
            <span className="apply-error" role="alert">
              {error}
            </span>
          ) : null}
          <button type="submit" className="btn-primary apply-submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </form>
  )
}

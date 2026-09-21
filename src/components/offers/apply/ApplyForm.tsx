'use client'

// The public new-hire request form at /apply. Same questions, same controls
// and the same section cards as HR's New Hire Details form (FORM_SECTIONS +
// FieldBlock), with the HR-only concerns left out: no letter badges, no
// autosave, no custom letter-wording card. One sitting, one "Send request".
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
import { missingRequired } from '@/lib/offers/schema'
import type { OfferData } from '@/lib/offers/types'

/** HR's letter-wording overrides are not a requester's call. */
const HIDDEN_CARDS = new Set(['pay-wording'])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ApplyFormProps {
  /** True when the deployment set APPLY_ACCESS_CODE — the form asks for it. */
  requiresCode: boolean
}

type Phase = 'form' | 'sending' | 'done'

export default function ApplyForm({ requiresCode }: ApplyFormProps): React.JSX.Element {
  const [data, setData] = useState<OfferData>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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

  const youOk =
    name.trim() !== '' && EMAIL_RE.test(email.trim()) && (!requiresCode || code.trim() !== '')

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const list = missingRequired(data)
    if (list.length || !youOk) {
      setMissingIds(list.map((f) => f.id))
      setYouMissing(!youOk)
      setError('Fill in the highlighted fields, then send again.')
      const first = formRef.current?.querySelector(!youOk ? '.apply-you' : '.fld.missing')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    setData({})
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

  const busy = phase === 'sending'

  return (
    <form
      ref={formRef}
      className="apply-form"
      autoComplete="off"
      noValidate
      onSubmit={(e) => void submit(e)}
    >
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
          <div className={'fld' + (youMissing && !EMAIL_RE.test(email.trim()) ? ' missing' : '')}>
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

      {sections.map(renderSection)}

      <div className="apply-foot">
        <div className="apply-foot-inner">
          <span className="apply-status">
            <span className={'dot' + (missing.length === 0 && youOk ? '' : ' saving')} />
            {missing.length === 0
              ? 'All required fields complete'
              : `${missing.length} required field${missing.length === 1 ? '' : 's'} still needed`}
          </span>
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

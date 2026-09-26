'use client'

// The offer workspace at /offers/[id]: everything needed to manage ONE offer
// letter end to end — the letter itself, the 42-question details form behind it,
// who it is for, who is working it, and what has happened — without bouncing
// back to the SPA.
//
// Shape (2026-09): a STICKY SUMMARY BAR on top (identity; the applicant's
// contact details and the assigned people; the letter's key terms; the two
// tabs), the letter or form beside an ACTIVITY RAIL holding the audit feed,
// and the letter's actions as a STICKY FOOTER along the bottom. The bar and
// footer are measured into CSS variables so the letter pane and the rail can
// size themselves to whatever the chrome leaves.
//
// Three structural rules this file exists to hold:
//
//  1. BOTH sub-views stay mounted and are shown/hidden by `.subview.active`,
//     exactly as OfferManager does. The letter is an imperative island
//     rendered once via dangerouslySetInnerHTML; unmounting it on a tab switch
//     would throw away its state.
//  2. Everything fetched (useOfferTimeline) lives BESIDE the letter, never
//     above it: a refresh re-renders the bar and the rail, not the island.
//  3. Tab switching goes through the provider (`openLetter` / `showSub`) rather
//     than local state, because `openLetter` is what flushes the form's pending
//     600ms autosave before the letter re-resolves from the record.
//
// The footer's controls (Regenerate, Print, Word, Email…) are NOT rendered
// here: their handlers need LetterView's refs, so LetterView portals its
// action bar into the footer's slot (`actionsSlotId`). The footer stays on
// screen on both tabs; only its contents come from the letter.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import AssignmentsEditor, { assignmentRoleText } from '@/components/offers/AssignmentsEditor'
import LetterView from '@/components/offers/LetterView'
import { useOffers } from '@/components/offers/OffersProvider'
import RequestForm from '@/components/offers/RequestForm'
import { resolveLetter } from '@/lib/offers/letter'
import { completion, offerFacts } from '@/lib/offers/summary'
import type { EditorSub, Stage } from '@/lib/offers/types'
import { initialsOf } from '@/lib/users/initials'

import OfferSidebar from './OfferSidebar'
import { useOfferTimeline } from './useOfferTimeline'

const STAGE_LABEL: Record<Stage, string> = {
  pipeline: 'Pipeline',
  hired: 'Hired',
  archived: 'Archived',
}

/** The footer element LetterView renders its action bar into. */
const FOOT_SLOT_ID = 'od-foot-slot'

/** localStorage key for the header's Details fold (a new key; the frozen onhr_* set is untouched). */
const HEADER_KEY = 'onhr_detail_header'

/** Avatars shown in the assigned stack before it says "+n". */
const STACK_MAX = 5

interface OfferDetailProps {
  recordId: string
  /** Server-rendered name, so the header is right before the client hydrates. */
  name: string
  /** True while a dev is emulating — the whole workspace is display-only. */
  readOnly: boolean
}

/** One label/value pair of the summary strip. */
function Fact({
  label,
  tone,
  className,
  children,
}: {
  label: string
  tone?: 'missing' | 'dim'
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={'od-fact' + (tone ? ' od-fact-' + tone : '') + (className ? ' ' + className : '')}
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function OfferDetail({
  recordId,
  name,
  readOnly,
}: OfferDetailProps): React.JSX.Element {
  const api = useOffers()
  const router = useRouter()

  const rec = api.records.find((r) => r.id === recordId) || null
  const d = rec ? rec.data : {}
  const stage: Stage = (rec && rec.stage) || 'pipeline'

  const timeline = useOfferTimeline(recordId)
  const tl = timeline.data
  const applicant = tl ? tl.applicant : null
  const assignments = tl ? tl.assignments : null

  // Follow the live record once hydrated, so renaming on the details tab retitles
  // the page without a round trip.
  const title = (d.employeeName || '').trim() || (d.preferredName || '').trim() || name
  const preferred = (d.preferredName || '').trim()
  const meta = [
    d.position,
    d.branchName,
    preferred && preferred !== title ? 'goes by ' + preferred : '',
  ]
    .filter(Boolean)
    .join(' · ')

  // Contact details come from the LIVE record (they follow edits on the details
  // tab instantly); the applicants row behind them only adds the other offers.
  const pick = (live: string | undefined, stored: string | undefined): string =>
    (live || '').trim() || (stored || '').trim()
  const email = pick(d.email, applicant?.email)
  const phone = pick(d.phone, applicant?.phone)
  const nmls = pick(d.nmls, applicant?.nmls)
  const address = pick(d.fullAddress, applicant?.address)
  const addressLine = address.replace(/\s*\n+\s*/g, ', ')
  const hasContact = Boolean(email || phone || nmls || address)
  const otherOffers = applicant ? applicant.offers.filter((o) => o.id !== recordId) : []

  // The terms strip reads the SAME resolved config the letter is built from, so
  // it can never disagree with the sheet below it.
  const facts = useMemo(() => (rec ? offerFacts(rec, resolveLetter(rec)) : []), [rec])
  const done = useMemo(() => (rec ? completion(rec) : null), [rec])

  const subViewCls = (s: EditorSub): string => (api.sub === s ? 'subview active' : 'subview')
  const subTabCls = (s: EditorSub): string => (api.sub === s ? 'subtab active' : 'subtab')

  /** Stage moves available from here, given where the record is now. */
  const stageActions: [Stage, string, string][] =
    stage === 'pipeline'
      ? [
          ['hired', 'Mark hired', 'od-mini ok'],
          ['archived', 'Archive', 'od-mini warn'],
        ]
      : stage === 'hired'
        ? [
            ['pipeline', 'Back to pipeline', 'od-mini'],
            ['archived', 'Archive', 'od-mini warn'],
          ]
        : [['pipeline', 'Restore', 'od-mini']]

  /* ---- the assigned popover: the stack opens the full editor under it ---- */

  const [assignOpen, setAssignOpen] = useState(false)
  /** Hang the popover from the fact's RIGHT edge when its left edge is too far over. */
  const [popEnd, setPopEnd] = useState(false)
  const assignRef = useRef<HTMLDivElement | null>(null)
  const toggleAssign = (): void => {
    const el = assignRef.current
    if (el) setPopEnd(el.getBoundingClientRect().left + 460 > window.innerWidth)
    setAssignOpen((o) => !o)
  }
  useEffect(() => {
    if (!assignOpen) return
    const onDown = (e: MouseEvent): void => {
      const el = assignRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setAssignOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAssignOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [assignOpen])

  /* ---- the header's detail rows: folded by default, remembered per browser ---- */

  const [showExtra, setShowExtra] = useState(false)
  // Read after mount so the server and first client render agree (folded).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HEADER_KEY) === 'open') setShowExtra(true)
    } catch {
      /* stay folded */
    }
  }, [])
  const toggleExtra = (): void => {
    const next = !showExtra
    setShowExtra(next)
    if (!next) setAssignOpen(false)
    try {
      window.localStorage.setItem(HEADER_KEY, next ? 'open' : 'closed')
    } catch {
      /* the choice just does not persist */
    }
  }

  /* ---- chrome measurement: the bar and footer publish their heights ---- */

  const rootRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  const footRef = useRef<HTMLElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    const bar = barRef.current
    const foot = footRef.current
    if (!root || !bar || !foot) return
    const apply = (): void => {
      // --od-top is whatever sits above this page (the session bar), so the
      // letter pane can fill the viewport exactly at scroll 0.
      root.style.setProperty('--od-top', root.offsetTop + 'px')
      root.style.setProperty('--od-bar-h', bar.offsetHeight + 'px')
      root.style.setProperty('--od-foot-h', foot.offsetHeight + 'px')
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(bar)
    ro.observe(foot)
    return () => ro.disconnect()
  }, [])

  // A 1px sentinel above the bar: once it scrolls out, the bar is pinned and
  // earns its shadow.
  useEffect(() => {
    const s = sentinelRef.current
    if (!s || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        setStuck(e ? !e.isIntersecting : false)
      },
      { threshold: 0 },
    )
    io.observe(s)
    return () => io.disconnect()
  }, [])

  const stackVisible = assignments ? assignments.slice(0, STACK_MAX) : []
  const stackMore = assignments ? assignments.length - stackVisible.length : 0

  return (
    <div
      className={'offer-detail' + (api.sub === 'details' ? ' od-sub-details' : '')}
      ref={rootRef}
    >
      <div className="od-sentinel" ref={sentinelRef} aria-hidden="true" />

      <header className={'od-bar' + (stuck ? ' stuck' : '')} ref={barRef}>
        <div className="od-bar-in">
          <div className="od-bar-row">
            <Link className="od-back" href="/offers">
              ← All requests
            </Link>
            <span className="od-avatar" aria-hidden="true">
              {initialsOf(title)}
            </span>
            <div className="od-ident">
              <h2 className="od-name">{title}</h2>
              {meta ? <span className="od-sub">{meta}</span> : null}
            </div>
            <span className={'od-stage od-stage-' + stage}>{STAGE_LABEL[stage]}</span>
            {done ? (
              <span className={'od-status' + (done.complete ? ' ok' : '')} title="Required answers">
                {done.label}
              </span>
            ) : null}
            <button
              type="button"
              className="od-more"
              aria-expanded={showExtra}
              aria-controls="od-bar-extra"
              onClick={toggleExtra}
              title={
                showExtra
                  ? 'Hide contact, assignments and letter terms'
                  : 'Show contact, assignments and letter terms'
              }
            >
              Details
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {readOnly ? null : (
              <div className="od-head-actions">
                {stageActions.map(([to, label, cls]) => (
                  <button
                    key={to}
                    type="button"
                    className={cls}
                    onClick={() => api.setStage(recordId, to)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* The detail rows: folded by default, so the bar is the basics —
              name, role, stage, status, actions, tabs — until asked. */}
          <div
            className={showExtra ? 'od-bar-extra open' : 'od-bar-extra'}
            id="od-bar-extra"
            inert={!showExtra}
            aria-hidden={!showExtra}
          >
            <div className="od-bar-extra-in">
              {/* Who: the applicant's contact details and the people working the offer. */}
              <dl className="od-facts od-people" aria-label="Applicant and assignments">
                {email ? (
                  <Fact label="Email">
                    <a href={'mailto:' + email}>{email}</a>
                  </Fact>
                ) : null}
                {phone ? (
                  <Fact label="Phone">
                    <a href={'tel:' + phone.replace(/[^\d+]/g, '')}>{phone}</a>
                  </Fact>
                ) : null}
                {nmls ? <Fact label="NMLS">{nmls}</Fact> : null}
                {address ? (
                  <Fact label="Address">
                    <span className="od-ellipsis" title={address}>
                      {addressLine}
                    </span>
                  </Fact>
                ) : null}
                {hasContact ? null : (
                  <Fact label="Applicant" tone="dim">
                    No contact details yet — add them on New Hire Details
                  </Fact>
                )}
                {otherOffers.length > 0 ? (
                  <Fact label="Other offers" className="od-fact-wrap">
                    <span className="od-chips">
                      {otherOffers.map((o) => (
                        <Link
                          className="od-chip"
                          href={'/offers/' + o.id}
                          key={o.id}
                          title={[o.position, o.branch].filter(Boolean).join(' · ') || o.title}
                        >
                          {o.position || o.title || 'Offer'}
                          <span className={'stage-pill stage-pill-' + o.stage}>
                            {STAGE_LABEL[o.stage]}
                          </span>
                        </Link>
                      ))}
                    </span>
                  </Fact>
                ) : null}

                <div className="od-fact od-fact-assigned od-fact-wrap" ref={assignRef}>
                  <dt>Assigned</dt>
                  <dd>
                    <button
                      type="button"
                      className="od-stack"
                      aria-expanded={assignOpen}
                      aria-haspopup="dialog"
                      title={tl && tl.canAssign ? 'Edit assignments' : 'Assignment details'}
                      disabled={!tl}
                      onClick={toggleAssign}
                    >
                      {assignments === null ? (
                        <span className="od-dim">…</span>
                      ) : assignments.length === 0 ? (
                        <span className="od-dim">No one yet</span>
                      ) : (
                        stackVisible.map((a) => (
                          <span className="od-who" key={a.user} title={a.label}>
                            <span className="od-avatar od-avatar-sm" aria-hidden="true">
                              {initialsOf(a.label)}
                            </span>
                            <span className="od-who-name">
                              {a.label.split(/\s+/)[0] || a.label}
                            </span>
                            {assignmentRoleText(a) ? (
                              <span className="od-role">{assignmentRoleText(a)}</span>
                            ) : null}
                          </span>
                        ))
                      )}
                      {stackMore > 0 ? <span className="od-dim">+{stackMore}</span> : null}
                      {tl ? (
                        <span className="od-stack-edit">{tl.canAssign ? 'Edit' : 'Details'}</span>
                      ) : null}
                    </button>
                    {assignOpen ? (
                      <div
                        className={popEnd ? 'od-pop od-pop-end' : 'od-pop'}
                        role="dialog"
                        aria-label="Assignments"
                      >
                        <div className="od-pop-head">
                          <h4>Assigned</h4>
                          <button
                            className="od-mini"
                            type="button"
                            onClick={() => setAssignOpen(false)}
                          >
                            Close
                          </button>
                        </div>
                        <AssignmentsEditor recordId={recordId} onChanged={timeline.reload} />
                      </div>
                    ) : null}
                  </dd>
                </div>
              </dl>

              {/* What: the letter's terms. */}
              {facts.length ? (
                <dl className="od-facts od-terms" aria-label="Offer terms">
                  {facts.map((f) => (
                    <div className={'od-fact' + (f.tone ? ' od-fact-' + f.tone : '')} key={f.id}>
                      <dt>{f.label}</dt>
                      {/* The letter date defaults to "today" until one is chosen;
                      the server and the browser may not agree on which day that
                      is, and the browser's answer is the one that matters. */}
                      <dd suppressHydrationWarning={f.id === 'date'}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </div>

          {readOnly && (
            <div className="od-readonly">Viewing as another user — changes are disabled.</div>
          )}

          <div className="subtabs" role="tablist" aria-label="Offer views">
            <button
              type="button"
              role="tab"
              aria-selected={api.sub === 'letter'}
              className={subTabCls('letter')}
              onClick={api.openLetter}
            >
              Offer Letter
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={api.sub === 'details'}
              className={subTabCls('details')}
              onClick={() => api.showSub('details')}
            >
              New Hire Details
            </button>
          </div>
        </div>
      </header>

      <div className="od-body">
        <div className="od-main">
          <div className={subViewCls('letter')}>
            <div className={readOnly ? 'od-letter od-letter-locked' : 'od-letter'}>
              <LetterView standalone railsCollapsible actionsSlotId={FOOT_SLOT_ID} />
            </div>
          </div>

          <div className={subViewCls('details')}>
            <div className={readOnly ? 'od-details od-details-locked' : 'od-details'}>
              <RequestForm standalone onDeleted={() => router.push('/offers')} />
            </div>
          </div>
        </div>

        <OfferSidebar
          events={tl ? tl.events : null}
          error={timeline.error}
          onRefresh={timeline.reload}
        />
      </div>

      <footer className={readOnly ? 'od-foot od-foot-locked' : 'od-foot'} ref={footRef}>
        <div className="od-foot-in" id={FOOT_SLOT_ID} />
      </footer>
    </div>
  )
}

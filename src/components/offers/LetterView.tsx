'use client'

// Offer letter view — ported from source-3-letter-pipeline.js.
// Markup: S3 2–30. Options panel: S3 233–266 (renderOptions). Behavior: S3 280–300, 433–458.
//
// Deviation (imperative island): the contenteditable letter body is written once per
// intentional rebuild via dangerouslySetInnerHTML keyed on `contentKey`, and is NEVER
// re-rendered from React while the user types — React's virtual __html stays byte-equal
// between rebuilds, so the DOM the user is editing is left alone.
// All letter-HTML builders are client-only; they run in effects/handlers, never during SSR.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useOffers } from '@/components/offers/OffersProvider'
import { esc, safeFileBase } from '@/lib/offers/format'
import {
  generateLetterHTML,
  letterWrap,
  resolveLetter,
  setByPath,
} from '@/lib/offers/letter'
import {
  letterDocHTML,
  mailtoUrl,
  offerEmailBody,
  offerEmailSubject,
  offerPacketHTML,
  owaComposeUrl,
} from '@/lib/offers/letter-exports'
import { downloadBlob } from '@/lib/offers/spreadsheet'
import { getEmailPref, setEmailPref } from '@/lib/offers/storage'
import {
  AUTO_ROWS,
  EDITABLE_ROWS,
  PANEL_SECTIONS,
  panelNavEntries,
  rowAnchorId,
  rowIncluded,
} from '@/components/offers/letter-panel'
import type { EmailClientPref, LetterConfig, OfferRecord, OffersApi } from '@/lib/offers/types'

/* ---------- option-panel primitives (S3 234–237: selOpt / chkOpt / txtOpt / inpOpt) ---------- */

type OptValue = string | boolean

interface OptProps {
  path: string
  label: string
  onOpt: (path: string, val: OptValue, delay: number) => void
}

function SelOpt({
  path,
  label,
  opts,
  cur,
  onOpt,
}: OptProps & { opts: [string, string][]; cur: string }): React.JSX.Element {
  return (
    <div className="lo-row">
      <label>{label}</label>
      <select
        data-opt={path}
        value={cur}
        onChange={(e) => {
          onOpt(path, e.target.value, 0)
        }}
      >
        {opts.map((o) => (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ))}
      </select>
    </div>
  )
}

function ChkOpt({
  path,
  label,
  checked,
  onOpt,
}: OptProps & { checked: boolean }): React.JSX.Element {
  return (
    <label className="lo-check">
      <input
        type="checkbox"
        data-opt={path}
        checked={checked}
        onChange={(e) => {
          onOpt(path, e.target.checked, 0)
        }}
      />{' '}
      {label}
    </label>
  )
}

function TxtOpt({ path, label, val, onOpt }: OptProps & { val: string }): React.JSX.Element {
  return (
    <div className="lo-row">
      <label>{label}</label>
      <textarea
        data-opt={path}
        rows={2}
        style={{
          padding: '7px 9px',
          border: '1px solid var(--line)',
          borderRadius: 6,
          fontSize: '12.5px',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
        value={val || ''}
        onChange={(e) => {
          onOpt(path, e.target.value, 350)
        }}
      />
    </div>
  )
}

function InpOpt({
  path,
  label,
  val,
  type,
  onOpt,
}: OptProps & { val: string; type?: 'text' | 'date' }): React.JSX.Element {
  return (
    <div className="lo-row">
      <label>{label}</label>
      <input
        type={type || 'text'}
        data-opt={path}
        value={val || ''}
        onChange={(e) => {
          onOpt(path, e.target.value, 350)
        }}
      />
    </div>
  )
}

/* ---------------------------------- the view ---------------------------------- */

function cloneLetter(L: LetterConfig): LetterConfig {
  return JSON.parse(JSON.stringify(L)) as LetterConfig
}

/**
 * Identity of the letter state stored on a record. The view compares this against
 * what it last wrote itself, so a write from ANOTHER component (bulk signatory
 * assign, S3 609–610) is detected and re-resolved instead of being shown stale.
 */
function letterSig(
  id: string | null,
  letter: OfferRecord['letter'],
  html: OfferRecord['letterHtml'],
): string {
  return id ? id + '\u0000' + JSON.stringify([letter || null, html || null]) : ''
}

export interface LetterViewProps {
  /**
   * Rendered on the standalone /offers/[id] workspace rather than inside the SPA's
   * Editor tab. That page owns its own navigation ("← All requests" in its
   * header), so the toolbar's "Back to Pipeline" — which can only flip an SPA
   * view that the page does not render — is dropped instead of being a dead button.
   */
  standalone?: boolean
}

/**
 * A section of the options column. Deliberately the same shape as a section of
 * the New Hire Details form — card, hairline head, blurb — and it reuses that
 * form's `.rf-blurb` class rather than restating it, so the two editors cannot
 * drift apart visually.
 */
function PanelBlock({
  id,
  title,
  writes,
  children,
}: {
  id: string
  title: string
  writes: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="lp-block" id={id}>
      <div className="lp-block-head">
        <h4>{title}</h4>
      </div>
      <div className="lp-block-body">
        <p className="rf-blurb">Writes {writes}.</p>
        {children}
      </div>
    </section>
  )
}

export default function LetterView({ standalone }: LetterViewProps): React.JSX.Element | null {
  const api = useOffers()
  const rec: OfferRecord | null = api.records.find((r) => r.id === api.currentId) || null

  const [L, setL] = useState<LetterConfig | null>(null)
  const [contentKey, setContentKey] = useState(0)
  const [emailClient, setEmailClient] = useState<EmailClientPref>('desktop')

  const htmlRef = useRef<string>('')
  const contentRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const wmRef = useRef<HTMLDivElement | null>(null)

  const LRef = useRef<LetterConfig | null>(null)
  const recRef = useRef<OfferRecord | null>(null)
  const apiRef = useRef<OffersApi>(api)
  const initedFor = useRef<string | null>(null)
  /** `letterSig` of the last letter state THIS view wrote or loaded. */
  const ownSigRef = useRef<string>('')
  const regenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the refs the imperative handlers read in sync. Declared first so it runs
  // before the init effect on mount.
  useEffect(() => {
    recRef.current = rec
    apiRef.current = api
  })

  /** patchRecord + remember the resulting letter state as ours, so the
   *  external-change watcher below does not mistake it for someone else's write. */
  const patchSelf = useCallback((id: string, patch: Partial<OfferRecord>) => {
    const a = apiRef.current
    const cur = a.records.find((x) => x.id === id)
    const nextLetter = 'letter' in patch ? patch.letter : cur ? cur.letter : undefined
    const nextHtml = 'letterHtml' in patch ? patch.letterHtml : cur ? cur.letterHtml : undefined
    ownSigRef.current = letterSig(id, nextLetter, nextHtml)
    a.patchRecord(id, patch)
  }, [])

  const setLetter = useCallback((next: LetterConfig) => {
    LRef.current = next
    setL(next)
  }, [])

  // S3 291 — tile the watermark layer to the current sheet height.
  const renderWatermark = useCallback(() => {
    const wl = wmRef.current
    if (!wl) return
    const cur = LRef.current
    if (!cur || !cur.watermark || !cur.watermark.on) {
      wl.className = 'watermark-layer'
      wl.innerHTML = ''
      return
    }
    wl.className = 'watermark-layer on'
    const hgt = (sheetRef.current && sheetRef.current.scrollHeight) || 1100
    const rows = Math.ceil(hgt / 120) + 2
    const n = rows * 6
    const t = esc(cur.watermark.text || 'SAMPLE')
    wl.innerHTML =
      '<div class="wm-inner">' +
      new Array<string>(n).fill('<span>' + t + '</span>').join('') +
      '</div>'
  }, [])

  // S3 289–290 — regen: rebuild from fields/options (AUTO mode); discards manual edits.
  const regen = useCallback(
    (nextL: LetterConfig, recId: string) => {
      const a = apiRef.current
      const r = a.records.find((x) => x.id === recId)
      if (!r) return
      htmlRef.current = letterWrap(generateLetterHTML(r, nextL))
      setContentKey((k) => k + 1)
      // Re-resolving on every entry to the letter (restoring S3 293-298) would
      // otherwise patch the record each time, and `offer-events` would log a
      // "letter-updated" for merely LOOKING at the letter. Only write when the
      // rebuild actually changes something.
      const unchanged =
        !r.letterHtml && !r.letterStale && JSON.stringify(r.letter ?? null) === JSON.stringify(nextL)
      if (unchanged) {
        ownSigRef.current = letterSig(recId, r.letter, r.letterHtml)
      } else {
        patchSelf(recId, { letterHtml: null, letterStale: false, letter: nextL })
      }
      window.setTimeout(renderWatermark, 0)
    },
    [patchSelf, renderWatermark],
  )

  // S3 293–298 (openLetter): resolve the letter, keep hand-edits only when the fields
  // are unchanged, otherwise rebuild and say so.
  //
  // In the source this ran inside openLetter() alone. Here the view is always
  // mounted (the sub-tabs only toggle visibility), so it must be gated on the
  // letter sub-tab actually being on screen — otherwise merely clicking Edit on a
  // record with a stale letter would silently discard the hand edits and toast
  // about it while the user is looking at the details form.
  const recId = rec ? rec.id : null
  const letterActive = api.view === 'editor' && api.sub === 'letter'
  useEffect(() => {
    if (!recId) {
      initedFor.current = null
      return
    }
    if (!letterActive) {
      // S3 293–298 ran inside openLetter(), so it re-resolved on EVERY entry to
      // the letter. Turning it into an effect added a once-per-record latch, which
      // silently broke that: with the record unchanged, coming back from the
      // details form showed a letter built from fields that had since been edited,
      // and a staled hand-edit was never rebuilt. Clearing the latch on exit
      // restores "resolve each time the letter is opened".
      initedFor.current = null
      return
    }
    if (initedFor.current === recId) return
    const a = apiRef.current
    const r = a.records.find((x) => x.id === recId)
    if (!r) return
    initedFor.current = recId
    const resolved = resolveLetter(r)
    LRef.current = resolved
    setL(resolved)
    // Always rebuilt from the record. The letter body is no longer editable in
    // place, so there is never a hand-edited `letterHtml` to prefer over it, and
    // a stored one from before that change is deliberately ignored — the letter
    // is a function of the fields, with no second source of truth.
    regen(resolved, recId)
  }, [letterActive, recId, regen, renderWatermark])

  // An open letter must follow the record when someone ELSE rewrites its letter
  // state — bulk signatory assign (S3 609–610) patches `letter` and `letterHtml`
  // on records that may be the one on screen. Anything this view wrote itself is
  // recorded in `ownSigRef` and ignored here.
  const recSig = letterSig(recId, rec ? rec.letter : undefined, rec ? rec.letterHtml : undefined)
  useEffect(() => {
    if (!recId || initedFor.current !== recId) return
    if (recSig === ownSigRef.current) return
    ownSigRef.current = recSig
    const a = apiRef.current
    const r = a.records.find((x) => x.id === recId)
    if (!r) return
    const resolved = resolveLetter(r)
    LRef.current = resolved
    setL(resolved)
    regen(resolved, recId)
  }, [recId, recSig, regen, renderWatermark])

  /* ---- options rail: the letter editor's answer to the details form's ---- */

  const [activeBlock, setActiveBlock] = useState<string>('lp-letter')
  const optionsRef = useRef<HTMLDivElement | null>(null)

  const navRows = useMemo(
    () => (L ? panelNavEntries(L, rec ? rec.data : {}) : []),
    [L, rec],
  )

  const jumpToBlock = useCallback((id: string): void => {
    const el = document.getElementById(id)
    const col = optionsRef.current
    if (!el || !col) return
    // Assign scrollTop rather than scrollIntoView: only this column should move,
    // and programmatic smooth scrolling is unreliable on it.
    col.scrollTop = col.scrollTop + (el.getBoundingClientRect().top - col.getBoundingClientRect().top) - 10
  }, [])

  useEffect(() => {
    const col = optionsRef.current
    if (!col || typeof IntersectionObserver === 'undefined' || !navRows.length) return
    const ids = navRows.map((n) => n.id)
    const targets = ids
      .map((id) => col.querySelector('#' + CSS.escape(id)))
      .filter((el): el is Element => el !== null)
    if (!targets.length) return
    const seen = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const first = ids.find((id) => seen.get(id))
        if (first) setActiveBlock(first)
      },
      { root: col, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    targets.forEach((t) => obs.observe(t))
    return () => obs.disconnect()
  }, [navRows, contentKey])

  // S3 509–510 — remembered email-client preference (client-only read).
  useEffect(() => {
    setEmailClient(getEmailPref())
  }, [])

  useEffect(() => {
    return () => {
      if (regenTimer.current) clearTimeout(regenTimer.current)
    }
  }, [])

  /* ---------------------------- handlers ---------------------------- */

  // S3 454–458. The source confirmed here before discarding manual edits; with
  // the body no longer editable there is nothing to discard, so it just applies.
  const onOpt = useCallback(
    (path: string, val: OptValue, delay: number) => {
      const r = recRef.current
      const cur = LRef.current
      if (!r || !cur) return
      const apply = (): void => {
        const next = cloneLetter(cur)
        setByPath(next, path, val)
        setLetter(next)
        patchSelf(r.id, { letter: next, letterHtml: null })
        if (regenTimer.current) clearTimeout(regenTimer.current)
        regenTimer.current = setTimeout(() => {
          regen(next, r.id)
        }, delay)
      }
      apply()
    },
    [patchSelf, regen, setLetter],
  )

  // S3 435–438 — Regenerate. Nothing to discard now, so no confirm.
  const onRegenClick = useCallback(() => {
    const r = recRef.current
    const cur = LRef.current
    if (!r || !cur) return
    regen(cur, r.id)
    apiRef.current.toast('Letter regenerated from the current fields.')
  }, [regen])

  // S3 439–442 — watermark toggle; independent of manual edits.
  const onWatermarkToggle = useCallback(
    (on: boolean) => {
      const r = recRef.current
      const cur = LRef.current
      if (!r || !cur) return
      const next = cloneLetter(cur)
      next.watermark = { on, text: (cur.watermark && cur.watermark.text) || 'SAMPLE' }
      setLetter(next)
      patchSelf(r.id, { letter: next })
      renderWatermark()
    },
    [patchSelf, renderWatermark, setLetter],
  )

  // S3 443 — print only the sheet.
  const onPrint = useCallback(() => {
    document.body.classList.add('printing-letter')
    window.print()
    window.setTimeout(() => {
      document.body.classList.remove('printing-letter')
    }, 700)
  }, [])

  // S3 314–350 — self-contained shareable offer packet.
  const onShare = useCallback(() => {
    const r = recRef.current
    if (!r) {
      apiRef.current.toast('Add the new hire details first, then export.', true)
      return
    }
    const o = offerPacketHTML(r)
    downloadBlob(
      new Blob([o.doc], { type: 'text/html' }),
      'Offer_Packet_' + safeFileBase(o.name, 'record') + '.html',
    )
    apiRef.current.toast('Shareable offer packet exported.')
  }, [])

  // S3 386–391 — editable Word (.doc) export.
  const onWord = useCallback(() => {
    const r = recRef.current
    if (!r) {
      apiRef.current.toast('Add the new hire details first, then export.', true)
      return
    }
    const o = letterDocHTML(r, null)
    downloadBlob(
      new Blob(['﻿' + o.doc], { type: 'application/msword' }),
      'Offer_Letter_' + safeFileBase(o.name, 'letter') + '.doc',
    )
    apiRef.current.toast('Word document exported. Open in Word to edit, then Save As .docx.')
  }, [])

  // S3 531–552 — compose in whichever client the user picked.
  const onEmail = useCallback(() => {
    const r = recRef.current
    const a = apiRef.current
    if (!r) {
      a.toast('Open a new hire first.', true)
      return
    }
    const email = ((r.data && r.data.email) || '').trim()
    if (!email) {
      a.toast('No email on this record — add one on the New Hire Details tab.', true)
      return
    }
    const subject = offerEmailSubject(r)
    const body = offerEmailBody(r)
    if (getEmailPref() === 'web') {
      window.open(owaComposeUrl(email, subject, body), '_blank', 'noopener')
      a.toast('Opening Outlook on the web — attach the saved PDF, then send.')
    } else {
      window.location.href = mailtoUrl(email, subject, body)
      a.toast('Opening your desktop mail app — attach the saved PDF, then send.')
    }
  }, [])

  if (!rec) return null

  return (
    <div className="letter-overlay" id="letterOverlay">
      <div className="letter-body-wrap">
        <nav className="rf-nav lp-rail" aria-label="Letter sections">
          <ul>
            {navRows.map((n) => (
              <li key={n.id} className={n.depth === 1 ? 'rf-nav-sub' : undefined}>
                <button
                  type="button"
                  className={'rf-nav-item' + (activeBlock === n.id ? ' active' : '')}
                  aria-current={activeBlock === n.id ? 'true' : undefined}
                  onClick={() => jumpToBlock(n.id)}
                >
                  <span className="rf-nav-label">{n.title}</span>
                  {n.included === undefined ? null : (
                    <span
                      className={n.included ? 'lp-dot on' : 'lp-dot'}
                      title={n.included ? 'In this letter' : 'Not included'}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="letter-options" id="letterOptions" ref={optionsRef}>
          {L ? (
            <>
              <PanelBlock {...PANEL_SECTIONS[0]}>
                <InpOpt path="date" label="Letter date" val={L.date} type="date" onOpt={onOpt} />
                <SelOpt
                  path="opening"
                  label="Opening style"
                  opts={[
                    ['manager', 'Manager (leadership / agreed start)'],
                    ['dated', 'Dated start (“beginning …”)'],
                    ['licensed', 'Licensed (license transfer)'],
                  ]}
                  cur={L.opening}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="compIntro"
                  label="Compensation intro"
                  opts={[
                    ['transition', 'To support your successful transition…'],
                    ['simple', 'We are pleased to offer…'],
                  ]}
                  cur={L.compIntro}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="expectFamily"
                  label="What You Can Expect"
                  opts={[
                    ['manager', 'Manager – empowered'],
                    ['operations', 'Operations – benefit from'],
                    ['licensed', 'Licensed – supportive/growth'],
                  ]}
                  cur={L.expectFamily}
                  onOpt={onOpt}
                />
              </PanelBlock>

              <PanelBlock {...PANEL_SECTIONS[1]}>
                <SelOpt
                  path="fullPart"
                  label="Full/Part time"
                  opts={[
                    ['full-time', 'full-time'],
                    ['part-time', 'part-time'],
                  ]}
                  cur={L.fullPart}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="exempt"
                  label="Exempt status"
                  opts={[
                    ['non-exempt', 'non-exempt'],
                    ['exempt', 'exempt'],
                  ]}
                  cur={L.exempt}
                  onOpt={onOpt}
                />
                <ChkOpt
                  path="taxesClause"
                  label="Include “all pay subject to withholding…” line"
                  checked={L.taxesClause}
                  onOpt={onOpt}
                />
              </PanelBlock>

              <PanelBlock {...PANEL_SECTIONS[2]}>
                <ChkOpt
                  path="nmlsLine"
                  label="Next Steps: NMLS transfer line"
                  checked={L.nmlsLine}
                  onOpt={onOpt}
                />
                <ChkOpt
                  path="onboardingLine"
                  label="Next Steps: onboarding docs line"
                  checked={L.onboardingLine}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="pathAhead"
                  label="The Path Ahead"
                  opts={[
                    ['thrilled', 'Thrilled / if you’re happy'],
                    ['confirm', 'Excited / to confirm'],
                    ['accept', 'Excited / to accept'],
                  ]}
                  cur={L.pathAhead}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="closing"
                  label="Closing line"
                  opts={[
                    ['welcome', '…welcome.'],
                    ['aboard', '…welcome aboard.'],
                    ['team', '…welcome to the team.'],
                  ]}
                  cur={L.closing}
                  onOpt={onOpt}
                />
                <SelOpt
                  path="signatory"
                  label="Signatory"
                  opts={[
                    ['biaggi', 'Chris Biaggi – CEO'],
                    ['kauffman', 'Jeff Kauffman – National Sales Manager'],
                    ['kern', 'Ty Kern – CSO'],
                    ['lin', 'Peter Lin – Senior VP of Strategy'],
                  ]}
                  cur={L.signatory}
                  onOpt={onOpt}
                />
              </PanelBlock>

              <PanelBlock {...PANEL_SECTIONS[3]}>
                <p className="lp-note">
                  A row appears in the letter when its box has text, and disappears when you clear
                  it. Each box is filled from the details tab when the letter is rebuilt.
                </p>

                {EDITABLE_ROWS.map((r) => {
                  const on = rowIncluded(L, r.key)
                  return (
                    <div
                      className={'rf-card lp-row' + (on ? ' on' : '')}
                      id={rowAnchorId(r.key)}
                      key={r.key}
                    >
                      <div className="rf-card-head">
                        <h4>{r.label}</h4>
                        <span className={on ? 'rf-reach rf-reach-letter' : 'rf-reach rf-reach-internal'}>
                          {on ? 'In this letter' : 'Not included'}
                        </span>
                      </div>
                      <TxtOpt
                        path={r.path}
                        label="What You Receive"
                        val={L.rows[r.key].wyr}
                        onOpt={onOpt}
                      />
                      {r.key === 'guarantee' && (
                        <div className="lp-row-extra">
                          <SelOpt
                            path="rows.guarantee.style"
                            label="How It Works wording"
                            opts={[
                              ['advance', 'Advance on commissions'],
                              ['greater', 'Greater-of (bulleted)'],
                            ]}
                            cur={L.rows.guarantee.style}
                            onOpt={onOpt}
                          />
                          <InpOpt
                            path="rows.guarantee.amt"
                            label="Per pay-period amount"
                            val={L.rows.guarantee.amt}
                            onOpt={onOpt}
                          />
                          <InpOpt
                            path="rows.guarantee.periods"
                            label="Number of pay periods"
                            val={L.rows.guarantee.periods}
                            onOpt={onOpt}
                          />
                        </div>
                      )}
                      <p className="lp-source">Rebuilt from {r.source}.</p>
                    </div>
                  )
                })}

                <p className="lp-note lp-note-auto">Added automatically — no wording to edit:</p>
                {AUTO_ROWS.map((a) => {
                  const on = a.included(rec.data)
                  return (
                    <div
                      className={'rf-card lp-row lp-row-auto' + (on ? ' on' : '')}
                      id={a.id}
                      key={a.label}
                    >
                      <div className="rf-card-head">
                        <h4>{a.label}</h4>
                        <span className={on ? 'rf-reach rf-reach-letter' : 'rf-reach rf-reach-internal'}>
                          {on ? 'In this letter' : 'Not included'}
                        </span>
                      </div>
                      <p className="lp-source">{a.rule}</p>
                    </div>
                  )
                })}
              </PanelBlock>
            </>
          ) : null}
        </div>
        <div className="letter-preview-area">
          <div className="letter-sheet" id="letterSheet" ref={sheetRef}>
            <div className="watermark-layer" id="wmLayer" ref={wmRef} />
            <div
              key={contentKey}
              ref={contentRef}
              className="letter-content"
              id="letterContent"
              dangerouslySetInnerHTML={{ __html: htmlRef.current }}
            />
            <div className="letter-print-footer">
              All Western Mortgage, Inc. &nbsp;&bull;&nbsp; 8345 W. Sunset Rd. #380
              <br />
              Las Vegas, NV 89113 &nbsp;&bull;&nbsp; Main 702.369.0905 &nbsp;&bull;&nbsp; Fax
              702.920.8421
            </div>
          </div>
        </div>

        {/* Third column. This was a full-width bar across the top, where seven
            controls wrapped onto three rows at anything under a wide desktop and
            ate vertical space the 11in sheet needed. As a column the actions
            stack, group by what they do, and stop competing with the letter.
            NOT an <aside>: `aside{display:none}` is a global rule in offers.css. */}
        <div className="letter-actions">
          <div className="la-head">
            {/* The /offers/[id] page already names the record in its header; only
                the SPA, where this column is the sole label, needs it repeated. */}
            {standalone ? null : (
              <span className="la-name" id="letterName">
                {rec.data.employeeName || 'New hire'}
              </span>
            )}
            <span className="la-note">
              Built from the fields. Edit it with the options on the left, or on New Hire Details.
            </span>
          </div>

          <div className="la-group">
            <span className="la-label">This letter</span>
            <button
              type="button"
              className="btn-light la-btn"
              id="letterRegen"
              title="Rebuild the letter from the current fields (replaces manual edits)"
              onClick={onRegenClick}
            >
              Regenerate
            </button>
            <label className="la-check" title="Show a SAMPLE watermark on this letter (print / PDF)">
              <input
                type="checkbox"
                id="letterWmOn"
                checked={!!(L && L.watermark && L.watermark.on)}
                onChange={(e) => {
                  onWatermarkToggle(e.target.checked)
                }}
              />{' '}
              Watermark
            </label>
          </div>

          <div className="la-group">
            <span className="la-label">Save a copy</span>
            <button type="button" className="btn-primary la-btn" id="letterPrint" onClick={onPrint}>
              Print / Save as PDF
            </button>
            <button type="button" className="btn-light la-btn" id="letterDoc" onClick={onWord}>
              Word (.doc)
            </button>
            <button type="button" className="btn-light la-btn" id="letterShare" onClick={onShare}>
              Offer packet (HTML)
            </button>
          </div>

          <div className="la-group">
            <span className="la-label">Email</span>
            <select
              className="la-select"
              id="emailClientPref"
              aria-label="Email client"
              value={emailClient}
              onChange={(e) => {
                const v = e.target.value as EmailClientPref
                setEmailClient(v)
                setEmailPref(v)
              }}
            >
              <option value="desktop">Desktop Outlook</option>
              <option value="web">Outlook Web</option>
            </select>
            <button type="button" className="btn-light la-btn" id="letterEmail" onClick={onEmail}>
              ✉ Email
            </button>
          </div>

          {standalone ? null : (
            <button
              type="button"
              className="btn-ghost la-btn la-back"
              id="letterClose"
              onClick={() => {
                api.showView('pipeline')
              }}
            >
              Back to Pipeline
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

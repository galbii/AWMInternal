'use client'

// New Hire Details form — the React translation of the source app's DOM form.
// Markup: S1 415–430 (head/actions) + S2 350–387 (buildForm/renderField).
// Behaviour: autosave S2 613–617, commit S2 618–636, validation S2 598–605,
// dollar-blur S2 908–910, bonus clear-on-uncheck S2 911–919, letterStale
// S2 900–907 / 920–922, action buttons S2 925–945.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import BaseWageField from '@/components/offers/fields/BaseWageField'
import BonusField from '@/components/offers/fields/BonusField'
import RadioField from '@/components/offers/fields/RadioField'
import {
  FORM_SECTIONS,
  fieldById,
  navEntries,
  overridesTargeting,
  OVERRIDE_LINKS,
  type FormCard,
  type LetterReach,
  type FormSection,
} from '@/components/offers/form-sections'
import { useOffers } from '@/components/offers/OffersProvider'
import { fmtDollarStr } from '@/lib/offers/format'
import { DOLLAR_FIELD_IDS, missingRequired } from '@/lib/offers/schema'
import { removeRecordOnServer } from '@/lib/offers/storage'
import type { FieldDef, OfferData } from '@/lib/offers/types'

const AUTOSAVE_MS = 600

export interface RequestFormProps {
  /**
   * Rendered on the standalone /offers/[id] workspace, which holds exactly one
   * record. Two actions change shape there: Duplicate is dropped (a single-record
   * page has nowhere to put the copy, and the provider's upsert-only persist would
   * strand it off-screen), and Delete cannot go through `api.deleteRecord` —
   * that path relies on the full-list diff to emit a removal, which upsert-only
   * persistence never does, so it would clear the screen and leave the row in Mongo.
   */
  standalone?: boolean
  /** Called after a successful standalone delete, so the page can navigate away. */
  onDeleted?: () => void
}

export default function RequestForm({ standalone, onDeleted }: RequestFormProps) {
  const api = useOffers()

  const [data, setData] = useState<OfferData>({})
  const [missingIds, setMissingIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  /** Bumped on every record switch so field-local state (radio-other, bonus open) resets. */
  const [formKey, setFormKey] = useState(0)

  const dataRef = useRef<OfferData>(data)
  dataRef.current = data
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The record id the form currently mirrors; null = unsaved new request. */
  const syncedIdRef = useRef<string | null>(null)

  const clearTimer = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // commitCurrent (S2 618–636) — the record write itself lives in the controller.
  const commit = (manual: boolean): void => {
    clearTimer()
    const id = api.commitForm(dataRef.current, manual)
    if (id) syncedIdRef.current = id
    dirtyRef.current = false
    setSaving(false)
  }

  const commitRef = useRef(commit)
  commitRef.current = commit

  // scheduleAutosave (S2 613–617)
  const scheduleAutosave = (): void => {
    dirtyRef.current = true
    setSaving(true)
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      commitRef.current(false)
    }, AUTOSAVE_MS)
  }

  // writeForm on openRecord/newRecord (S2 669–684): state IS the data.
  useEffect(() => {
    if (api.currentId === syncedIdRef.current) return
    syncedIdRef.current = api.currentId
    const rec = api.records.find((r) => r.id === api.currentId)
    clearTimer()
    dirtyRef.current = false
    setSaving(false)
    setMissingIds([])
    setData(rec ? { ...rec.data } : {})
    setFormKey((k) => k + 1)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [api.currentId, api.records])

  useEffect(() => clearTimer, [])

  // AUTOSAVE FLUSH — the source commits pending edits before switching records
  // (S2 670 / 680 `if(dirty)commitCurrent(true)`). React unmounts nothing here, so
  // the controller has to be able to reach into the form: it runs this before it
  // changes `currentId`, while the OLD id is still current.
  const registerPendingFlush = api.registerPendingFlush
  useEffect(() => {
    registerPendingFlush(() => {
      if (dirtyRef.current) commitRef.current(false)
    })
    return () => registerPendingFlush(null)
  }, [registerPendingFlush])

  // S2 902 / 920–922 — a real field edit stales any hand-edited letter.
  const markLetterStale = (): void => {
    const id = api.currentId
    if (!id) return
    const rec = api.records.find((r) => r.id === id)
    if (rec && rec.letterHtml && !rec.letterStale) api.patchRecord(id, { letterStale: true })
  }

  const setField = (id: string, value: string): void => {
    setData((d) => ({ ...d, [id]: value }))
    scheduleAutosave()
    markLetterStale()
  }

  const clearFields = (ids: string[]): void => {
    setData((d) => {
      const next = { ...d }
      ids.forEach((id) => {
        next[id] = ''
      })
      return next
    })
    scheduleAutosave()
    markLetterStale()
  }

  // formatDollarField (S2 489 / 908–910)
  const onDollarBlur = (id: string): void => {
    const cur = dataRef.current[id] || ''
    const formatted = fmtDollarStr(cur)
    if (formatted === cur) return
    setData((d) => ({ ...d, [id]: formatted }))
    scheduleAutosave()
    markLetterStale()
  }

  const missing = useMemo(() => missingRequired(data), [data])

  /* ---- actions (S2 925–945) ---- */
  const onSave = (): void => {
    const list = missingRequired(dataRef.current)
    commit(true)
    if (list.length) {
      setMissingIds(list.map((f) => f.id))
      api.toast('Saved as draft — ' + list.length + ' required field(s) still needed.')
    } else {
      setMissingIds([])
    }
  }

  // S3 433 — the button is bound to openLetter, which flushes and guards.
  const onLetter = (): void => {
    api.openLetter()
  }

  const onPrint = (): void => {
    if (dirtyRef.current) commit(false)
    window.print()
  }

  const onDuplicate = (): void => {
    const d = dataRef.current
    const anyData = Object.values(d).some((v) => v && String(v).trim() !== '')
    if (!anyData) {
      api.toast('Nothing to duplicate.', true)
      return
    }
    if (dirtyRef.current) commit(false)
    api.duplicateRecord({ ...d })
  }

  const onDelete = (): void => {
    const id = api.currentId
    if (!id) {
      if (!standalone) api.newRecord()
      return
    }
    api.confirmDialog(
      'Delete request',
      'Permanently delete this request? This cannot be undone.',
      () => {
        if (standalone) {
          clearTimer()
          dirtyRef.current = false
          void removeRecordOnServer(id).then((ok) => {
            if (!ok) {
              api.toast('Could not delete on the server — nothing was removed.', true)
              return
            }
            api.toast('Request deleted.') // S2 934
            if (onDeleted) onDeleted()
          })
          return
        }
        api.deleteRecord(id)
        api.toast('Request deleted.') // S2 934
      },
    )
  }

  /* ---- rendering (S2 350–387) ---- */
  const renderControl = (f: FieldDef) => {
    const value = data[f.id] || ''
    if (f.type === 'textarea') {
      return <textarea value={value} onChange={(e) => setField(f.id, e.target.value)} />
    }
    if (f.type === 'radio' || f.type === 'radio_other') {
      return <RadioField field={f} value={value} onChange={(v) => setField(f.id, v)} />
    }
    const inputType: 'text' | 'email' | 'tel' | 'date' =
      f.type === 'email' || f.type === 'tel' || f.type === 'date' ? f.type : 'text'
    return (
      <input
        type={inputType}
        value={value}
        onChange={(e) => setField(f.id, e.target.value)}
        onBlur={DOLLAR_FIELD_IDS.includes(f.id) ? () => onDollarBlur(f.id) : undefined}
      />
    )
  }

  const renderField = (f: FieldDef, extra?: React.ReactNode) => {
    const cls = 'fld' + (missingIds.includes(f.id) ? ' missing' : '')
    if (f.type === 'bonus' || f.type === 'base') {
      return (
        <div className={cls} data-fid={f.id} key={f.id}>
          <label className="q">
            <span className="qn">{f.q}.</span>
            {f.label}
          </label>
          <span className="help">{f.help || ''}</span>
          {f.type === 'bonus' ? (
            <BonusField
              field={f}
              data={data}
              onChange={setField}
              onDollarBlur={onDollarBlur}
              onClearFields={clearFields}
            />
          ) : (
            <BaseWageField field={f} data={data} onChange={setField} onDollarBlur={onDollarBlur} />
          )}
          {extra}
        </div>
      )
    }
    return (
      <div className={cls} data-fid={f.id} key={f.id}>
        <label className="q">
          <span className="qn">{f.q}.</span>
          {f.label}
          {f.req && <span className="req">*</span>}
        </label>
        {f.help && <span className="help">{f.help}</span>}
        {renderControl(f)}
        {extra}
      </div>
    )
  }

  /* ---- section / card rendering ---- */

  const letterBadge = (reach: LetterReach | undefined) => {
    if (!reach || reach.kind === 'none') return null
    if (reach.kind === 'internal')
      return (
        <span className="rf-reach rf-reach-internal" title="Nothing here appears in the offer letter">
          Internal only
        </span>
      )
    return (
      <span className="rf-reach rf-reach-letter">In the letter: {reach.what}</span>
    )
  }

  /**
   * The Group F footgun, made visible. `resolveLetter` takes the custom wording
   * over the computed row whenever it is filled, so the card whose fields just
   * lost says so, with a jump to the text that beat it.
   */
  const overrideNotices = (cardId: string) => {
    const hits = overridesTargeting(cardId).filter((o) => (data[o.wordingId] || '').trim() !== '')
    if (!hits.length) return null
    return (
      <div className="rf-overridden" role="status">
        {hits.map((o) => (
          <p key={o.wordingId}>
            The <strong>{o.row}</strong> row is coming from your custom wording, not {o.beats}.{' '}
            <button type="button" className="rf-link" onClick={() => jumpToField(o.wordingId)}>
              Show the wording
            </button>
          </p>
        ))}
      </div>
    )
  }

  /** On the wording card itself: say which row each filled box has claimed. */
  const claimedRow = (fieldId: string) => {
    const link = OVERRIDE_LINKS.find((o) => o.wordingId === fieldId)
    if (!link || !(data[fieldId] || '').trim()) return null
    return (
      <span className="rf-claim">
        Now writing the <strong>{link.row}</strong> row instead of {link.beats}.{' '}
        <button type="button" className="rf-link" onClick={() => jumpTo('sec-' + link.targetCard)}>
          Go to those fields
        </button>
      </span>
    )
  }

  const renderCard = (c: FormCard) => (
    <div className="rf-card" id={'sec-' + c.id} key={c.id}>
      <div className="rf-card-head">
        <h4>{c.title}</h4>
        {letterBadge(c.letter)}
      </div>
      {c.blurb && <p className="rf-blurb">{c.blurb}</p>}
      {overrideNotices(c.id)}
      {c.fields.map((id) => {
        const f = fieldById(id)
        return f ? renderField(f, claimedRow(id)) : null
      })}
    </div>
  )

  const renderSection = (sec: FormSection) => {
    const need = missingIn(sec.fields ?? (sec.cards ?? []).flatMap((c) => c.fields))
    return (
      <section className="grp rf-sec" id={'sec-' + sec.id} key={sec.id}>
        <div className="grp-head rf-sec-head">
          <span className="rf-sec-title">{sec.title}</span>
          {letterBadge(sec.letter)}
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
          {sec.fields?.map((id) => {
            const f = fieldById(id)
            return f ? renderField(f) : null
          })}
          {sec.cards?.map((c) => renderCard(c))}
        </div>
      </section>
    )
  }

  /* ---- section navigation (presentation only — see form-sections.ts) ---- */

  const NAV = useMemo(() => navEntries(), [])
  const [activeSection, setActiveSection] = useState<string>(NAV[0]?.id ?? '')
  const sectionsRef = useRef<HTMLFormElement | null>(null)

  /** Required fields still empty inside one section or card. */
  const missingIn = (ids: string[]): number =>
    ids.filter((id) => {
      const f = fieldById(id)
      return f?.req && !(data[id] || '').trim()
    }).length

  // Scroll-spy. `rootMargin` biases the "current" band to the upper third so a
  // section counts as active once its heading reaches the sticky action bar
  // rather than when it fully fills the viewport.
  useEffect(() => {
    const root = sectionsRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const targets = NAV.map((n) => root.querySelector('#sec-' + n.id)).filter(
      (el): el is Element => el !== null,
    )
    if (!targets.length) return
    const seen = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const first = NAV.find((n) => seen.get('sec-' + n.id))
        if (first) setActiveSection(first.id)
      },
      { rootMargin: '-72px 0px -62% 0px', threshold: 0 },
    )
    targets.forEach((t) => obs.observe(t))
    return () => obs.disconnect()
  }, [NAV, formKey])

  const jumpTo = useCallback((anchorId: string): void => {
    const el = document.getElementById(anchorId)
    if (!el) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [])

  /** Flash a field the user was sent to, so the jump lands somewhere obvious. */
  const jumpToField = useCallback(
    (fieldId: string): void => {
      const el = sectionsRef.current?.querySelector('[data-fid="' + fieldId + '"]')
      if (!(el instanceof HTMLElement)) return
      jumpTo(el.id || '')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('rf-flash')
      window.setTimeout(() => el.classList.remove('rf-flash'), 1400)
    },
    [jumpTo],
  )

  const title = (data.employeeName || '').trim() || 'New Request'

  return (
    <main>
      <div className="formhead">
        <h2 id="formTitle">{title}</h2>
        <div className="save-status">
          <span className={'dot' + (saving ? ' saving' : '')} id="saveDot" />
          <span id="saveText">{saving ? 'Saving…' : 'All changes saved'}</span>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-primary" id="btnSave" type="button" onClick={onSave}>
          Save Request
        </button>
        <button className="btn-primary" id="btnLetter" type="button" onClick={onLetter}>
          Offer Letter
        </button>
        <button className="btn-light" id="btnPrint" type="button" onClick={onPrint}>
          Print / PDF
        </button>
        {standalone ? null : (
          <button className="btn-light" id="btnDuplicate" type="button" onClick={onDuplicate}>
            Duplicate
          </button>
        )}
        <button className="btn-danger" id="btnDelete" type="button" onClick={onDelete}>
          Delete
        </button>
        {/* updateValNote — S2 641–645 */}
        <span
          className="save-status"
          id="valNote"
          style={{ color: missing.length === 0 ? 'var(--ok)' : 'var(--warn)' }}
        >
          <span className={'dot' + (missing.length === 0 ? '' : ' saving')} />{' '}
          {missing.length === 0
            ? 'All required fields complete'
            : `${missing.length} required field${missing.length > 1 ? 's' : ''} still needed`}
        </span>
      </div>

      <div className="rf-body">
        <nav className="rf-nav" aria-label="Form sections">
          <ul>
            {NAV.map((n) => {
              const need = missingIn(n.fields)
              const active = activeSection === n.id
              return (
                <li key={n.id} className={n.depth === 1 ? 'rf-nav-sub' : undefined}>
                  <button
                    type="button"
                    className={'rf-nav-item' + (active ? ' active' : '')}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => jumpTo('sec-' + n.id)}
                  >
                    <span className="rf-nav-label">{n.title}</span>
                    {need > 0 ? (
                      <span className="rf-nav-count" title={need + ' required field(s) still empty'}>
                        {need}
                      </span>
                    ) : (
                      <span className="rf-nav-done" aria-label="complete">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <form
          id="form"
          autoComplete="off"
          key={formKey}
          onSubmit={(e) => e.preventDefault()}
          ref={sectionsRef}
        >
          {FORM_SECTIONS.map((sec) => renderSection(sec))}
        </form>
      </div>
    </main>
  )
}

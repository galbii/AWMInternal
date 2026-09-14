// Presentation model for the offer-letter options panel.
//
// The panel used to be four flat `<h4>` groups in a 290px column: twenty-one
// controls with no indication of which part of the letter each one writes, and a
// "Compensation table" block that mixed row wording with the guarantee's
// structured inputs. This describes the same controls as sections and rows so
// the panel can say what it is doing.
//
// The row list and its rules are read off `compTableHTML` (letter.ts), not
// guessed. Two things that surprised us and are now surfaced in the UI:
//
//  1. `LetterRow.on` is NEVER consulted by `compTableHTML`. A row is in the
//     letter if and only if `has(R.<row>.wyr)` — the wording box IS the row, and
//     clearing it deletes the row. That is why every row card shows live
//     included/not-included state off the wording value alone.
//  2. P&L Credit and Accelerated Commission are emitted by `compTableHTML` but
//     had no control in the panel, so they could only be changed from Q16 on the
//     details tab. They are editable here now, like every other row.

import { isCommissionedRec } from '@/lib/offers/calc'
import type { LetterConfig, OfferData } from '@/lib/offers/types'

/* ------------------------------- sections ------------------------------- */

export interface PanelSection {
  id: string
  title: string
  /** What this section writes, in the letter's own vocabulary. */
  writes: string
}

export const PANEL_SECTIONS: PanelSection[] = [
  { id: 'lp-letter', title: 'Letter', writes: 'the date, opening and intro paragraphs' },
  {
    id: 'lp-classification',
    title: 'Classification',
    writes: "the Base Salary row's How It Works text",
  },
  { id: 'lp-sections', title: 'Sections', writes: 'Next Steps, The Path Ahead and the signature' },
  { id: 'lp-comp', title: 'Compensation table', writes: 'the rows of the compensation table' },
]

/* ----------------------------- table rows ------------------------------- */

/** Editable rows — those with a `wyr` box the panel can drive, in letter order. */
export interface EditableRow {
  /** Path into LetterConfig for `setByPath`. */
  path: string
  /** Exactly as the row is labelled in the generated table. */
  label: string
  /** Key under `LetterConfig['rows']`. */
  key: 'base' | 'signon' | 'pnl' | 'guarantee' | 'perfile' | 'production' | 'override' | 'accel'
  /** Where the text comes from when the letter is rebuilt from the record. */
  source: string
}

export const EDITABLE_ROWS: EditableRow[] = [
  { key: 'base', path: 'rows.base.wyr', label: 'Base Salary', source: 'Q15 base wage, or Q39 custom wording' },
  { key: 'signon', path: 'rows.signon.wyr', label: 'Sign-On Bonus', source: 'Q16 sign-on amounts' },
  { key: 'pnl', path: 'rows.pnl.wyr', label: 'P&L Credit', source: 'Q16 P&L credit amounts' },
  { key: 'guarantee', path: 'rows.guarantee.wyr', label: 'Guaranteed Pay', source: 'Q16 guarantee, or Q40 custom wording' },
  { key: 'perfile', path: 'rows.perfile.wyr', label: 'Per-File Bonus', source: 'Q16 per-file, or Q41 custom wording' },
  { key: 'production', path: 'rows.production.wyr', label: 'Production Bonus', source: 'Q16 production bonus' },
  { key: 'override', path: 'rows.override.wyr', label: 'Override', source: 'Q16 override bps, or Q42 custom wording' },
  { key: 'accel', path: 'rows.accel.wyr', label: 'Accelerated Commission', source: 'Q16 accelerated bps' },
]

/** True when this row will appear in the generated table (letter.ts `has(...)`). */
export function rowIncluded(L: LetterConfig, key: EditableRow['key']): boolean {
  const row = L.rows[key]
  return !!(row && typeof row.wyr === 'string' && row.wyr.trim() !== '')
}

/**
 * Rows `compTableHTML` appends on its own terms — no wording box exists for
 * them, so the panel explains what drives them instead of pretending otherwise.
 */
export interface AutoRow {
  /** DOM anchor, so the rail can jump to it like any other row. */
  id: string
  label: string
  rule: string
  included: (d: OfferData) => boolean
}

const COMMISSION_KEYS = [
  'compStandard',
  'compBranch',
  'compBuilder',
  'compCorporate',
  'compLeads',
  'compBrokered',
]

export const AUTO_ROWS: AutoRow[] = [
  {
    id: 'lp-auto-standard',
    label: 'Standard Commission',
    rule: 'Added for commissioned roles — by employment type, or a loan officer / branch manager / area manager title — once any commission split (Q29–Q34) is filled.',
    // The real predicate, not a copy: it also matches on POSITION, so a "Loan
    // Officer" on a non-commission employment type still gets the row.
    included: (d) =>
      isCommissionedRec(d) && COMMISSION_KEYS.some((k) => (d[k] || '').trim() !== ''),
  },
  {
    id: 'lp-auto-benefits',
    label: 'Benefits Package',
    rule: 'Added for everyone except part-time employment types.',
    included: (d) => !/part time/i.test(d.employmentType || ''),
  },
]

/** DOM anchor for an editable row's card. */
export function rowAnchorId(key: EditableRow['key']): string {
  return 'lp-row-' + key
}

/**
 * The options column's rail, mirroring the details form's `navEntries()` so both
 * editors are navigated the same way. Sections are depth 0; every compensation
 * row is a depth-1 child of "Compensation table", and carries whether it is
 * currently in the letter — the letter's answer to the form's missing-field count.
 */
export interface PanelNavEntry {
  id: string
  title: string
  depth: 0 | 1
  /** undefined = not a row, so no state to show. */
  included?: boolean
}

export function panelNavEntries(L: LetterConfig, d: OfferData): PanelNavEntry[] {
  const out: PanelNavEntry[] = []
  PANEL_SECTIONS.forEach((sec) => {
    out.push({ id: sec.id, title: sec.title, depth: 0 })
    if (sec.id !== 'lp-comp') return
    EDITABLE_ROWS.forEach((r) => {
      out.push({ id: rowAnchorId(r.key), title: r.label, depth: 1, included: rowIncluded(L, r.key) })
    })
    AUTO_ROWS.forEach((a) => {
      out.push({ id: a.id, title: a.label, depth: 1, included: a.included(d) })
    })
  })
  return out
}

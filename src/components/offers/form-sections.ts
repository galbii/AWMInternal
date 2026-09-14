// Presentation-only grouping for the New Hire Details form.
//
// `schema.ts` GROUPS (A–F) stay EXACTLY as ported: they are the spreadsheet /
// offer-packet structure (`letter-exports.ts` builds the shareable packet from
// them), so regrouping there would change an exported document. This map only
// decides how the form is laid out on screen. Field ids, order within a card,
// validation and xlsx headers are untouched.
//
// Why the regrouping: schema group B carries 35 fields spanning two unrelated
// jobs (who reports to whom vs. what they are paid), while compensation itself
// is split across B, E and F — so "where do I set the split?" had no findable
// answer. Here everything about money lives under Pay.
//
// `letter` records whether what you type in a card reaches the candidate. It is
// derived from the letter code, not a guess: the fields marked 'internal' have
// zero references in letter.ts / calc.ts.

import { FIELDS } from '@/lib/offers/schema'
import type { FieldDef } from '@/lib/offers/types'

/** Does this card's content reach the offer letter? */
export type LetterReach =
  /** Every field here is internal routing — the candidate never sees it. */
  | { kind: 'internal' }
  /** This card writes a named part of the letter. */
  | { kind: 'writes'; what: string }
  /** Mixed or self-evident; no badge. */
  | { kind: 'none' }

export interface FormCard {
  id: string
  title: string
  blurb?: string
  letter: LetterReach
  /** Field ids, in the order they should render. */
  fields: string[]
}

export interface FormSection {
  id: string
  title: string
  blurb?: string
  /** A section is either a single card's worth of fields… */
  fields?: string[]
  letter?: LetterReach
  /** …or several cards (Pay). */
  cards?: FormCard[]
}

export const FORM_SECTIONS: FormSection[] = [
  {
    id: 'person',
    title: 'New hire',
    blurb: 'Who they are and which branch they join.',
    letter: { kind: 'none' },
    fields: [
      'employeeName',
      'preferredName',
      'email',
      'phone',
      'fullAddress',
      'nmls',
      'branchName',
      'branchManager',
    ],
  },
  {
    id: 'role',
    title: 'Role & employment',
    blurb: 'Title, reporting line and start date. Employment type decides whether the letter includes commission and benefits language.',
    letter: { kind: 'none' },
    fields: [
      'workLocation',
      'position',
      'employmentType',
      'reportsTo',
      'ptoManager',
      'startDate',
      'bonusFunding',
      'dualCapacity',
    ],
  },
  {
    id: 'pay',
    title: 'Pay',
    blurb: 'Everything the compensation table is built from. Each card below writes a specific part of the letter.',
    cards: [
      {
        id: 'pay-base',
        title: 'Base wage',
        blurb: 'Enter one basis only — hourly (with hours per week), monthly, or annual. The rest is calculated.',
        letter: { kind: 'writes', what: 'the Base Salary row' },
        fields: ['baseWage'],
      },
      {
        id: 'pay-bonus',
        title: 'Bonus & incentives',
        blurb: 'Tick only what applies. Unticking a bonus clears its amounts.',
        letter: { kind: 'writes', what: 'the bonus rows' },
        fields: ['bonusStructure'],
      },
      {
        id: 'pay-splits',
        title: 'Commission splits',
        blurb: 'Basis points per transaction type. Filling any of these adds the AWM commission-plan section to the letter.',
        letter: { kind: 'writes', what: 'the commission-plan percentages' },
        fields: [
          'compStandard',
          'compBranch',
          'compBuilder',
          'compCorporate',
          'compLeads',
          'compBrokered',
          'compMinimum',
          'compMaximum',
        ],
      },
      {
        id: 'pay-fees',
        title: 'Fees & branch pricing',
        blurb: 'Operational setup for Polly and Encompass.',
        letter: { kind: 'internal' },
        fields: ['processingFee', 'underwritingFee', 'branchPricing'],
      },
      {
        id: 'pay-wording',
        title: 'Custom letter wording',
        blurb: 'Free text that replaces a compensation row word for word. Anything you write here wins over the fields above, and turns that row on even when those fields are empty. Leave blank unless the standard wording will not do.',
        letter: { kind: 'writes', what: 'rows above, verbatim' },
        fields: ['baseText', 'guaranteeText', 'perfileText', 'overrideText'],
      },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment & swag',
    blurb: 'Costed to the branch unless stated otherwise.',
    letter: { kind: 'internal' },
    fields: ['equipment', 'swagBox', 'tshirt'],
  },
  {
    id: 'systems',
    title: 'Systems access',
    blurb: 'Encompass profile and pipeline access to set up before day one.',
    letter: { kind: 'internal' },
    fields: [
      'pipelinePeople',
      'pipelineNeeded',
      'encompassProfile',
      'assignedProcessor',
      'assignedLOA',
      'loVolume',
      'mmiSnippet',
    ],
  },
]

/**
 * A custom-wording field and the fields it silently beats.
 *
 * Verified against letter.ts `resolveLetter`:
 *   base.wyr      = baseTx || (baseOn ? bwStr : '')
 *   guarantee.wyr = guarTx || defaultGuarantee(d)
 *   perfile.wyr   = pfTx   || defaultPerfile(d)
 *   override.wyr  = ovTx   || defaultOverride(d)
 * Each `on` flag is also true when the custom text alone is filled, so the
 * wording can ADD a row as well as rewrite one.
 */
export interface OverrideLink {
  /** The Group F field that wins. */
  wordingId: string
  /** The compensation row it claims. */
  row: string
  /** Card holding the fields it beats — used to anchor the jump link. */
  targetCard: string
  /** What it beats, in the words on screen. */
  beats: string
}

export const OVERRIDE_LINKS: OverrideLink[] = [
  {
    wordingId: 'baseText',
    row: 'Base Salary',
    targetCard: 'pay-base',
    beats: 'the base wage fields',
  },
  {
    wordingId: 'guaranteeText',
    row: 'Guaranteed Pay',
    targetCard: 'pay-bonus',
    beats: 'the guarantee amounts',
  },
  {
    wordingId: 'perfileText',
    row: 'Per-File Bonus',
    targetCard: 'pay-bonus',
    beats: 'the per-file amounts',
  },
  {
    wordingId: 'overrideText',
    row: 'Override',
    targetCard: 'pay-bonus',
    beats: 'the override bps',
  },
]

/** Overrides that a given card's fields can be beaten BY. */
export function overridesTargeting(cardId: string): OverrideLink[] {
  return OVERRIDE_LINKS.filter((o) => o.targetCard === cardId)
}

const BY_ID = new Map<string, FieldDef>(FIELDS.map((f) => [f.id, f]))

export function fieldById(id: string): FieldDef | undefined {
  return BY_ID.get(id)
}

/** The fields the form actually renders — composites in, their sub-fields out. */
export function visibleFields(): FieldDef[] {
  return FIELDS.filter((f) => f.type === 'bonus' || f.type === 'base' || !f.hidden)
}

/** Every field id this map places, in render order. Used by the coverage test. */
export function mappedFieldIds(): string[] {
  const out: string[] = []
  FORM_SECTIONS.forEach((s) => {
    if (s.fields) out.push(...s.fields)
    s.cards?.forEach((c) => out.push(...c.fields))
  })
  return out
}

/** Flattened cards, so the nav and the scroll-spy agree on one list of anchors. */
export interface NavEntry {
  id: string
  title: string
  depth: 0 | 1
  fields: string[]
}

export function navEntries(): NavEntry[] {
  const out: NavEntry[] = []
  FORM_SECTIONS.forEach((s) => {
    out.push({
      id: s.id,
      title: s.title,
      depth: 0,
      // A section with cards owns its cards' fields for counting purposes.
      fields: s.fields ?? (s.cards ?? []).flatMap((c) => c.fields),
    })
    s.cards?.forEach((c) => out.push({ id: c.id, title: c.title, depth: 1, fields: c.fields }))
  })
  return out
}

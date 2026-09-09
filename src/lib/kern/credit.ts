// Credit Report Analysis aggregation. K 871–965 (the computing half of
// renderCredit) + K 872–879 (exportCreditCSV).
//
// The tab answers one operational question: which branches are spending what on
// credit pulls and verifications, and — the point of the operator breakdown —
// whether someone from ANOTHER branch is pulling on this branch's invoice.
//
// Every number comes from the line-item tuple: i[2] charge, i[3] credit,
// i[4] operator index. The borrower name (loan.b) is display-only and is
// stripped from public/kern/credit.json; see the port design spec, D2.

import { prodName } from '@/lib/kern/production'
import type { CreditData, CreditItem, OrgState } from '@/lib/kern/types'

/** K 871 */
export const creditOrgName = (s: OrgState, o: string): string =>
  o === 'UNKNOWN' ? 'Unknown' : prodName(s, o)

export interface CreditOrgRow {
  o: string
  name: string
  /** Loan count. */
  nl: number
  /** Line-item count. */
  ni: number
  ch: number
  cr: number
  net: number
}

/** K 883–886 — per-org rollup, biggest charges first. */
export function creditOrgRows(s: OrgState, data: CreditData): CreditOrgRow[] {
  return Object.keys(data.orgs)
    .map((o) => {
      const loans = data.orgs[o].loans
      let ch = 0
      let cr = 0
      let ni = 0
      Object.values(loans).forEach((l) =>
        l.i.forEach((it) => {
          ch += it[2]
          cr += it[3]
          ni++
        }),
      )
      return { o, name: creditOrgName(s, o), nl: Object.keys(loans).length, ni, ch, cr, net: ch + cr }
    })
    .sort((a, b) => b.ch - a.ch)
}

export interface CreditTotals {
  ch: number
  cr: number
  nl: number
  ni: number
}

/** K 899 */
export function creditTotals(rows: CreditOrgRow[]): CreditTotals {
  return rows.reduce<CreditTotals>(
    (T, r) => ({ ch: T.ch + r.ch, cr: T.cr + r.cr, nl: T.nl + r.nl, ni: T.ni + r.ni }),
    { ch: 0, cr: 0, nl: 0, ni: 0 },
  )
}

export interface CreditLoanRow {
  ref: string
  b?: string
  op?: number
  items: CreditItem[]
  ch: number
  cr: number
  net: number
}

/** K 923–925 — one org's loans, biggest charges first. */
export function creditLoanRows(data: CreditData, org: string): CreditLoanRow[] {
  const loans = data.orgs[org]?.loans || {}
  return Object.keys(loans)
    .map((ref) => {
      const l = loans[ref]
      let lc = 0
      let lr = 0
      l.i.forEach((it) => {
        lc += it[2]
        lr += it[3]
      })
      return { ref, b: l.b, op: l.op, items: l.i, ch: lc, cr: lr, net: lc + lr }
    })
    .sort((a, b) => b.ch - a.ch)
}

export interface CreditOperatorRow {
  code: string
  items: number
  ch: number
  net: number
  /** The branch this operator appears to belong to, if one matched. */
  home: string | null
  homeOrg: string | null
  /** No branch matched the operator's surname. */
  unknown: boolean
  /** Matched a branch, but NOT the one being billed. */
  foreign: boolean
}

/**
 * K 930–936 — who pulled on this invoice.
 *
 * The home-branch match is the source's heuristic, kept verbatim: take the
 * surname from the operator login ("smith.jane" -> "smith") and look for a
 * branch whose name contains it as a word. Branch names in this dataset are
 * surnames, so this mostly works; anything it cannot place is surfaced as
 * "unrecognized" rather than silently bucketed.
 */
export function creditOperatorRows(
  s: OrgState,
  data: CreditData,
  org: string,
): CreditOperatorRow[] {
  const OP = data.ops || []
  const loans = data.orgs[org]?.loans || {}
  const agg: Record<number, { items: number; ch: number; cr: number }> = {}

  Object.values(loans).forEach((l) =>
    l.i.forEach((it) => {
      const k = it[4]
      agg[k] ||= { items: 0, ch: 0, cr: 0 }
      agg[k].items++
      agg[k].ch += it[2]
      agg[k].cr += it[3]
    }),
  )

  return Object.keys(agg)
    .map((key) => {
      const k = Number(key)
      const code = OP[k] || '(blank)'
      const last = code.split('.')[0].toLowerCase()
      const home = s.branches.find((bb) => {
        const n = (bb.name || '').toLowerCase()
        const t = n.split(' ')
        return Boolean(
          n && (t.includes(last) || t[t.length - 1] === last || n === `branch ${last}` || n.replace('branch ', '') === last),
        )
      })
      const known = Boolean(home)
      const self = home ? String(home.orgid) === String(org) : false
      return {
        code,
        items: agg[k].items,
        ch: agg[k].ch,
        net: agg[k].ch + agg[k].cr,
        home: home ? home.name : null,
        homeOrg: home ? home.orgid : null,
        unknown: !known,
        foreign: known && !self,
      }
    })
    .sort((a, b) => b.ch - a.ch)
}

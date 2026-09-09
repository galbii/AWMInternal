// The branch support P&L model. K 995–1013 (the arithmetic half of renderPnl).
//
// Extracted verbatim so it can be unit-tested: the source computed these inside
// the render function and immediately interpolated them into HTML.
//
// The model asks whether a branch's support staff (processors + loan-officer
// assistants) pay for themselves. Revenue is a flat fee per loan plus a spread
// on volume; comp is a basis-point cost that depends on which tier the files
// land in; salary is optionally carried on top.

import type { PnlSettings } from '@/lib/kern/types'

export interface PnlResult {
  /** The basis actually used, after the useRoster switch. */
  units: number
  vol: number
  /** Average loan size, 0 when there are no units. */
  avgLoan: number

  /** Monthly fixed cost of the support team. */
  team: number
  revenue: number

  /** The blended per-role basis points implied by the high/low tier split. */
  procBps: number
  loaBps: number

  /** Comp at the blended mix, and if every file landed in the low-cost tier. */
  compBlend: number
  compLow: number
  /** Team salary when `onTop`, else 0. */
  fixed: number

  netBlend: number
  netLow: number
  /** compBlend - compLow. */
  compSaving: number
  /** Units needed to cover the team at low-tier contribution; null if never. */
  breakEvenUnits: number | null
}

const n = (v: number | string | undefined): number => Number(v) || 0

/**
 * `rosterUnits` / `rosterVol` are the totals derived from the roster table;
 * they are used when `pnl.useRoster` is on, and ignored otherwise.
 */
export function computePnl(P: PnlSettings, rosterUnits: number, rosterVol: number): PnlResult {
  const units = P.useRoster ? rosterUnits : n(P.units)
  const vol = P.useRoster ? rosterVol : n(P.vol)

  const team = n(P.people) * n(P.salary)
  const revenue = units * n(P.procFee) + (vol * n(P.loaBps)) / 10000

  // Each role's effective rate is a weighted blend of the two tiers.
  const procBps = (P.procHiPct / 100) * P.hiBps + (1 - P.procHiPct / 100) * P.loBps
  const loaBps = (P.loaHiPct / 100) * P.hiBps + (1 - P.loaHiPct / 100) * P.loBps

  const compBlend = (vol * (procBps + loaBps)) / 10000
  // Both roles at the low tier — hence 2x, not the blend.
  const compLow = (vol * (2 * n(P.loBps))) / 10000

  const fixed = P.onTop ? team : 0
  const netBlend = revenue - compBlend - fixed
  const netLow = revenue - compLow - fixed

  const avgLoan = units ? vol / units : 0
  // Per-unit contribution in the low-cost case, used only for break-even.
  const contribLow = n(P.procFee) + ((n(P.loaBps) - 2 * n(P.loBps)) * avgLoan) / 10000
  const breakEvenUnits = contribLow > 0 ? team / contribLow : null

  return {
    units, vol, avgLoan,
    team, revenue,
    procBps, loaBps,
    compBlend, compLow, fixed,
    netBlend, netLow,
    compSaving: compBlend - compLow,
    breakEvenUnits,
  }
}

/**
 * K 967–979 — the pool of names offered in the processor / LOA pickers, drawn
 * from every branch's roster by title, plus the legacy flat name lists.
 */
export function knownSupport(
  branches: { roster?: { name: string; title?: string }[]; processors?: string[]; loas?: string[]; processorName?: string; loaName?: string }[],
  kind: 'proc' | 'loa',
): string[] {
  const set = new Set<string>()
  const isProc = (t: string): boolean => /process/i.test(t || '')
  const isLoa = (t: string): boolean => /(loan officer assistant|\bloa\b|assistant)/i.test(t || '')

  branches.forEach((b) => {
    ;(b.roster || []).forEach((e) => {
      const t = e.title || ''
      if (!e.name) return
      if (kind === 'proc' && isProc(t)) set.add(e.name.trim())
      if (kind === 'loa' && isLoa(t)) set.add(e.name.trim())
    })
    ;(kind === 'proc' ? b.processors || [] : b.loas || []).forEach((nm) => {
      if (nm && nm.trim()) set.add(nm.trim())
    })
    const cur = kind === 'proc' ? b.processorName : b.loaName
    if (cur) set.add(cur)
  })

  return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

// The facts the /offers/[id] sticky header shows about a letter — the handful
// of terms someone glancing at an offer actually needs, read off the same
// record + resolved LetterConfig the letter itself is built from, so the
// header can never disagree with the document below it.
//
// Pure and import-safe on the server (no DOM, no dynamic imports).

import { baseWageWYR, guaranteeCalc, isCommissionedRec } from '@/lib/offers/calc'
import { fmtMoney, longDate, parseMoney } from '@/lib/offers/format'
import { SIGNATORY } from '@/lib/offers/letter'
import { missingRequired } from '@/lib/offers/schema'
import type { LetterConfig, OfferData, OfferRecord } from '@/lib/offers/types'

export interface OfferFact {
  id: string
  label: string
  value: string
  /** 'missing' = a required answer the letter is waiting on; 'dim' = informational. */
  tone?: 'missing' | 'dim'
}

/** Q9's long radio labels, shortened to a word for a header chip. */
export function shortLocation(v: string | null | undefined): string {
  const s = (v || '').trim()
  if (!s) return ''
  if (/^branch office/i.test(s)) return 'Branch office'
  if (/hybrid/i.test(s)) return 'Hybrid'
  return s
}

/** Total of the up-to-three sign-on payments, or '' when there is none. */
export function signOnTotal(d: OfferData): string {
  const parts = [d.bonusSignOnAmount, d.bonusSignOnMonth2, d.bonusSignOnMonth3]
    .map((v) => parseMoney(v))
    .filter((n): n is number => n != null && n > 0)
  if (!parts.length) return ''
  return fmtMoney(parts.reduce((a, b) => a + b, 0))
}

/** "$4,000/mo · 3 mo", or '' when no guarantee is configured. */
export function guaranteeShort(d: OfferData): string {
  const gc = guaranteeCalc(d)
  if (!gc) return ''
  const monthly = parseMoney(d.bonusGuaranteeAmount)
  const months = parseInt(d.bonusGuaranteeMonths || '', 10)
  if (monthly == null || !months) return ''
  return fmtMoney(monthly) + '/mo · ' + months + ' mo'
}

export function offerFacts(rec: OfferRecord, L: LetterConfig): OfferFact[] {
  const d = rec.data || {}
  const facts: OfferFact[] = []

  const start = (d.startDate || '').trim()
  facts.push({
    id: 'start',
    label: 'Start',
    value: start ? longDate(start) : 'Not set',
    tone: start ? undefined : 'missing',
  })

  const base = baseWageWYR(d)
  const commissioned = isCommissionedRec(d)
  facts.push({
    id: 'base',
    label: 'Base pay',
    value: base || (commissioned ? 'Commission only' : 'Not set'),
    tone: base ? undefined : commissioned ? 'dim' : 'missing',
  })

  const et = (d.employmentType || '').trim()
  facts.push({
    id: 'employment',
    label: 'Employment',
    value: et || 'Not set',
    tone: et ? undefined : 'missing',
  })

  const loc = shortLocation(d.workLocation)
  if (loc) facts.push({ id: 'location', label: 'Location', value: loc })

  const signon = signOnTotal(d)
  if (signon) facts.push({ id: 'signon', label: 'Sign-on', value: signon })

  const guarantee = guaranteeShort(d)
  if (guarantee) facts.push({ id: 'guarantee', label: 'Guarantee', value: guarantee })

  const sig = SIGNATORY[L.signatory]
  facts.push({ id: 'signatory', label: 'Signed by', value: sig ? sig.name : L.signatory })
  facts.push({ id: 'date', label: 'Letter date', value: longDate(L.date) })

  return facts
}

export interface Completion {
  complete: boolean
  missing: number
  label: string
}

/** The header's status chip: complete, or how many required answers are still open. */
export function completion(rec: OfferRecord): Completion {
  const missing = missingRequired(rec.data || {}).length
  if (rec.status === 'complete' && missing === 0) {
    return { complete: true, missing: 0, label: 'Complete' }
  }
  return {
    complete: false,
    missing,
    label: missing ? `Draft · ${missing} required missing` : 'Draft',
  }
}

/**
 * "just now" / "5m ago" / "3h ago" / "2d ago", then a short date — how a feed
 * says when. Callers put the exact stamp in a `title`.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso || ''
  const s = Math.round((now - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  const days = Math.round(h / 24)
  if (days < 7) return days + 'd ago'
  const dt = new Date(t)
  const sameYear = dt.getFullYear() === new Date(now).getFullYear()
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

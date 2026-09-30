// Offer-letter generator — ported verbatim from source-3-letter-pipeline.js.
// S3: 35–74 (language constants), 124–159 (defaultLetter/deepAssign/resolveLetter),
// 161–231 (HIW builders → generateLetterHTML), 267 (setByPath),
// 269–279 (LETTER_FOOT / letterWrap / letterEditIsCurrent / letterInnerFor),
// 583–590 (swapSigInHtml).
//
// Deviation 2 (globals → params): the source read module globals `L` and `curRec`.
// Every ported function takes what it needs explicitly.
// The base64 logo constant lives in ./logo.ts (generated from the same PNG).

import type {
  LetterConfig,
  OfferData,
  OfferRecord,
  Signatory,
  SignatoryKey,
  StoredLetterConfig,
} from '@/lib/offers/types'
import { AWM_LOGO_DATA_URI } from '@/lib/offers/logo'
import {
  article,
  esc,
  firstNameOf,
  fmtMoney,
  longDate,
  nl2br,
  parseMoney,
  splitAddr,
  todayISO,
} from '@/lib/offers/format'
import {
  baseWageWYR,
  cpPct,
  defaultAccel,
  defaultExempt,
  defaultGuarantee,
  defaultOverride,
  defaultPerfile,
  defaultPnl,
  defaultProduction,
  defaultSignon,
  guaranteeCalc,
  isCommissionedRec,
} from '@/lib/offers/calc'

// S3 34 — the letterhead is inlined as a data URI so exported Word docs and HTML
// packets render it when opened from disk or an email client.
export const AWM_LOGO_SRC = AWM_LOGO_DATA_URI

/* --- canonical fixed language (verbatim from reference letters) --- */
// S3 36–53
export const LB = {
  understand:
    'We understand this is an important decision and appreciate that you are considering our company. We are confident that AWM is the right choice for you and will be a great next step in your career.',
  lookForward:
    "We look forward to your acceptance of this offer and can't wait to have you join our team.",
  licenseTransfer:
    'Your official start date will be aligned with the transfer of your license to All Western Mortgage, and we will work with you to coordinate the timing.',
  managerBegin:
    'The position is set to begin on a mutually agreed-upon start date, and we look forward to working with you to finalize the details.',
  compIntroT:
    'To support your successful transition, we are pleased to extend the following compensation package:',
  compIntroS: 'We are pleased to offer you the following compensation package:',
  ack: 'I have read and understood this offer letter and hereby acknowledge, accept, and agree to the terms set forth above.',
  stdCommWYR:
    'A personalized commission plan tailored to support your business goals and client needs',
  stdCommHIW:
    'Commissions are paid on a bi-weekly basis. All pay is subject to applicable withholding and payroll taxes. Your compensation plan, including commission structure and override details, will be provided separately in your Loan Officer Compensation Plan Agreement.',
  perFileHIW:
    'Bonuses are paid in the last payroll of each month for all loans you processed that funded in the prior calendar month.',
  benefitsWYR: 'Health, dental, vision, 401(k) match, paid time off',
  benefitsHIW: 'Eligibility begins 1st of the month following start.',
  signonHIW:
    'If you voluntarily resign within twelve (12) months of your start date, or are terminated for cause, you agree to repay any sign-on bonuses, recruitment bonuses and/or guarantees paid to you by the company. Repayment must be made in full within thirty (30) days of your separation date.',
  prodHIW:
    'Paid as a one-time bonus in the payroll following verification that the production target has been met.',
  overrideHIW:
    'Override is paid on applicable production in accordance with your Loan Officer Compensation Plan Agreement.',
  accelHIW:
    'These accelerated basis-point rates apply during your initial ramp-up months and then revert to your standard Loan Officer Compensation Plan.',
  pnlHIW:
    'This credit is applied to your branch profit-and-loss statement for the period noted and is subject to the terms of your Loan Officer Compensation Plan Agreement.',
} as const

// S3 54
export const EXPECT_MANAGER: string[] = [
  'Control over your local hiring, branch economics and overall growth strategy',
  'Direct access to executive leadership — no layers to navigate',
  'Built-in marketing, recruiting, and operational support',
  'Priority rollout access to new tech, products, and initiatives',
]
// S3 55
export const EXPECT_OPS: string[] = [
  'A collaborative, performance-driven work culture',
  'Clear communication and direct access to leadership',
  'Streamlined processes and strong team support',
  'Recognition and rewards for efficiency and quality',
]
// S3 56
export const EXPECT_LICENSED: string[] = [
  'A supportive and growth-focused environment',
  'Access to cutting-edge tools and technology',
  'A strong marketing and operations team to back your production',
  'Transparent leadership with open communication at every level',
]

// S3 57–61
export const PATH: Record<LetterConfig['pathAhead'], string> = {
  thrilled:
    "We're thrilled to welcome you to the All Western Mortgage team! If you're happy with the terms outlined above, please sign and return this letter to confirm your acceptance. If any questions come up in the meantime, don't hesitate to reach out—we're here to support you.",
  confirm:
    "We're excited to welcome you to All Western Mortgage! To confirm your acceptance of this offer, please sign and return this letter. If you have any questions in the meantime, don't hesitate to reach out—we're here to support you.",
  accept:
    "We're excited to have you join the All Western Mortgage team! To accept this offer, please sign and return this letter at your earliest convenience. Should you have any questions, feel free to reach out—we're here to help.",
}

// S3 62–66
export const CLOSING: Record<LetterConfig['closing'], string> = {
  welcome: 'Once again, congratulations and welcome. We look forward to a successful partnership!',
  aboard:
    'Once again, congratulations and welcome aboard. We look forward to a successful partnership!',
  team: "Once again, congratulations and welcome to the team. We're looking forward to a successful partnership!",
}

// S3 67–72
export const SIGNATORY: Record<SignatoryKey, Signatory> = {
  biaggi: { name: 'Chris Biaggi', title: 'CEO' },
  kauffman: { name: 'Jeff Kauffman', title: 'National Sales Manager' },
  kern: { name: 'Ty Kern', title: 'CSO' },
  lin: { name: 'Peter Lin', title: 'Senior VP of Strategy' },
}

// S3 73
const COMP_HL = 'color:#0B5CAB'

// S3 164
function has(v: string | null | undefined): boolean {
  return !!v && String(v).trim() !== ''
}

// S3 124–153
export function defaultLetter(rec: OfferRecord): LetterConfig {
  const d: OfferData = rec.data || {}
  const et = d.employmentType || '',
    pos = d.position || ''
  const commissioned =
    /commission/i.test(et) || /loan officer|branch manager|area manager/i.test(pos)
  const isMgr = /branch manager|area manager|non producing/i.test(pos) && !/assistant/i.test(pos)
  const hasStart = !!(d.startDate && d.startDate.trim())
  const opening: LetterConfig['opening'] =
    commissioned && !hasStart ? 'licensed' : isMgr ? 'manager' : hasStart ? 'dated' : 'licensed'
  const expectFamily: LetterConfig['expectFamily'] =
    opening === 'manager' ? 'manager' : opening === 'licensed' ? 'licensed' : 'operations'
  const partTime = /part time/i.test(et)
  const anyComp = [
    'compStandard',
    'compBranch',
    'compBuilder',
    'compCorporate',
    'compLeads',
    'compBrokered',
  ].some((k) => d[k] && String(d[k]).trim())
  const bwStr = baseWageWYR(d)
  const baseOn = !!(
    bwStr &&
    !/commission only/i.test(bwStr) &&
    !/^\$?\s*0(\.0+)?(\s|$)/.test(bwStr.trim())
  )
  return {
    date: todayISO(),
    opening,
    expectFamily,
    compIntro: opening === 'manager' || opening === 'licensed' ? 'transition' : 'simple',
    nmlsLine: expectFamily !== 'operations',
    onboardingLine: false,
    pathAhead: opening === 'manager' ? 'thrilled' : opening === 'licensed' ? 'accept' : 'confirm',
    closing: opening === 'manager' ? 'welcome' : opening === 'licensed' ? 'team' : 'aboard',
    signatory: 'kauffman',
    fullPart: partTime ? 'part-time' : 'full-time',
    exempt: defaultExempt(d),
    taxesClause: false,
    includeCommissionPlan: commissioned || anyComp,
    includeBrokered: !!(d.compBrokered && String(d.compBrokered).trim()),
    watermark: { on: false, text: 'SAMPLE' },
    rows: (function () {
      // custom-wording override helpers
      const t = function (v: string | undefined): string {
        return v ? String(v).trim() : ''
      }
      const baseTx = t(d.baseText),
        guarTx = t(d.guaranteeText),
        pfTx = t(d.perfileText),
        ovTx = t(d.overrideText)
      return {
        base: { on: !!(baseTx || baseOn), wyr: baseTx || (baseOn ? bwStr : '') },
        signon: {
          on: !!(
            (d.bonusSignOnAmount && d.bonusSignOnAmount.trim()) ||
            (d.bonusSignOnMonth2 && d.bonusSignOnMonth2.trim()) ||
            (d.bonusSignOnMonth3 && d.bonusSignOnMonth3.trim())
          ),
          wyr: defaultSignon(d),
        },
        pnl: (function () {
          const note = t(d.bonusPnlNote)
          const on = !!(t(d.bonusPnlAmount) || t(d.bonusPnlAmount2) || t(d.bonusPnlAmount3))
          return { on: on, wyr: defaultPnl(d), note: note || LB.pnlHIW }
        })(),
        guarantee: (function () {
          const gc = guaranteeCalc(d)
          return {
            on: !!(guarTx || (d.bonusGuaranteeAmount && d.bonusGuaranteeAmount.trim())),
            amt: gc ? gc.perS : '',
            periods: gc ? String(gc.periods) : '',
            style: 'greater' as const,
            custom: !!guarTx,
            wyr: guarTx || defaultGuarantee(d),
          }
        })(),
        perfile: {
          on: !!(
            pfTx ||
            (d.bonusPerFileDollar && d.bonusPerFileDollar.trim()) ||
            (d.bonusPerFileBps && d.bonusPerFileBps.trim())
          ),
          wyr: pfTx || defaultPerfile(d),
        },
        production: {
          on: !!(d.bonusProductionAmount && d.bonusProductionAmount.trim()),
          wyr: defaultProduction(d),
        },
        override: {
          on: !!(ovTx || (d.bonusOverrideBps && d.bonusOverrideBps.trim())),
          wyr: ovTx || defaultOverride(d),
        },
        accel: {
          on: !!(t(d.bonusAccelBps1) || t(d.bonusAccelBps2) || t(d.bonusAccelBps3)),
          wyr: defaultAccel(d),
        },
        stdCommission: { on: commissioned },
        benefits: { on: !partTime },
      }
    })(),
  }
}

// S3 154
function assignDeep(t: Record<string, unknown>, s: Record<string, unknown>): void {
  for (const k in s) {
    const v = s[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const cur = t[k]
      const next = (cur && typeof cur === 'object' ? cur : {}) as Record<string, unknown>
      t[k] = next
      assignDeep(next, v as Record<string, unknown>)
    } else t[k] = v
  }
}

export function deepAssign(base: LetterConfig, patch: StoredLetterConfig): LetterConfig {
  assignDeep(base as unknown as Record<string, unknown>, patch as Record<string, unknown>)
  return base
}

/* merge saved letter OPTIONS, but always re-derive comp rows from the current answers (true auto-pilot) */
// S3 156
//
// THE WATERMARK CHOKEPOINT (2026-09-29). Every path that puts this letter in
// front of a human — the on-screen sheet, print, the PDF, the Word file, the
// HTML packet, the emailed attachment — resolves its config here and nowhere
// else. So `official` is enforced ONCE, here, rather than at six call sites
// that each used to carry their own `wm` argument and could contradict the
// record (three of them did: the Word export and the packet passed null, and
// the bulk toolbar had its own checkbox).
//
// It can only ever ADD the stamp, never remove one the record asked for, and
// it defaults to `true` so every existing caller and test keeps its behaviour.
// Who may pass `false`: src/lib/offers/official.ts.
export function resolveLetter(rec: OfferRecord, official: boolean = true): LetterConfig {
  const base = defaultLetter(rec)
  if (rec.letter) {
    deepAssign(base, rec.letter)
    base.rows = defaultLetter(rec).rows
  }
  if (!official) {
    base.watermark = { on: true, text: (base.watermark && base.watermark.text) || 'SAMPLE' }
  }
  return base
}

// S3 158
export function advanceHIW(amt: string): string {
  amt = esc(amt || '[amount]')
  return (
    'Each ' +
    amt +
    ' payment is an advance on future commissions. Your commissions are still calculated every pay period. If your commissions exceed ' +
    amt +
    ' you keep the overage. If commissions are less than ' +
    amt +
    ', you still take home the full ' +
    amt +
    ' guarantee. Should you end your employment with the Company for any reason, or your employment relationship is ended by the Company for cause within the twelve (12) months of receiving a draw you will be responsible for returning any difference between the earned amount and the guaranteed amount, to the Company. By your signature on this employment agreement, you authorize the company to withhold this amount from any final pay you receive upon termination of employment. Any amount that you are required to repay the Company under this agreement is a debt due and owing to the Company, and you agree to pay in full within 30 days of the debt becoming due.'
  )
}

// S3 159
export function greaterHIW(amt: string, periods: string): string {
  amt = esc(amt || '[amount]')
  periods = esc(periods || '[#]')
  return (
    'For each of those ' +
    periods +
    " pay periods you'll receive the greater of:<ul><li>The " +
    amt +
    ' guarantee, or</li><li>Your earned commissions for that pay period.</li><li>If your commissions exceed ' +
    amt +
    ', you keep the overage. If they do not, you still take home the full ' +
    amt +
    ' guarantee.</li></ul>Should you end your employment with the Company for any reason, or your employment relationship is ended by the Company for cause within the twelve (12) months of receiving a draw you will be responsible for returning, any difference between the earned amount and the guaranteed amount, to the Company. By your signature on this employment agreement, you authorize the company to withhold this amount from any final pay you receive upon termination of employment. Any amount that you are required to repay the Company under this agreement is a debt due and owing to the Company, and you agree to pay in full within 30 days of the debt becoming due.'
  )
}

// S3 165–177
export function compTableHTML(rec: OfferRecord, L: LetterConfig): string {
  const d = rec.data,
    R = L.rows,
    rows: [string, string, string][] = []
  if (has(R.base.wyr)) {
    const hiw =
      "Paid bi-weekly in accordance with All Western Mortgage's payroll schedule. " +
      (L.taxesClause ? 'All pay is subject to applicable withholding and payroll taxes. ' : '') +
      'This position is classified as ' +
      L.fullPart +
      ' and ' +
      L.exempt +
      '.'
    rows.push(['Base Salary', nl2br(esc(R.base.wyr)), esc(hiw)])
  }
  if (has(R.signon.wyr)) rows.push(['Sign-On Bonus', nl2br(esc(R.signon.wyr)), esc(LB.signonHIW)])
  if (R.pnl && has(R.pnl.wyr))
    rows.push(['P&L Credit', nl2br(esc(R.pnl.wyr)), nl2br(esc(R.pnl.note || LB.pnlHIW))])
  if (has(R.guarantee.wyr)) {
    const hiw = R.guarantee.custom
      ? esc(
          'Paid in accordance with the terms above and your Loan Officer Compensation Plan Agreement.',
        )
      : R.guarantee.style === 'greater'
        ? greaterHIW(R.guarantee.amt, R.guarantee.periods)
        : advanceHIW(R.guarantee.amt)
    rows.push(['Guaranteed Pay', nl2br(esc(R.guarantee.wyr)), hiw])
  }
  if (has(R.perfile.wyr))
    rows.push(['Per-File Bonus', nl2br(esc(R.perfile.wyr)), esc(LB.perFileHIW)])
  if (R.production && has(R.production.wyr))
    rows.push(['Production Bonus', nl2br(esc(R.production.wyr)), esc(LB.prodHIW)])
  if (R.override && has(R.override.wyr))
    rows.push(['Override', nl2br(esc(R.override.wyr)), esc(LB.overrideHIW)])
  if (R.accel && has(R.accel.wyr))
    rows.push(['Accelerated Commission', nl2br(esc(R.accel.wyr)), esc(LB.accelHIW)])
  // Standard Commission only when the person actually has standard commission % entered (Q28–34).
  // Overrides / per-file / production each have their own row and do NOT trigger Standard Commission.
  const stdComp = [
    'compStandard',
    'compBranch',
    'compBuilder',
    'compCorporate',
    'compLeads',
    'compBrokered',
  ].some((k) => has(d[k]))
  if (isCommissionedRec(d) && stdComp)
    rows.push(['Standard Commission', esc(LB.stdCommWYR), esc(LB.stdCommHIW)])
  if (!/part time/i.test(d.employmentType || ''))
    rows.push(['Benefits Package', esc(LB.benefitsWYR), esc(LB.benefitsHIW)])
  return (
    '<table class="comp-table"><thead><tr><th>Component</th><th>What You Receive</th><th>How It Works</th></tr></thead><tbody>' +
    rows
      .map(
        (r) =>
          '<tr><td>' +
          r[0] +
          '</td><td style="' +
          COMP_HL +
          '">' +
          r[1] +
          '</td><td>' +
          r[2] +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table>'
  )
}

// S3 179–182
function expectHTML(title: string, L: LetterConfig): string {
  const art = article(title)
  let head: string, bullets: string[]
  if (L.expectFamily === 'manager') {
    head = 'At All Western, ' + esc(title) + "s are empowered. You'll have:"
    bullets = EXPECT_MANAGER
  } else {
    head = 'As ' + art + ' ' + esc(title) + " at All Western, you'll benefit from:"
    bullets = L.expectFamily === 'licensed' ? EXPECT_LICENSED : EXPECT_OPS
  }
  return (
    '<h3 class="sec">What You Can Expect</h3><p>' +
    head +
    '</p><ul>' +
    bullets.map((b) => '<li>' + esc(b) + '</li>').join('') +
    '</ul>'
  )
}

// S3 183
function nextStepsHTML(L: LetterConfig): string {
  const it = ['Completion of a background check']
  if (L.nmlsLine) it.push('Your NMLS license being transferred to All Western Mortgage')
  if (L.onboardingLine)
    it.push('Submission of onboarding documentation and any required verifications')
  it.push(
    'Signing all required employee agreements and policy documents prior to receiving access to company systems',
  )
  return (
    '<h3 class="sec">Next Steps</h3><p>This offer is contingent on:</p><ul>' +
    it.map((i) => '<li>' + esc(i) + '</li>').join('') +
    '</ul>'
  )
}

// S3 187
function cpLine(v: string | undefined, label: string, def: string): string {
  return (
    '<p class="cp-line"><span class="cp-pct" style="' +
    COMP_HL +
    '">' +
    cpPct(v) +
    '</span> ' +
    esc(label) +
    ': ' +
    esc(def) +
    '</p>'
  )
}

// S3 188–200
export function commissionPlanHTML(d: OfferData): string {
  const mxRaw = (d.compMaximum || '').trim()
  const mxN = parseMoney(mxRaw)
  const mx =
    mxRaw === '' || /^n\/?a$/i.test(mxRaw) ? 'N/A' : mxN != null ? fmtMoney(mxN) : esc(mxRaw)
  const mnRaw = (d.compMinimum || '').trim()
  const mnN = parseMoney(mnRaw)
  const mn =
    mnRaw === '' || /^n\/?a$/i.test(mnRaw) ? 'N/A' : mnN != null ? fmtMoney(mnN) : esc(mnRaw)
  let h = '<h3 class="sec">1. Compensation Plan for AWM Funded Loans:</h3>'
  h +=
    '<p>I select the following percentages of loan amounts as my Compensation Plan based on the categories listed below. Compensation Plan is Effective as of the date below.</p><div class="comp-plan">'
  h += cpLine(
    d.compStandard,
    'Self-generated',
    'Defined as loans initiated and procured by the Loan Officer independently.',
  )
  h += cpLine(
    d.compBranch,
    'Branch Marketing',
    'Defined as transactions derived from a branch office supplied marketing effort or branch office provided lead source.',
  )
  h += cpLine(
    d.compBuilder,
    'Builder Marketing',
    'Defined as transactions derived from a preferred builder relationship provided by branch.',
  )
  h += cpLine(
    d.compCorporate,
    'Corporate Marketing',
    'Defined as transactions derived from corporate supplied marketing efforts or corporate provided lead source.',
  )
  h += cpLine(
    d.compLeads,
    'Leads',
    'Defined as transactions derived from leads generation systems.',
  )
  h +=
    '<p class="cp-line"><span class="cp-pct" style="' +
    COMP_HL +
    '">' +
    mn +
    '</span> Minimum: Minimum compensation by dollar amount on all loans (optional, to set no minimum compensation level list N/A).</p>'
  h +=
    '<p class="cp-line"><span class="cp-pct" style="' +
    COMP_HL +
    '">' +
    mx +
    '</span> Maximum: Max compensation by dollar amount allowed on all loans (optional, to set no maximum compensation level list N/A).</p></div>'
  if (has(d.compBrokered)) {
    h +=
      '<p>2. I select the following percentages of loan amounts as my Compensation Plan based on the categories listed below. Compensation Plan is effective as of the date below.</p>'
    h +=
      '<div class="comp-plan"><p class="cp-line"><span class="cp-pct" style="' +
      COMP_HL +
      '">' +
      cpPct(d.compBrokered) +
      '</span> for Brokered Transactions</p></div>'
  }
  return h
}

// S3 202–231
export function generateLetterHTML(rec: OfferRecord, L: LetterConfig): string {
  const d = rec.data,
    title = d.position || '[Position]',
    first = firstNameOf(d),
    name = d.employeeName || '[Employee Name]',
    addr = splitAddr(d.fullAddress),
    startLong = longDate(d.startDate)
  let openP: string
  if (L.opening === 'manager')
    openP =
      '<p>We are excited to offer you the position of ' +
      '<strong>' +
      esc(title) +
      '</strong>' +
      " at All Western Mortgage. Your leadership and experience will be a strong addition to our team, and we know you'll make a meaningful impact in this role.</p><p>" +
      esc(LB.managerBegin) +
      '</p>'
  else if (L.opening === 'dated')
    openP =
      '<p>We are excited to offer you the position of ' +
      '<strong>' +
      esc(title) +
      '</strong>' +
      ' at All Western Mortgage, beginning ' +
      esc(startLong || '[start date]') +
      '.</p>'
  else
    openP =
      '<p>We are excited to offer you the position of ' +
      '<strong>' +
      esc(title) +
      '</strong>' +
      ' at All Western Mortgage.</p>'
  let h = ''
  h += '<img class="logo" src="' + AWM_LOGO_SRC + '" alt="All Western Mortgage">'
  h += '<div class="date-line">' + esc(longDate(L.date)) + '</div>'
  h +=
    '<div class="addr" style="margin-bottom:22px"><div><strong>' +
    esc(name) +
    '</strong></div>' +
    addr.map((a) => '<div>' + esc(a) + '</div>').join('') +
    '</div>'
  h += '<p>Dear ' + esc(first) + ',</p>'
  h += openP
  h += '<p>' + esc(LB.understand) + '</p>'
  if (L.opening === 'licensed') h += '<p>' + esc(LB.licenseTransfer) + '</p>'
  h += '<p>' + esc(LB.lookForward) + '</p>'
  h += '<h3 class="sec">Compensation</h3>'
  h += '<p>' + esc(L.compIntro === 'transition' ? LB.compIntroT : LB.compIntroS) + '</p>'
  h += compTableHTML(rec, L)
  h += expectHTML(title, L)
  h += nextStepsHTML(L)
  h += '<h3 class="sec">The Path Ahead</h3><p>' + esc(PATH[L.pathAhead]) + '</p>'
  const anyComp = [
    'compStandard',
    'compBranch',
    'compBuilder',
    'compCorporate',
    'compLeads',
    'compMinimum',
    'compMaximum',
    'compBrokered',
  ].some((k) => has(d[k]))
  if (anyComp) h += commissionPlanHTML(d)
  h += '<p>' + esc(CLOSING[L.closing]) + '</p>'
  const sg = SIGNATORY[L.signatory] || SIGNATORY.kauffman
  h +=
    '<div class="sig-block"><p>Warm regards,</p><table style="width:60%;margin-top:48px;border-collapse:collapse"><tr><td style="border-top:1px solid #111;padding-top:3px"><strong>' +
    esc(sg.name) +
    '</strong><br>' +
    esc(sg.title) +
    '</td></tr></table></div>'
  h += '<p class="ack">' + esc(LB.ack) + '</p>'
  h +=
    '<table style="width:72%;margin-top:34px;border-collapse:collapse"><tr>' +
    '<td style="border-top:1px solid #111;padding-top:3px"><strong>' +
    esc(name) +
    '</strong></td><td style="width:50px"></td>' +
    '<td style="border-top:1px solid #111;padding-top:3px;width:2in">Date</td></tr></table>'
  return h
}

// S3 267
export function setByPath(obj: LetterConfig, path: string, val: unknown): void {
  const p = path.split('.')
  let t = obj as unknown as Record<string, unknown>
  for (let i = 0; i < p.length - 1; i++) t = t[p[i]] as Record<string, unknown>
  t[p[p.length - 1]] = val
}

// S3 269
export const LETTER_FOOT =
  'All Western Mortgage, Inc. &nbsp;&bull;&nbsp; 8345 W. Sunset Rd. #380<br>Las Vegas, NV 89113 &nbsp;&bull;&nbsp; Main 702.369.0905 &nbsp;&bull;&nbsp; Fax 702.920.8421'

// S3 271
export function letterWrap(body: string): string {
  return (
    '<table class="letter-table"><tfoot><tr><td><div class="lp-foot">' +
    LETTER_FOOT +
    '</div></td></tr></tfoot><tbody><tr><td>' +
    body +
    '</td></tr></tbody></table>'
  )
}

// A hand-edited letter stays valid until the user actually edits a NEW-HIRE FIELD (which sets
// letterStale=true). Incidental data round-trips (dollar reformatting, etc.) never discard the edit.
// S3 274
export function letterEditIsCurrent(rec: OfferRecord | null | undefined): boolean {
  return !!(rec && rec.letterHtml && !rec.letterStale)
}

// Body used for exports: the saved hand-edited body ONLY if the fields haven't changed since; else
// freshly generated. Client-only — the saved-body branch reads the DOM via document.createElement.
// S3 276–279
export function letterInnerFor(rec: OfferRecord, L: LetterConfig): string {
  if (letterEditIsCurrent(rec)) {
    const saved = rec.letterHtml || ''
    if (typeof document !== 'undefined') {
      try {
        const d = document.createElement('div')
        d.innerHTML = saved
        const td = d.querySelector('table.letter-table tbody td') || d.querySelector('tbody td')
        if (td) return td.innerHTML
      } catch {
        /* fall through to the raw saved body */
      }
    }
    return saved
  }
  return generateLetterHTML(rec, L)
}

// S3 583
function reEsc(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Replace any known signatory "Name<br>Title" block with the new signer, ignoring
// surrounding markup so it works even after the browser normalizes inline styles.
// S3 584–590
export function swapSigInHtml(html: string, sg: Signatory): string {
  let out = html
  ;(Object.keys(SIGNATORY) as SignatoryKey[]).forEach(function (k) {
    const o = SIGNATORY[k]
    const re = new RegExp(
      '>\\s*(?:<strong>)?\\s*' +
        reEsc(o.name) +
        '\\s*(?:</strong>)?\\s*<br\\s*/?>\\s*(?:<strong>)?\\s*' +
        reEsc(o.title) +
        '\\s*(?:</strong>)?\\s*<',
      'gi',
    )
    out = out.replace(re, '><strong>' + esc(sg.name) + '</strong><br>' + esc(sg.title) + '<')
  })
  return out
}

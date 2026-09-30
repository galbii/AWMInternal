// THE ONE-PAGE FIT CONTRACT — shared by every path that turns the offer letter
// into paper: the PDF rasterizer (pdf.ts), the browser print path (LetterView),
// the shareable HTML packet and the Word export (letter-exports.ts).
//
// Why this exists. The letter's content is not a fixed length: a salaried
// operations hire fills one comp-table row, a branch manager with a sign-on, a
// guarantee, a P&L ladder and an override fills nine — and the "How It Works"
// column carries the repayment language verbatim. Measured at the port's own
// metrics, that range runs from 1.3 to 3.0 pages. No single set of margins can
// put all of it on one sheet.
//
// So the fit is SEARCHED, not fixed. Every consumer lays the letter out
// off-screen, walks the same ladder of steps from "untouched" to "as tight as
// this engine will go", and takes the GENTLEST step that fits one page.
//
// Two knobs move together along one parameter `t`:
//
//   1. Vertical rhythm — line-height, paragraph/heading/list margins, comp-table
//      cell padding, the whitespace around the signature block. Emitted as CSS
//      custom properties so `fitCss()` is one static stylesheet and a step is
//      just a set of variables.
//   2. Type size — the letter lays out at `widthPx` and is then mapped onto a
//      532pt-wide page box, so a wider layout means smaller type on paper. This
//      is a true reflow, not a squeeze: lines re-wrap at the smaller size.
//
// THE FLOOR IS DELIBERATE. `TYPE_FLOOR_PT` stops the search at 8.5pt body copy.
// A letter that still does not fit there gets a second page rather than type
// nobody can read — this document is signed, and the reader is being asked to
// agree to the repayment terms in it. Callers surface `atFloor` so the person
// exporting knows which of the two happened.
//
// NOTHING HERE CHANGES THE LETTER'S WORDS, its rows, or its on-screen sheet.
// It only decides how densely the same letter is set on paper.

const PX_PER_PT = 96 / 72

/* ---- the page box, in points ---- */

export const PAGE_W_PT = 612
export const PAGE_H_PT = 792

/** 0.56in sides — Word's "Narrow" preset is 0.5in, so this still reads as a letter. */
export const MARGIN = { left: 40, right: 40, top: 34, bottom: 46 } as const

export const CONTENT_W_PT = PAGE_W_PT - MARGIN.left - MARGIN.right // 532
/** The PDF draws its footer with jsPDF, BELOW the content box (see pdf.ts). */
export const CONTENT_H_PT = PAGE_H_PT - MARGIN.top - MARGIN.bottom // 712
/** Print and the HTML packet keep the letter's own `.lp-foot` inside the flow,
 *  so their bottom margin does not have to reserve room for a drawn footer. */
export const PRINT_CONTENT_H_PT = PAGE_H_PT - MARGIN.top - MARGIN.top // 724

/** The page box as CSS pixels — what the browser-side paths lay out into. */
export const CONTENT_W_PX = CONTENT_W_PT * PX_PER_PT

/* ---- the ladder ---- */

/** `.letter-content` is 11pt; at step 0 that is exactly what lands on paper. */
export const TYPE_BASE_PT = 11
/** Below this the letter gets a second page instead. See the note above. */
export const TYPE_FLOOR_PT = 8.5

const STEP_COUNT = 17

/** name → [base, floor, unit]. Base values are letter.css's own, verbatim. */
const RAMP: Record<string, [number, number, string]> = {
  '--lf-lh': [1.42, 1.2, ''],
  '--lf-logo-w': [2.5, 1.7, 'in'],
  '--lf-logo-mb': [18, 6, 'px'],
  '--lf-date-mb': [14, 5, 'px'],
  '--lf-addr-mb': [22, 8, 'px'],
  '--lf-addr-lh': [1.35, 1.18, ''],
  '--lf-p-mb': [9, 3.5, 'px'],
  '--lf-h3-fs': [12.5, 11, 'pt'],
  '--lf-h3-mt': [16, 7, 'px'],
  '--lf-h3-mb': [8, 3.5, 'px'],
  '--lf-ul-mb': [11, 4, 'px'],
  '--lf-ul-pl': [22, 17, 'px'],
  '--lf-li-mb': [4, 0.5, 'px'],
  '--lf-ct-mt': [6, 2, 'px'],
  '--lf-ct-mb': [14, 6, 'px'],
  '--lf-ct-fs': [10, 8.8, 'pt'],
  '--lf-ct-py': [7, 2.5, 'px'],
  '--lf-ct-px': [9, 5.5, 'px'],
  '--lf-cp-mb': [9, 3, 'px'],
  '--lf-sig-mt': [22, 8, 'px'],
  '--lf-sigtab-mt': [48, 16, 'px'],
  '--lf-ack-mt': [26, 9, 'px'],
  '--lf-endtab-mt': [34, 12, 'px'],
  '--lf-foot-pt': [16, 6, 'px'],
}

/** Every property the ramp drives — the invariant `fitCss()` is tested against. */
export const FIT_VAR_NAMES: readonly string[] = Object.freeze(Object.keys(RAMP))

export type FitStep = {
  /** 0 = the letter untouched, 1 = as tight as this engine goes. */
  t: number
  /** What 11pt body copy actually measures on paper at this step. */
  typePt: number
  /** Lay the letter out at this CSS width, then map it onto CONTENT_W_PT. */
  widthPx: number
  /** The same reduction as a CSS zoom, for the paths that scale in-browser. */
  zoom: number
  /** The custom properties `fitCss()` reads. */
  vars: Readonly<Record<string, string>>
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function buildStep(t: number): FitStep {
  const vars: Record<string, string> = {}
  for (const name of Object.keys(RAMP)) {
    const [base, floor, unit] = RAMP[name]
    vars[name] = round(base + (floor - base) * t, 3) + unit
  }
  const typePt = round(TYPE_BASE_PT + (TYPE_FLOOR_PT - TYPE_BASE_PT) * t, 3)
  // 11pt of CSS is 14.667px; laying out at `widthPx` and mapping that onto
  // CONTENT_W_PT lands it at `typePt` on paper.
  const widthPx = Math.round((TYPE_BASE_PT * PX_PER_PT * CONTENT_W_PT) / typePt)
  return { t, typePt, widthPx, zoom: round(CONTENT_W_PX / widthPx, 4), vars }
}

/** The ladder, gentlest first. Every consumer walks this exact list. */
export const FIT_STEPS: readonly FitStep[] = Object.freeze(
  Array.from({ length: STEP_COUNT }, (_, i) => buildStep(round(i / (STEP_COUNT - 1), 4))),
)

/** The untouched letter — what a caller uses when it wants no compression. */
export const FIT_STEP_BASE = FIT_STEPS[0]
/** The tightest step — the one the Word export pins itself to. */
export const FIT_STEP_FLOOR = FIT_STEPS[FIT_STEPS.length - 1]

/* ---- the stylesheet the steps drive ---- */

// Every declaration falls back to letter.css's own value, so this sheet is inert
// until a step's variables are set on the scope element. `!important` appears
// only where the generated letter carries the length as an INLINE style
// (the address block, the two signature tables) — nothing else can outrank it.
export function fitCss(scope: string): string {
  const s = scope
  return [
    `${s}.letter-content,${s} .letter-content{line-height:var(--lf-lh,1.42)}`,
    `${s} .logo{width:var(--lf-logo-w,2.5in)!important;margin:0 0 var(--lf-logo-mb,18px)!important}`,
    `${s} .date-line{margin-bottom:var(--lf-date-mb,14px)!important}`,
    `${s} .addr{margin-bottom:var(--lf-addr-mb,22px)!important}`,
    `${s} .addr div{line-height:var(--lf-addr-lh,1.35)}`,
    `${s} p{margin:0 0 var(--lf-p-mb,9px)}`,
    `${s} h3.sec{font-size:var(--lf-h3-fs,12.5pt);margin:var(--lf-h3-mt,16px) 0 var(--lf-h3-mb,8px)}`,
    `${s} ul{margin:0 0 var(--lf-ul-mb,11px);padding-left:var(--lf-ul-pl,22px)}`,
    `${s} ul li{margin-bottom:var(--lf-li-mb,4px)}`,
    `${s} .comp-table{margin:var(--lf-ct-mt,6px) 0 var(--lf-ct-mb,14px);font-size:var(--lf-ct-fs,10pt)}`,
    `${s} .comp-table th,${s} .comp-table td{padding:var(--lf-ct-py,7px) var(--lf-ct-px,9px)}`,
    `${s} .comp-plan .cp-line{margin:0 0 var(--lf-cp-mb,9px)}`,
    `${s} .sig-block{margin-top:var(--lf-sig-mt,22px)}`,
    `${s} .sig-block table{margin-top:var(--lf-sigtab-mt,48px)!important}`,
    `${s} .ack{margin-top:var(--lf-ack-mt,26px)!important}`,
    // The name/date table that closes the letter. Two shapes reach here: the PDF
    // stage holds the bare body (direct child), print and the packet hold it
    // inside letterWrap's table. `.comp-table` is a sibling in both — exclude it.
    `${s}>table:not(.comp-table),${s} .letter-table>tbody>tr>td>table:not(.comp-table){margin-top:var(--lf-endtab-mt,34px)!important}`,
    `${s} .lp-foot{padding-top:var(--lf-foot-pt,16px)}`,
  ].join('')
}

/* ---- the search ---- */

export type FitMeasure = (step: FitStep) => number | Promise<number>

export type FitResult = {
  step: FitStep
  /** The laid-out letter's height, in page points. */
  heightPt: number
  /** 1 whenever the letter fitted; >1 only when the floor could not hold it. */
  pages: number
  /** True when even the tightest step overflowed — the caller should say so. */
  atFloor: boolean
}

/** A height measured at `step` expressed in page points. */
export function heightToPt(heightPx: number, step: FitStep): number {
  return (heightPx * CONTENT_W_PT) / step.widthPx
}

function pagesOf(heightPt: number, contentHPt: number): number {
  // A hair of tolerance: a sub-point overshoot is a rounding artefact of the
  // measurement, not a second page.
  return Math.max(1, Math.ceil(heightPt / contentHPt - 0.003))
}

/**
 * Walk the ladder and return the GENTLEST step whose letter fits one page.
 *
 * Height falls monotonically as `t` rises, so this binary-searches rather than
 * scanning: ~7 layout reads instead of 17. `measure` is injected, which is what
 * makes the policy testable without a browser.
 */
export async function chooseFit(
  measure: FitMeasure,
  contentHPt: number = CONTENT_H_PT,
): Promise<FitResult> {
  const steps = FIT_STEPS
  const at = async (i: number): Promise<number> => heightToPt(await measure(steps[i]), steps[i])

  const first = await at(0)
  if (first <= contentHPt) return { step: steps[0], heightPt: first, pages: 1, atFloor: false }

  const last = steps.length - 1
  const tightest = await at(last)
  if (tightest > contentHPt)
    return {
      step: steps[last],
      heightPt: tightest,
      pages: pagesOf(tightest, contentHPt),
      atFloor: true,
    }

  let lo = 0,
    hi = last,
    hiPt = tightest
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    const h = await at(mid)
    if (h <= contentHPt) {
      hi = mid
      hiPt = h
    } else {
      lo = mid
    }
  }
  return { step: steps[hi], heightPt: hiPt, pages: 1, atFloor: hi === last }
}

/* ---- the off-screen stage (browser only) ---- */

const STAGE_ID = 'awm-letter-fit-stage'

export type FitStage = {
  /** The `.letter-content` node — measured, and rasterized by the PDF path. */
  el: HTMLElement
  /** Lay the letter out at a step without reading anything back. */
  apply: (step: FitStep) => void
  /** Apply a step and return the resulting height in CSS pixels. */
  measure: FitMeasure
}

/**
 * Lay `bodyHtml` out off-screen with the fit stylesheet attached, hand the stage
 * to `run`, and tear both down afterwards.
 *
 * The stage inherits the app's letter.css (the offers route group loads it), so
 * what is measured here is the same document the sheet renders — only denser.
 */
export async function withLetterFitStage<T>(
  bodyHtml: string,
  run: (stage: FitStage) => Promise<T>,
): Promise<T> {
  if (typeof document === 'undefined')
    throw new Error('The letter fit stage is only available in the browser.')

  const style = document.createElement('style')
  style.textContent = fitCss('#' + STAGE_ID)
  document.head.appendChild(style)

  const host = document.createElement('div')
  host.setAttribute(
    'style',
    'position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;pointer-events:none',
  )
  document.body.appendChild(host)
  try {
    host.innerHTML =
      '<div id="' +
      STAGE_ID +
      '" class="letter-content" style="padding:0;background:#fff">' +
      bodyHtml +
      '</div>'
    const el = host.firstElementChild as HTMLElement

    // The letterhead is a data URI with no intrinsic height declared. Measuring
    // before it decodes reports a letter ~60px short and the search picks a step
    // too gentle to actually fit — so wait for every image first.
    await Promise.all(
      Array.from(el.querySelectorAll('img')).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true })
              img.addEventListener('error', () => res(), { once: true })
            }),
      ),
    )

    const apply = (step: FitStep): void => {
      el.style.width = step.widthPx + 'px'
      for (const name of Object.keys(step.vars)) el.style.setProperty(name, step.vars[name])
    }
    const measure: FitMeasure = (step) => {
      apply(step)
      return el.getBoundingClientRect().height
    }
    return await run({ el, apply, measure })
  } finally {
    host.remove()
    style.remove()
  }
}

/** Measure a letter body and pick its step, without rasterizing it. */
export async function planLetterFit(
  bodyHtml: string,
  contentHPt: number = CONTENT_H_PT,
): Promise<FitResult> {
  return withLetterFitStage(bodyHtml, ({ measure }) => chooseFit(measure, contentHPt))
}

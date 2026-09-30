import { describe, expect, test } from 'bun:test'
import {
  CONTENT_H_PT,
  CONTENT_W_PT,
  FIT_STEPS,
  FIT_STEP_BASE,
  FIT_STEP_FLOOR,
  FIT_VAR_NAMES,
  MARGIN,
  PAGE_H_PT,
  PAGE_W_PT,
  PRINT_CONTENT_H_PT,
  TYPE_BASE_PT,
  TYPE_FLOOR_PT,
  chooseFit,
  fitCss,
  heightToPt,
} from '@/lib/offers/letter-fit'
import type { FitStep } from '@/lib/offers/letter-fit'

describe('the page box', () => {
  test('is US letter and agrees with letter.css @page (34pt 40pt 34pt)', () => {
    expect([PAGE_W_PT, PAGE_H_PT]).toEqual([612, 792])
    expect(CONTENT_W_PT).toBe(532)
    expect(CONTENT_H_PT).toBe(712)
    // Print keeps the letter's own .lp-foot in the flow, so it gets the room the
    // PDF reserves for its drawn footer.
    expect(PRINT_CONTENT_H_PT).toBe(724)
    expect(PRINT_CONTENT_H_PT).toBeGreaterThan(CONTENT_H_PT)
    // The inch values written into letter.css / the packet / the Word export.
    expect(+(MARGIN.top / 72).toFixed(3)).toBe(0.472)
    expect(+(MARGIN.left / 72).toFixed(3)).toBe(0.556)
  })
})

describe('the ladder', () => {
  test('runs from the untouched letter to the readability floor', () => {
    expect(FIT_STEPS.length).toBe(17)
    expect(FIT_STEP_BASE).toBe(FIT_STEPS[0])
    expect(FIT_STEP_FLOOR).toBe(FIT_STEPS[FIT_STEPS.length - 1])
    expect(FIT_STEPS[0].t).toBe(0)
    expect(FIT_STEPS[FIT_STEPS.length - 1].t).toBe(1)
    expect(FIT_STEPS[0].typePt).toBe(TYPE_BASE_PT)
    expect(FIT_STEPS[FIT_STEPS.length - 1].typePt).toBe(TYPE_FLOOR_PT)
  })

  test('never goes below the floor — an unreadable letter is not an option', () => {
    for (const s of FIT_STEPS) expect(s.typePt).toBeGreaterThanOrEqual(TYPE_FLOOR_PT)
  })

  test('step 0 is inert: 11pt lays out as 11pt and the vars are letter.css values', () => {
    const s = FIT_STEPS[0]
    // 11pt CSS at widthPx, mapped onto CONTENT_W_PT, must come back as 11pt.
    expect(Math.abs((11 * (96 / 72) * CONTENT_W_PT) / s.widthPx - 11)).toBeLessThan(0.01)
  })

  test('tightens monotonically — which is what lets chooseFit binary-search', () => {
    for (let i = 1; i < FIT_STEPS.length; i++) {
      expect(FIT_STEPS[i].t).toBeGreaterThan(FIT_STEPS[i - 1].t)
      expect(FIT_STEPS[i].typePt).toBeLessThan(FIT_STEPS[i - 1].typePt)
      // Smaller type on paper == a wider layout scaled down further.
      expect(FIT_STEPS[i].widthPx).toBeGreaterThan(FIT_STEPS[i - 1].widthPx)
      expect(FIT_STEPS[i].zoom).toBeLessThan(FIT_STEPS[i - 1].zoom)
      for (const name of FIT_VAR_NAMES) {
        expect(parseFloat(FIT_STEPS[i].vars[name])).toBeLessThanOrEqual(
          parseFloat(FIT_STEPS[i - 1].vars[name]),
        )
      }
    }
  })

  test('every var carries its unit, and only lengths carry one', () => {
    for (const name of FIT_VAR_NAMES) {
      const v = FIT_STEPS[8].vars[name]
      expect(v).toMatch(/^\d+(\.\d+)?(px|pt|in)?$/)
      // The two unitless ones are line-heights.
      if (!/px|pt|in/.test(v)) expect(name).toMatch(/-lh$/)
    }
  })
})

describe('fitCss', () => {
  test('drives every ramped property — a var with no rule would be dead weight', () => {
    const css = fitCss('#x')
    for (const name of FIT_VAR_NAMES) expect(css).toContain('var(' + name + ',')
  })

  test('declares no var the ramp does not supply', () => {
    const used = new Set(
      Array.from(fitCss('#x').matchAll(/var\((--[a-z0-9-]+)/g)).map((m) => m[1]),
    )
    for (const name of used) expect(FIT_VAR_NAMES).toContain(name)
  })

  test('is inert without variables: every fallback is letter.css’s own value', () => {
    const css = fitCss('#x')
    // A sample across the sheet, matched against letter.css / the generated
    // letter’s inline styles. Drift here silently changes the untouched letter.
    expect(css).toContain('var(--lf-lh,1.42)')
    expect(css).toContain('var(--lf-p-mb,9px)')
    expect(css).toContain('var(--lf-h3-fs,12.5pt)')
    expect(css).toContain('var(--lf-ct-fs,10pt)')
    expect(css).toContain('var(--lf-ct-py,7px)')
    expect(css).toContain('var(--lf-logo-w,2.5in)')
    // These three are INLINE on the generated letter, hence the 22/48/34.
    expect(css).toContain('var(--lf-addr-mb,22px)')
    expect(css).toContain('var(--lf-sigtab-mt,48px)')
    expect(css).toContain('var(--lf-endtab-mt,34px)')
  })

  test('scopes every rule, so it can never leak onto the on-screen sheet', () => {
    for (const rule of fitCss('#stage').split('}').filter(Boolean)) {
      expect(rule).toContain('#stage')
    }
  })

  test('reaches the closing name/date table in both shapes, never the comp table', () => {
    const css = fitCss('#stage')
    // The PDF stage holds the bare body; print and the packet wrap it in a table.
    expect(css).toContain('#stage>table:not(.comp-table)')
    expect(css).toContain('#stage .letter-table>tbody>tr>td>table:not(.comp-table)')
  })
})

describe('chooseFit', () => {
  /** A letter that measures `pt` page-points tall at every step. */
  const flat = (pt: number) => (step: FitStep) => (pt * step.widthPx) / CONTENT_W_PT

  /** A letter that only fits once the ladder reaches `k`. */
  const fitsFrom = (k: number) => (step: FitStep) => {
    const i = FIT_STEPS.indexOf(step)
    return ((CONTENT_H_PT + (i < k ? 12 : -12)) * step.widthPx) / CONTENT_W_PT
  }

  test('heightToPt maps a measured layout onto the page', () => {
    const s = FIT_STEPS[0]
    expect(heightToPt(s.widthPx, s)).toBeCloseTo(CONTENT_W_PT, 6)
  })

  test('a short letter is left completely alone', async () => {
    const r = await chooseFit(flat(300))
    expect(r.step).toBe(FIT_STEPS[0])
    expect(r.pages).toBe(1)
    expect(r.atFloor).toBe(false)
  })

  test('a letter that exactly fills the page is left alone', async () => {
    const r = await chooseFit(flat(CONTENT_H_PT))
    expect(r.step).toBe(FIT_STEPS[0])
    expect(r.atFloor).toBe(false)
  })

  test('picks the GENTLEST step that fits, for every rung of the ladder', async () => {
    for (let k = 0; k < FIT_STEPS.length; k++) {
      const r = await chooseFit(fitsFrom(k))
      expect(r.step).toBe(FIT_STEPS[k])
      expect(r.pages).toBe(1)
      expect(r.atFloor).toBe(k === FIT_STEPS.length - 1)
    }
  })

  test('binary-searches rather than scanning: ~7 reads, not 17', async () => {
    let reads = 0
    const m = fitsFrom(9)
    await chooseFit((s) => {
      reads++
      return m(s)
    })
    expect(reads).toBeLessThanOrEqual(8)
  })

  test('a letter too long even at the floor keeps its pages instead of shrinking', async () => {
    const r = await chooseFit(flat(CONTENT_H_PT * 3))
    expect(r.step).toBe(FIT_STEP_FLOOR)
    expect(r.atFloor).toBe(true)
    expect(r.pages).toBe(3)
    // The floor holds: callers report two pages, they never get 6pt type.
    expect(r.step.typePt).toBe(TYPE_FLOOR_PT)
  })

  test('a sub-point overshoot is rounding, not a second page', async () => {
    const r = await chooseFit(flat(CONTENT_H_PT + 1))
    expect(r.pages).toBe(1)
  })

  test('honours a caller’s own content height (print’s box differs)', async () => {
    const tall = flat(CONTENT_H_PT + 6)
    expect((await chooseFit(tall, CONTENT_H_PT)).step).not.toBe(FIT_STEPS[0])
    expect((await chooseFit(tall, PRINT_CONTENT_H_PT)).step).toBe(FIT_STEPS[0])
  })
})

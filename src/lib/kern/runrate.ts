// The intra-month projection model behind the Monthly tab. K 1439-1461.
//
// The question: five business days into a month, where will the month land?
//
// The approach is a SHAPE model, not a linear extrapolation. For each past
// month it measures "what fraction of the final total had funded by business
// day N", giving a distribution of fractions. Today's total divided by that
// fraction is the projection, and the spread of the distribution is the
// confidence band.
//
// Two details matter and are ported exactly:
//
//  - SHRINKAGE. A user can select two branches, leaving very few reference
//    months. `w = n/(n+8)` blends the selection's own quantiles toward the
//    stable company-wide distribution (PROD_RUNRATE.gfD/gfU), so a thin
//    selection borrows the shape of the whole book instead of projecting off
//    noise. With many months, w → 1 and the prior washes out.
//  - A FLOOR of 0.03 on any fraction. Dividing by a near-zero fraction would
//    produce an absurd projection; the floor caps it at ~33x.

/** Linear-interpolated quantile over a SORTED ascending array. K 1450 */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

export interface MonthPoint {
  /** Cumulative through the current business day. */
  cum: number
  /** The month's final total. */
  tot: number
  bdays: number
  arr: number[]
}

export interface RunRateFit {
  /** Cumulative so far in the in-progress month. */
  actual: number
  /** The median fraction — projection = actual / frac. */
  frac: number
  /** Blended quantile function over the fraction distribution. */
  bq: (p: number) => number
  /** Back-tested mean absolute percentage error, in percent. */
  mape: number
  conf: 'Low' | 'Moderate' | 'High'
  /** Business days in the in-progress month. */
  bdaysPm: number
  /** How many months the back-test covered. */
  n: number
  /** The months whose shape fed the model. */
  shapeMonths: string[]
}

export interface FitInput {
  /** Candidate reference months (excluding the in-progress one). */
  patMonths: string[]
  /** The in-progress month. */
  pm: string
  /** Cumulative series accessor for a month, over the current selection. */
  at: (month: string) => MonthPoint
  /** Company-wide historical fractions at this business day — the prior. */
  gf: number[]
}

/**
 * K 1442-1461. Returns null when there is not enough signal to project:
 * no qualifying reference months, or nothing funded yet this month.
 */
export function fitRunRate({ patMonths, pm, at, gf }: FitInput): RunRateFit | null {
  // K 1444-1445 — ignore immaterial months (<10% of peak). A month where one
  // loan funded would otherwise contribute a wild fraction.
  let maxTot = 0
  patMonths.forEach((mo) => {
    const t = at(mo).tot
    if (t > maxTot) maxTot = t
  })
  const thr = Math.max(1, maxTot * 0.1)

  const fracs: number[] = []
  let sumCum = 0
  let sumTot = 0
  const shapeMonths: string[] = []
  patMonths.forEach((mo) => {
    const x = at(mo)
    if (x.tot > thr) {
      fracs.push(x.cum / x.tot)
      sumCum += x.cum
      sumTot += x.tot
      shapeMonths.push(mo)
    }
  })

  const pmX = at(pm)
  if (!fracs.length || sumTot <= 0 || pmX.cum <= 0) return null

  fracs.sort((a, b) => a - b)
  const gfSorted = [...gf].sort((a, b) => a - b)

  const nM = fracs.length
  const w = nM / (nM + 8)
  const floor = (x: number): number => Math.max(0.03, x)
  const bq = (pp: number): number =>
    floor(w * quantile(fracs, pp) + (1 - w) * quantile(gfSorted, pp))

  // K 1455 — leave-one-out back-test: project each reference month from the
  // pooled ratio of the OTHERS, and average the absolute error.
  let ae = 0
  let cnt = 0
  shapeMonths.forEach((mo) => {
    const x = at(mo)
    const sc = sumCum - x.cum
    const st = sumTot - x.tot
    if (st <= 0) return
    ae += Math.abs(x.cum / (sc / st) / x.tot - 1)
    cnt++
  })
  const mape = cnt ? (ae / cnt) * 100 : 0
  const conf: RunRateFit['conf'] = mape > 30 ? 'Low' : mape > 15 ? 'Moderate' : 'High'

  return { actual: pmX.cum, frac: bq(0.5), bq, mape, conf, bdaysPm: pmX.bdays, n: cnt, shapeMonths }
}

/**
 * K 1496-1501 — the per-business-day median pace shape, and the curve that
 * grows today's actual to a projected total along it.
 *
 * The curve is anchored at the actual (so it starts where reality is) and
 * approaches the target along the typical shape, rather than a straight line.
 */
export function paceCurve(
  fit: RunRateFit,
  maxN: number,
  bd: number,
  getSub: (month: string) => number[],
) {
  const medShape = new Array<number>(maxN).fill(1)
  for (let k = 1; k <= maxN; k++) {
    const vals = fit.shapeMonths
      .map((mo) => {
        const a = getSub(mo)
        const tot = a[a.length - 1] || 1
        return (a[Math.min(k, a.length) - 1] || 0) / tot
      })
      .sort((x, y) => x - y)
    medShape[k - 1] = quantile(vals, 0.5)
  }

  const endN = fit.bdaysPm
  const mBD = medShape[bd - 1] || 1e-9
  const mEnd = medShape[endN - 1] || 1
  const denom = mEnd - mBD || 1

  const curve = (frac: number): (number | null)[] => {
    const T = fit.actual / frac
    const a = new Array<number | null>(maxN).fill(null)
    for (let k = bd; k <= endN; k++) {
      const g = Math.min(1, Math.max(0, (medShape[k - 1] - mBD) / denom))
      a[k - 1] = Math.round(fit.actual + (T - fit.actual) * g)
    }
    return a
  }

  return { medShape, curve, endN, mBD }
}

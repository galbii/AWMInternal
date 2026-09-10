import { describe, expect, test } from 'bun:test'

import { creditOperatorRows, creditOrgRows, creditTotals } from '@/lib/kern/credit'
import { computePnl, knownSupport, rosterBasis } from '@/lib/kern/pnl'
import {
  groupKeyForOrg,
  groupMonthly,
  prodGroups,
  prodMonths,
  prodName,
} from '@/lib/kern/production'
import { fitRunRate, quantile } from '@/lib/kern/runrate'
import { tenureRows } from '@/lib/kern/tenure'
import type { CreditData, OrgState, PnlSettings } from '@/lib/kern/types'

const PNL: PnlSettings = {
  procFee: 695,
  loaBps: 10,
  people: 5,
  salary: 5000,
  hiBps: 10,
  loBps: 5,
  procHiPct: 67,
  loaHiPct: 33,
  onTop: true,
  useRoster: true,
  units: '',
  vol: '',
}

const state = (over: Partial<OrgState> = {}): OrgState => ({
  superDivisions: [{ id: 'sd1', name: 'Matrix', manager: '' }],
  divisions: [{ id: 'd1', name: 'Matrix Red', manager: '', parentId: 'sd1' }],
  regions: [{ id: 'r1', name: 'North', manager: '', divisionId: 'd1' }],
  areas: [],
  branches: [
    {
      id: 'b1',
      orgid: '100',
      name: 'Alpha',
      manager: '',
      status: 'Active',
      regionPending: '',
      processors: [],
      loas: [],
      servicedBy: [],
      roster: [],
      areaId: null,
      regionId: 'r1',
      divisionId: 'd1',
      archived: false,
    },
  ],
  titles: [],
  production: {
    '100': { '2026-01': [1_000_000, 4], '2026-02': [2_000_000, 6] },
    OTHER: { '2026-01': [500_000, 2] },
  },
  prodExcluded: {},
  productMix: {},
  pnl: PNL,
  ...over,
})

describe('production rollups', () => {
  const s = state()

  test('prodName falls back to the ORG id', () => {
    expect(prodName(s, '100')).toBe('Alpha')
    expect(prodName(s, 'OTHER')).toBe('Other')
    expect(prodName(s, '999')).toBe('ORG 999')
  })

  test('prodMonths is the sorted union across branches', () =>
    expect(prodMonths(s)).toEqual(['2026-01', '2026-02']))

  test('prodGroups sorts by dollars and honours exclusions', () => {
    expect(prodGroups(s, true).map((g) => g.org)).toEqual(['100', 'OTHER'])
    const ex = state({ prodExcluded: { OTHER: true } })
    expect(prodGroups(ex, false).map((g) => g.org)).toEqual(['100'])
    // `all` overrides the exclusion — that's how the Data tab still lists it.
    expect(prodGroups(ex, true).map((g) => g.org)).toEqual(['100', 'OTHER'])
  })

  test('at division level a single super-division absorbs untagged production', () => {
    // The deliberate source behaviour: at the coarsest level the answer is
    // "the whole company", not a split with an Unassigned slice.
    expect(groupKeyForOrg(s, '100', 'division')).toBe('Matrix')
    expect(groupKeyForOrg(s, 'OTHER', 'division')).toBe('Matrix')
  })

  test('with two super-divisions untagged production separates out', () => {
    const two = state({
      superDivisions: [
        { id: 'sd1', name: 'Matrix', manager: '' },
        { id: 'sd2', name: 'Other Co', manager: '' },
      ],
    })
    expect(groupKeyForOrg(two, 'OTHER', 'division')).toBe('Unassigned')
  })

  test('finer dimensions bucket untagged as Unassigned', () => {
    expect(groupKeyForOrg(s, '100', 'region')).toBe('North')
    expect(groupKeyForOrg(s, '100', 'area')).toBe('Unassigned')
    expect(groupKeyForOrg(s, 'OTHER', 'region')).toBe('Unassigned')
    expect(groupKeyForOrg(s, '100', 'branch')).toBe('Alpha')
  })

  test('groupMonthly sums included orgs into their bucket', () => {
    const g = groupMonthly(s, 'division')
    expect(g.Matrix['2026-01']).toEqual([1_500_000, 6])
    expect(g.Matrix['2026-02']).toEqual([2_000_000, 6])
  })

  test('groupMonthly drops excluded orgs', () => {
    const g = groupMonthly(state({ prodExcluded: { OTHER: true } }), 'division')
    expect(g.Matrix['2026-01']).toEqual([1_000_000, 4])
  })
})

describe('tenure', () => {
  test('orders by first funded month, then activity, then volume', () => {
    const s = state({
      production: {
        late: { '2026-02': [9_000_000, 30] },
        early: { '2026-01': [10, 1], '2026-02': [10, 1] },
        never: { '2026-01': [0, 0] },
      },
    })
    const rows = tenureRows(s, prodMonths(s))
    expect(rows.map((r) => r.org)).toEqual(['early', 'late'])
    // A month with 0/0 is not "active" and never becomes `first`.
    expect(rows.find((r) => r.org === 'never')).toBeUndefined()
    expect(rows[0].active).toBe(2)
    expect(rows[0].first).toBe('2026-01')
  })
})

describe('branch P&L', () => {
  test('worked example', () => {
    const r = computePnl(PNL, 100, 40_000_000)
    expect(r.units).toBe(100)
    expect(r.vol).toBe(40_000_000)
    expect(r.avgLoan).toBe(400_000)
    expect(r.team).toBe(25_000)
    // 100 * 695 + 40M * 10bps
    expect(r.revenue).toBe(69_500 + 40_000)
    // blended: .67*10 + .33*5 = 8.35 ; .33*10 + .67*5 = 6.65 ; total 15 bps
    expect(r.procBps).toBeCloseTo(8.35, 10)
    expect(r.loaBps).toBeCloseTo(6.65, 10)
    expect(r.compBlend).toBeCloseTo(60_000, 6)
    // both roles at the low tier => 2 * 5bps = 10bps
    expect(r.compLow).toBe(40_000)
    expect(r.netBlend).toBeCloseTo(109_500 - 60_000 - 25_000, 6)
    expect(r.netLow).toBe(109_500 - 40_000 - 25_000)
    expect(r.compSaving).toBeCloseTo(20_000, 6)
  })

  test('onTop=false drops the salary line from net but keeps team', () => {
    const r = computePnl({ ...PNL, onTop: false }, 100, 40_000_000)
    expect(r.team).toBe(25_000)
    expect(r.fixed).toBe(0)
    expect(r.netBlend).toBeCloseTo(109_500 - 60_000, 6)
  })

  test('useRoster=false switches to the manual override', () => {
    const r = computePnl({ ...PNL, useRoster: false, units: 10, vol: 1_000_000 }, 999, 999)
    expect(r.units).toBe(10)
    expect(r.vol).toBe(1_000_000)
  })

  test('an empty manual override reads as zero, not NaN', () => {
    const r = computePnl({ ...PNL, useRoster: false, units: '', vol: '' }, 50, 5)
    expect(r.units).toBe(0)
    expect(r.vol).toBe(0)
    expect(r.avgLoan).toBe(0)
    expect(Number.isFinite(r.netBlend)).toBe(true)
  })

  test('break-even is null when a unit never contributes', () => {
    // procFee 0 and loaBps below 2x loBps => contribution per unit <= 0.
    const r = computePnl({ ...PNL, procFee: 0, loaBps: 1, loBps: 5 }, 100, 40_000_000)
    expect(r.breakEvenUnits).toBeNull()
  })

  test('knownSupport pools names by title and the legacy lists', () => {
    const branches = [
      {
        roster: [
          { name: 'Jane', title: 'Senior Processor' },
          { name: 'Ann', title: 'Loan Officer Assistant' },
        ],
      },
      { processors: ['Bob'], loas: ['Cy'] },
      { processorName: 'Zed' },
    ]
    expect(knownSupport(branches, 'proc')).toEqual(['Bob', 'Jane', 'Zed'])
    expect(knownSupport(branches, 'loa')).toEqual(['Ann', 'Cy'])
  })
})

describe('rosterBasis', () => {
  const production = {
    '100': {
      '2026-01': [1_000_000, 4] as [number, number],
      '2026-08': [10, 1] as [number, number],
    },
  }

  test('the in-progress month is excluded from every average', () => {
    const b = rosterBasis(production, '2026-08')
    // Only 2026-01 counts: 4 units, $250k average loan.
    expect(b.monthlyUnits({ orgid: '100' })).toBe(4)
    expect(b.avgLoan({ orgid: '100' })).toBe(250_000)
  })

  test('without the partial-month guard the average is dragged down', () => {
    const b = rosterBasis(production, null)
    expect(b.monthlyUnits({ orgid: '100' })).toBe(2.5)
  })

  test('a branch with no production falls back to the company average', () => {
    const b = rosterBasis(production, '2026-08')
    expect(b.monthlyUnits({ orgid: '999' })).toBeNull()
    expect(b.avgLoan({ orgid: '999' })).toBe(250_000)
    expect(b.avgLoan({})).toBe(250_000)
  })
})

describe('run-rate model', () => {
  test('quantile interpolates linearly', () => {
    expect(quantile([0, 10], 0.5)).toBe(5)
    expect(quantile([0, 1, 2, 3, 4], 0.25)).toBe(1)
    expect(quantile([], 0.5)).toBe(0)
  })

  // Three reference months that each funded exactly 20% by the current day.
  const mk = (cum: number, tot: number) => ({ cum, tot, bdays: 20, arr: [] as number[] })
  const at = (m: string) =>
    ({
      a: mk(200, 1000),
      b: mk(200, 1000),
      c: mk(200, 1000),
      pm: mk(300, 0),
    })[m] ?? mk(0, 0)

  test('a clean 20% pattern projects 5x', () => {
    const fit = fitRunRate({ patMonths: ['a', 'b', 'c'], pm: 'pm', at, gf: [0.2, 0.2, 0.2] })
    expect(fit).not.toBeNull()
    expect(fit!.frac).toBeCloseTo(0.2, 6)
    expect(fit!.actual / fit!.frac).toBeCloseTo(1500, 6)
    expect(fit!.conf).toBe('High')
  })

  test('shrinkage pulls a thin sample toward the company prior', () => {
    // One reference month at 50%, prior says 10%. w = 1/9, so the blend lands
    // much nearer the prior than the sample.
    const one = (m: string) => (m === 'a' ? mk(500, 1000) : mk(300, 0))
    const fit = fitRunRate({ patMonths: ['a'], pm: 'pm', at: one, gf: [0.1] })
    const blended = (1 / 9) * 0.5 + (8 / 9) * 0.1
    expect(fit!.frac).toBeCloseTo(blended, 6)
  })

  test('the 0.03 floor stops a near-zero fraction exploding the projection', () => {
    const tiny = (m: string) => (m === 'a' ? mk(1, 1_000_000) : mk(300, 0))
    const fit = fitRunRate({ patMonths: ['a'], pm: 'pm', at: tiny, gf: [0.000001] })
    expect(fit!.frac).toBe(0.03)
    // Capped at ~33x rather than a million-fold projection.
    expect(fit!.actual / fit!.frac).toBeCloseTo(10_000, 6)
  })

  test('immaterial months (<10% of peak) are ignored', () => {
    const mixed = (m: string) =>
      ({ big: mk(200, 1000), noise: mk(50, 50), pm: mk(300, 0) })[m] ?? mk(0, 0)
    const fit = fitRunRate({ patMonths: ['big', 'noise'], pm: 'pm', at: mixed, gf: [0.2] })
    // 'noise' funded 100% by now but totals 5% of the peak, so it is dropped.
    expect(fit!.shapeMonths).toEqual(['big'])
  })

  test('returns null when the month has not started', () => {
    const zero = (m: string) => (m === 'pm' ? mk(0, 0) : mk(200, 1000))
    expect(fitRunRate({ patMonths: ['a'], pm: 'pm', at: zero, gf: [0.2] })).toBeNull()
  })

  test('returns null with no qualifying reference months', () =>
    expect(fitRunRate({ patMonths: [], pm: 'pm', at, gf: [0.2] })).toBeNull())
})

describe('credit aggregation', () => {
  const data: CreditData = {
    descs: ['Credit Report', 'Reissue'],
    ops: ['alpha.jane', 'ghost.pat'],
    orgs: {
      '100': {
        loans: {
          L1: {
            i: [
              ['01/01/2026', 0, 100, 0, 0],
              ['01/02/2026', 1, 50, -10, 1],
            ],
          },
        },
      },
    },
  }
  const s = state()

  test('rollups sum charges and credits', () => {
    const rows = creditOrgRows(s, data)
    expect(rows[0]).toMatchObject({
      o: '100',
      name: 'Alpha',
      nl: 1,
      ni: 2,
      ch: 150,
      cr: -10,
      net: 140,
    })
    expect(creditTotals(rows)).toEqual({ ch: 150, cr: -10, nl: 1, ni: 2 })
  })

  test('an operator matching this branch is neither foreign nor unknown', () => {
    const ops = creditOperatorRows(s, data, '100')
    const alpha = ops.find((o) => o.code === 'alpha.jane')!
    expect(alpha.home).toBe('Alpha')
    expect(alpha.foreign).toBe(false)
    expect(alpha.unknown).toBe(false)
  })

  test('an unrecognised operator is flagged rather than silently bucketed', () => {
    const ops = creditOperatorRows(s, data, '100')
    const ghost = ops.find((o) => o.code === 'ghost.pat')!
    expect(ghost.unknown).toBe(true)
    expect(ghost.home).toBeNull()
  })

  test('an operator from another branch is flagged foreign', () => {
    const two = state({
      branches: [
        ...s.branches,
        {
          id: 'b2',
          orgid: '200',
          name: 'Ghost',
          manager: '',
          status: 'Active',
          regionPending: '',
          processors: [],
          loas: [],
          servicedBy: [],
          roster: [],
          areaId: null,
          regionId: null,
          divisionId: null,
          archived: false,
        },
      ],
    })
    const ghost = creditOperatorRows(two, data, '100').find((o) => o.code === 'ghost.pat')!
    expect(ghost.home).toBe('Ghost')
    expect(ghost.foreign).toBe(true)
    expect(ghost.unknown).toBe(false)
  })
})

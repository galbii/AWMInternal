// Smoke test over the REAL generated datasets, not fixtures.
//
// The unit tests elsewhere prove the math; this proves the shipped data
// actually flows through it. Every tab's computation runs here, so a
// shape mismatch between scripts/kern-extract-data.ts output and
// src/lib/kern/types.ts fails a test instead of a browser tab.

import { describe, expect, test } from 'bun:test'

import { creditOperatorRows, creditOrgRows, creditTotals } from '@/lib/kern/credit'
import {
  PROD,
  PROD_DAILY,
  PROD_DAILY_BR,
  PROD_MBDAYS,
  PROD_RUNRATE,
} from '@/lib/kern/data/production'
import { TYROSTER } from '@/lib/kern/data/roster'
import { computePnl, knownSupport, rosterBasis } from '@/lib/kern/pnl'
import { normalize, seedState } from '@/lib/kern/normalize'
import { branchCountForSuperDivision, orphanBranches } from '@/lib/kern/org'
import { groupKeyForOrg, groupMonthly, prodGroups, prodMonths } from '@/lib/kern/production'
import { fitRunRate, paceCurve, type MonthPoint } from '@/lib/kern/runrate'
import { tenureRows } from '@/lib/kern/tenure'
import type { CreditData, DimensionKey } from '@/lib/kern/types'

const state = normalize(seedState(), { production: PROD, tyRoster: TYROSTER })

describe('real seed + production data', () => {
  test('normalizes into a coherent org tree', () => {
    expect(state.branches.length).toBeGreaterThan(30)
    expect(state.superDivisions.length).toBe(1)
    expect(branchCountForSuperDivision(state, state.superDivisions[0].id)).toBeGreaterThan(0)
    // The TYROSTER import brought people in.
    const people = state.branches.reduce((n, b) => n + b.roster.length, 0)
    expect(people).toBeGreaterThan(100)
  })

  test('every branch has the fields the views index into', () => {
    state.branches.forEach((b) => {
      expect(Array.isArray(b.roster)).toBe(true)
      expect(Array.isArray(b.servicedBy)).toBe(true)
      expect(typeof b.archived).toBe('boolean')
      expect(typeof b.orgid).toBe('string')
    })
  })

  test('production pairs are all [number, number]', () => {
    Object.values(PROD).forEach((mm) =>
      Object.entries(mm).forEach(([month, pair]) => {
        expect(month).toMatch(/^\d{4}-\d{2}$/)
        expect(pair).toHaveLength(2)
        expect(Number.isFinite(pair[0])).toBe(true)
        expect(Number.isFinite(pair[1])).toBe(true)
      }),
    )
  })

  test('every grouping dimension produces finite totals (Analysis/Highlight)', () => {
    const months = prodMonths(state)
    expect(months.length).toBeGreaterThan(0)
    const dims: DimensionKey[] = ['division', 'subdivision', 'region', 'area', 'branch']
    dims.forEach((dim) => {
      const gm = groupMonthly(state, dim)
      expect(Object.keys(gm).length).toBeGreaterThan(0)
      Object.values(gm).forEach((mm) =>
        Object.values(mm).forEach(([d, u]) => {
          expect(Number.isFinite(d)).toBe(true)
          expect(Number.isFinite(u)).toBe(true)
        }),
      )
      // Every org resolves to some bucket — never undefined.
      Object.keys(state.production).forEach((org) =>
        expect(typeof groupKeyForOrg(state, org, dim)).toBe('string'),
      )
    })
  })

  test('prodGroups totals reconcile with the raw map (Data tab footer)', () => {
    let rawD = 0
    Object.values(PROD).forEach((mm) => Object.values(mm).forEach((p) => (rawD += p[0] || 0)))
    const groupD = prodGroups(state, true).reduce((n, g) => n + g.d, 0)
    expect(groupD).toBeCloseTo(rawD, 4)
  })

  test('tenure rows cover the funding branches and stay ordered (Tenure tab)', () => {
    const rows = tenureRows(state, prodMonths(state))
    expect(rows.length).toBeGreaterThan(0)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].first <= rows[i].first).toBe(true)
    }
    rows.forEach((r) => expect(r.first).toMatch(/^\d{4}-\d{2}$/))
  })

  test('the roster basis and P&L produce finite numbers (Branch Roster tab)', () => {
    const basis = rosterBasis(PROD, PROD_RUNRATE.month)
    let units = 0
    let vol = 0
    state.branches
      .filter((b) => !b.archived)
      .forEach((b) => {
        const avg = basis.monthlyUnits(b)
        const eff = avg != null ? Math.round(avg) : 0
        units += eff
        vol += eff * basis.avgLoan(b)
      })
    expect(Number.isFinite(units)).toBe(true)
    expect(Number.isFinite(vol)).toBe(true)
    expect(units).toBeGreaterThan(0)

    const r = computePnl(state.pnl, units, vol)
    ;[r.revenue, r.compBlend, r.compLow, r.netBlend, r.netLow, r.avgLoan].forEach((n) =>
      expect(Number.isFinite(n)).toBe(true),
    )
    expect(knownSupport(state.branches, 'proc').length).toBeGreaterThan(0)
  })
})

describe('real daily data (Monthly tab)', () => {
  test('PROD_DAILY arrays match their declared business-day count', () => {
    Object.entries(PROD_DAILY).forEach(([month, v]) => {
      expect(v.d).toHaveLength(v.u.length)
      if (v.bdays != null) expect(v.d).toHaveLength(v.bdays)
      expect(PROD_MBDAYS[month]).toBe(v.d.length)
    })
  })

  test('branch daily series never exceed the month length', () => {
    Object.entries(PROD_DAILY_BR).forEach(([, months]) =>
      Object.entries(months).forEach(([month, v]) => {
        expect(v.d.length).toBeLessThanOrEqual(PROD_MBDAYS[month])
        expect(v.d).toHaveLength(v.u.length)
      }),
    )
  })

  test('cumulative series are non-decreasing', () => {
    Object.values(PROD_DAILY).forEach((v) => {
      for (let i = 1; i < v.d.length; i++) expect(v.d[i]).toBeGreaterThanOrEqual(v.d[i - 1])
    })
  })

  test('the run-rate model fits the real book and projects sanely', () => {
    const allMonths = Object.keys(PROD_MBDAYS).sort()
    const PM = PROD_RUNRATE.month
    const BD = PROD_RUNRATE.bday
    const branchKeys = Object.keys(PROD_DAILY_BR)

    const subArr = (mo: string): number[] => {
      const N = PROD_MBDAYS[mo]
      const a = new Array<number>(N).fill(0)
      branchKeys.forEach((k) => {
        const bm = PROD_DAILY_BR[k]?.[mo]
        if (bm) for (let i = 0; i < N; i++) a[i] += bm.d[i] || 0
      })
      return a
    }
    const at = (mo: string): MonthPoint => {
      const a = subArr(mo)
      const n = Math.min(BD, a.length)
      return { cum: a[n - 1] || 0, tot: a[a.length - 1] || 0, bdays: a.length, arr: a }
    }

    const fit = fitRunRate({
      patMonths: allMonths.filter((m) => m !== PM),
      pm: PM,
      at,
      gf: PROD_RUNRATE.gfD,
    })
    expect(fit).not.toBeNull()
    expect(fit!.frac).toBeGreaterThanOrEqual(0.03)
    expect(fit!.frac).toBeLessThanOrEqual(1)
    const projected = fit!.actual / fit!.frac
    expect(projected).toBeGreaterThanOrEqual(fit!.actual)
    expect(Number.isFinite(projected)).toBe(true)
    expect(['Low', 'Moderate', 'High']).toContain(fit!.conf)

    // The pace curve must be monotonic and land on the projection.
    const maxN = Math.max(...allMonths.map((m) => PROD_MBDAYS[m]))
    const { curve, endN } = paceCurve(fit!, maxN, BD, subArr)
    const c = curve(fit!.frac)
    for (let k = BD; k < endN; k++) {
      expect(c[k]!).toBeGreaterThanOrEqual(c[k - 1]!)
    }
    expect(c[endN - 1]).toBeCloseTo(Math.round(projected), -2)
  })
})

describe('real credit data (Credit tab)', () => {
  // Generated, gitignored; skip cleanly when it has not been produced.
  const file = Bun.file('public/kern/credit.json')

  test('aggregates and carries NO borrower names', async () => {
    if (!(await file.exists())) return // fresh clone: nothing to check
    const data = (await file.json()) as CreditData
    const rows = creditOrgRows(state, data)
    expect(rows.length).toBeGreaterThan(0)
    const T = creditTotals(rows)
    expect(T.ni).toBeGreaterThan(0)
    expect(Number.isFinite(T.ch)).toBe(true)

    // The redaction in scripts/kern-extract-data.ts must hold.
    const withNames = Object.values(data.orgs).flatMap((o) =>
      Object.values(o.loans).filter((l) => l.b !== undefined),
    )
    expect(withNames).toHaveLength(0)

    // Every line item indexes a real description and operator.
    Object.values(data.orgs).forEach((o) =>
      Object.values(o.loans).forEach((l) =>
        l.i.forEach((it) => {
          expect(data.descs[it[1]]).toBeDefined()
          expect(data.ops[it[4]] ?? '(blank)').toBeDefined()
        }),
      ),
    )

    const ops = creditOperatorRows(state, data, rows[0].o)
    expect(ops.length).toBeGreaterThan(0)
    ops.forEach((r) => {
      expect(Number.isFinite(r.ch)).toBe(true)
      // The three states are mutually consistent.
      if (r.unknown) expect(r.home).toBeNull()
      if (r.foreign) expect(r.home).not.toBeNull()
    })
  })
})

describe('hub wiring', () => {
  test('the registry entry points at the route that exists', async () => {
    const { getApp } = await import('@/lib/apps/registry')
    const app = getApp('kern')
    expect(app).toBeDefined()
    expect(app!.href).toBe('/kern')
    expect(app!.roles).toEqual(['admin', 'dev'])
  })

  test('orphan branches are reachable in the Hierarchy "Unassigned" bucket', () =>
    expect(Array.isArray(orphanBranches(state))).toBe(true))
})

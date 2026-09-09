import { describe, expect, test } from 'bun:test'

import {
  fmtCents,
  fmtShort,
  fmtUSD,
  divColor,
  monthsByQuarter,
  pctChange,
  quarterOf,
} from '@/lib/kern/format'
import {
  branchArea,
  branchCountForDivision,
  branchCountForSuperDivision,
  branchHasTag,
  branchParentValue,
  branchTagLabel,
  byId,
  orphanBranches,
  setBranchParent,
  statusPill,
  subdivisionsOf,
} from '@/lib/kern/org'
import type { Branch, OrgState } from '@/lib/kern/types'

const branch = (p: Partial<Branch>): Branch => ({
  id: 'b1',
  orgid: '100',
  name: 'B',
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
  ...p,
})

const state = (): OrgState => ({
  superDivisions: [{ id: 'sd1', name: 'Matrix', manager: 'Kern' }],
  divisions: [
    { id: 'd1', name: 'Matrix Red', manager: '', parentId: 'sd1' },
    { id: 'd2', name: 'Matrix Blue', manager: '', parentId: 'sd1' },
  ],
  regions: [{ id: 'r1', name: 'North', manager: '', divisionId: 'd1' }],
  areas: [{ id: 'a1', name: 'Area 1', manager: '', regionId: 'r1' }],
  branches: [
    branch({ id: 'b1', orgid: '100', name: 'Alpha', divisionId: 'd1' }),
    branch({ id: 'b2', orgid: '200', name: 'Beta', regionId: 'r1', divisionId: 'd1' }),
    branch({ id: 'b3', orgid: '300', name: 'Gamma', areaId: 'a1' }),
    branch({ id: 'b4', orgid: '400', name: 'Dead', divisionId: 'd2', archived: true }),
    branch({ id: 'b5', orgid: '500', name: 'Loose' }),
  ],
  titles: ['Processor'],
  production: {},
  prodExcluded: {},
  productMix: {},
  pnl: {
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
  },
})

describe('org tree', () => {
  const s = state()

  test('byId returns undefined for a null id', () => {
    expect(byId(s.divisions, null)).toBeUndefined()
    expect(byId(s.divisions, 'd1')?.name).toBe('Matrix Red')
  })

  test('counts ignore archived branches', () => {
    // b1 + b2 are live in d1; b4 is archived in d2.
    expect(branchCountForDivision(s, 'd1')).toBe(2)
    expect(branchCountForDivision(s, 'd2')).toBe(0)
  })

  test('a super-division sums its sub-divisions', () => {
    expect(subdivisionsOf(s, 'sd1').map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(branchCountForSuperDivision(s, 'sd1')).toBe(2)
  })

  test('branchTagLabel prefers the most specific tag', () => {
    expect(branchTagLabel(s, s.branches[2])).toBe('Area 1') // area wins
    expect(branchTagLabel(s, s.branches[1])).toBe('North') // then region
    expect(branchTagLabel(s, s.branches[0])).toBe('Matrix Red') // then division
    expect(branchTagLabel(s, s.branches[4])).toBe('')
  })

  test('branchHasTag / orphanBranches', () => {
    expect(branchHasTag(s.branches[0])).toBe(true)
    expect(branchHasTag(s.branches[4])).toBe(false)
    expect(orphanBranches(s).map((b) => b.id)).toEqual(['b5'])
  })

  test('branchArea resolves through areaId only', () => {
    expect(branchArea(s, s.branches[2])?.name).toBe('Area 1')
    expect(branchArea(s, s.branches[1])).toBeUndefined()
  })
})

describe('setBranchParent', () => {
  // The source deliberately leaves divisionId alone: area/region are mutually
  // exclusive, but the division tag is independent. K 258-262.
  test('area and region are mutually exclusive', () => {
    const b = branch({ regionId: 'r1' })
    setBranchParent(b, 'area:a1')
    expect(b.areaId).toBe('a1')
    expect(b.regionId).toBeNull()

    setBranchParent(b, 'region:r1')
    expect(b.regionId).toBe('r1')
    expect(b.areaId).toBeNull()
  })

  test('an empty value detaches both, and NEVER clears the division tag', () => {
    const b = branch({ areaId: 'a1', regionId: null, divisionId: 'd1' })
    setBranchParent(b, '')
    expect(b.areaId).toBeNull()
    expect(b.regionId).toBeNull()
    expect(b.divisionId).toBe('d1')
  })

  test('branchParentValue round-trips', () => {
    const b = branch({ areaId: 'a1' })
    expect(branchParentValue(b)).toBe('area:a1')
    setBranchParent(b, branchParentValue(branch({ regionId: 'r1' })))
    expect(b.regionId).toBe('r1')
    expect(branchParentValue(b)).toBe('region:r1')
    expect(branchParentValue(branch({}))).toBe('')
  })
})

describe('format', () => {
  test('fmtUSD rounds', () => expect(fmtUSD(1234.6)).toBe('$1,235'))
  test('fmtShort scales', () => {
    expect(fmtShort(4_726_698)).toBe('$4.7M')
    expect(fmtShort(2500)).toBe('$3K')
    expect(fmtShort(250)).toBe('$250')
    expect(fmtShort(Infinity)).toBe('$—')
  })
  test('fmtCents keeps the sign outside the dollar mark', () => {
    expect(fmtCents(150.9)).toBe('$150.90')
    expect(fmtCents(-75.45)).toBe('-$75.45')
  })
  test('divColor matches on name, with a neutral fallback', () => {
    expect(divColor('Matrix Red')).toBe('#ff3b52')
    expect(divColor('Matrix Blue')).toBe('#25e0ff')
    expect(divColor('Unassigned')).toBe('#8aa0b8')
    expect(divColor(undefined)).toBe('#8aa0b8')
  })
  test('pctChange is null with no prior period', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
    expect(pctChange(100, 0)).toBeNull()
  })
  test('quarters', () => {
    expect(quarterOf('2026-01')).toBe('2026-Q1')
    expect(quarterOf('2026-04')).toBe('2026-Q2')
    expect(quarterOf('2026-12')).toBe('2026-Q4')
    expect(monthsByQuarter(['2026-01', '2026-02', '2026-05'])).toEqual({
      '2026-Q1': ['2026-01', '2026-02'],
      '2026-Q2': ['2026-05'],
    })
  })
  test('statusPill', () => {
    expect(statusPill('Active')).toEqual({ cls: 'pill active', label: 'Active' })
    expect(statusPill('')).toEqual({ cls: 'pill none', label: '—' })
  })
})

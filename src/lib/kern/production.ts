// Production rollups shared by the Data, Analysis, Monthly and Highlight tabs.
// K 806–843.
//
// Every function here takes the state explicitly — the source read a module
// global. `OTHER` is the synthetic bucket for production that belongs to no
// known branch; it is included/excluded like any other org.

import { byId } from '@/lib/kern/org'
import type { DimensionKey, OrgState, ProductionPair, MetricKey } from '@/lib/kern/types'

/** K 806 — the display name for a production org id. */
export function prodName(s: OrgState, org: string): string {
  if (org === 'OTHER') return 'Other'
  const b = s.branches.find((x) => String(x.orgid) === String(org))
  return b ? b.name : `ORG ${org}`
}

/** K 807 — every month present in any branch's series, ascending. */
export function prodMonths(s: OrgState): string[] {
  const out = new Set<string>()
  Object.values(s.production).forEach((mm) => Object.keys(mm).forEach((m) => out.add(m)))
  return [...out].sort()
}

/** K 808 — excluded orgs drop out of every rollup but stay editable. */
export const isIncluded = (s: OrgState, org: string): boolean =>
  !(s.prodExcluded && s.prodExcluded[org])

export interface ProdGroup {
  org: string
  name: string
  d: number
  u: number
}

/** K 809–813 — per-org lifetime totals, biggest dollars first. */
export function prodGroups(s: OrgState, all: boolean): ProdGroup[] {
  return Object.keys(s.production)
    .filter((org) => all || isIncluded(s, org))
    .map((org) => {
      const mm = s.production[org]
      let d = 0
      let u = 0
      Object.values(mm).forEach((v) => {
        d += v[0] || 0
        u += v[1] || 0
      })
      return { org, name: prodName(s, org), d, u }
    })
    .sort((a, b) => b.d - a.d)
}

/** K 814–819 */
export function divisionForOrg(s: OrgState, org: string): string {
  if (org === 'OTHER') return 'Unassigned'
  const b = s.branches.find((x) => String(x.orgid) === String(org))
  if (b && b.divisionId) {
    const d = byId(s.divisions, b.divisionId)
    if (d) return d.name
  }
  return 'Unassigned'
}

/**
 * K 820–834 — which bucket an org falls into at a given grouping level.
 *
 * Note the `division` case: it resolves to the SUPER-division, and when there
 * is exactly one super-division everything untagged merges into it rather than
 * splitting off an "Unassigned" slice. That is deliberate in the source — at
 * the coarsest level the answer should be "the whole company".
 */
export function groupKeyForOrg(s: OrgState, org: string, dim: DimensionKey): string {
  if (dim === 'branch') return prodName(s, org)

  const b = org === 'OTHER' ? null : s.branches.find((x) => String(x.orgid) === String(org))

  if (dim === 'division') {
    const sub = b && b.divisionId ? byId(s.divisions, b.divisionId) : undefined
    const sup = sub && sub.parentId ? byId(s.superDivisions, sub.parentId) : undefined
    if (sup) return sup.name
    return s.superDivisions.length === 1 ? s.superDivisions[0].name : 'Unassigned'
  }

  if (!b) return 'Unassigned'

  let ent
  if (dim === 'subdivision') ent = b.divisionId ? byId(s.divisions, b.divisionId) : undefined
  else if (dim === 'region') ent = b.regionId ? byId(s.regions, b.regionId) : undefined
  else if (dim === 'area') ent = b.areaId ? byId(s.areas, b.areaId) : undefined
  return ent ? ent.name : 'Unassigned'
}

/** groupName -> month -> [dollars, units]. Included orgs only. K 835–842 */
export type MonthlyByGroup = Record<string, Record<string, ProductionPair>>

export function groupMonthly(s: OrgState, dim: DimensionKey): MonthlyByGroup {
  const out: MonthlyByGroup = {}
  Object.keys(s.production)
    .filter((org) => isIncluded(s, org))
    .forEach((org) => {
      const key = groupKeyForOrg(s, org, dim)
      const mm = s.production[org]
      out[key] ||= {}
      Object.keys(mm).forEach((m) => {
        out[key][m] ||= [0, 0]
        out[key][m][0] += mm[m][0] || 0
        out[key][m][1] += mm[m][1] || 0
      })
    })
  return out
}

/** The index into a ProductionPair for a metric. */
export const metricIndex = (m: MetricKey): 0 | 1 => (m === 'dollars' ? 0 : 1)

/** Sum one group's months for a metric. */
export function sumMonths(
  byMonth: Record<string, ProductionPair> | undefined,
  months: string[],
  mi: 0 | 1,
): number {
  if (!byMonth) return 0
  return months.reduce((n, m) => n + (byMonth[m]?.[mi] || 0), 0)
}

/**
 * The company-wide total for one month across included orgs — the Data tab's
 * footer and the Monthly tab's basis.
 */
export function totalForMonth(s: OrgState, month: string, mi: 0 | 1): number {
  return Object.keys(s.production)
    .filter((org) => isIncluded(s, org))
    .reduce((n, org) => n + (s.production[org][month]?.[mi] || 0), 0)
}

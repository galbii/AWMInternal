// Org-tree lookups and counts. K 122–135.
//
// Every count here ignores archived branches, matching the source: an archived
// branch keeps its tags but stops contributing to any total.

import type { Area, Branch, Division, OrgState, Region, SuperDivision } from '@/lib/kern/types'

/** K 122 */
export function byId<T extends { id: string }>(arr: T[], id: string | null): T | undefined {
  if (!id) return undefined
  return arr.find((x) => x.id === id)
}

export const branchArea = (s: OrgState, b: Branch): Area | undefined =>
  b.areaId ? byId(s.areas, b.areaId) : undefined
export const branchRegion = (s: OrgState, b: Branch): Region | undefined =>
  b.regionId ? byId(s.regions, b.regionId) : undefined
export const branchDivision = (s: OrgState, b: Branch): Division | undefined =>
  b.divisionId ? byId(s.divisions, b.divisionId) : undefined

/** K 127 — tagged at any level at all. */
export const branchHasTag = (b: Branch): boolean =>
  Boolean(b.areaId || b.regionId || b.divisionId)

/** K 128 — the most specific tag's name, or ''. */
export function branchTagLabel(s: OrgState, b: Branch): string {
  const a = branchArea(s, b)
  if (a) return a.name
  const r = branchRegion(s, b)
  if (r) return r.name
  const d = branchDivision(s, b)
  return d ? d.name : ''
}

/** K 129 */
export function divisionOfRegion(s: OrgState, rid: string | null): string | null {
  const r = byId(s.regions, rid)
  return r ? r.divisionId : null
}

const live = (s: OrgState): Branch[] => s.branches.filter((b) => !b.archived)

/** K 130–132 */
export const branchCountForArea = (s: OrgState, aid: string): number =>
  live(s).filter((b) => b.areaId === aid).length
export const branchCountForRegion = (s: OrgState, rid: string): number =>
  live(s).filter((b) => b.regionId === rid).length
export const branchCountForDivision = (s: OrgState, did: string): number =>
  live(s).filter((b) => b.divisionId === did).length

/** K 133 */
export const subdivisionsOf = (s: OrgState, sid: string): Division[] =>
  s.divisions.filter((d) => d.parentId === sid)

/** K 134 — a super-division's count is the sum of its sub-divisions'. */
export const branchCountForSuperDivision = (s: OrgState, sid: string): number =>
  subdivisionsOf(s, sid).reduce((n, d) => n + branchCountForDivision(s, d.id), 0)

/** K 135 */
export function superOfSub(s: OrgState, subId: string): SuperDivision | undefined {
  const d = byId(s.divisions, subId)
  return d && d.parentId ? byId(s.superDivisions, d.parentId) : undefined
}

/**
 * K 258–262 — a branch is tagged at exactly ONE level. Setting a parent clears
 * the other two, so a branch can never be double-counted.
 */
export function setBranchParent(b: Branch, kind: 'area' | 'region' | 'division', id: string | null): void {
  b.areaId = null
  b.regionId = null
  b.divisionId = null
  if (!id) return
  if (kind === 'area') b.areaId = id
  else if (kind === 'region') b.regionId = id
  else b.divisionId = id
}

/** Divisions with no live super-division parent — rendered at the top level. */
export const orphanDivisions = (s: OrgState): Division[] =>
  s.divisions.filter((d) => !d.parentId || !byId(s.superDivisions, d.parentId))

/** K 1841–1843 — the "Unassigned" bucket. */
export const orphanRegions = (s: OrgState): Region[] => s.regions.filter((r) => !r.divisionId)
export const orphanBranches = (s: OrgState): Branch[] => live(s).filter((b) => !branchHasTag(b))

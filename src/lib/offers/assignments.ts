// Pure helpers for offer assignments — framework-free, unit-tested.
//
// An offer's `assignments` array (src/collections/OfferRequests) is REPLACED
// wholesale on every write, and the beforeChange hook keeps assignedAt /
// assignedBy for rows whose user survives. So an "add Alex" or "remove Sam"
// edit must be applied against the current rows, keeping every other row
// (and its role) exactly as it was. That merge lives here so the route
// handler and the client's optimistic update agree byte for byte.

export const ASSIGN_ROLES = ['recruiter', 'hiring-manager', 'hr', 'approver', 'observer'] as const
export type AssignRole = (typeof ASSIGN_ROLES)[number]

export const isAssignRole = (v: unknown): v is AssignRole =>
  typeof v === 'string' && (ASSIGN_ROLES as readonly string[]).includes(v)

export interface AssignmentEdit {
  /** User ids to add (no role); ids already present are left untouched. */
  add?: string[]
  /** User ids to drop. */
  remove?: string[]
}

/**
 * Apply an add/remove edit to a list of assignment rows keyed by `user`.
 * Existing rows keep their position and every other field; removals win over
 * additions of the same id; new rows are appended in `add` order, de-duplicated.
 */
export function applyAssignmentEdit<T extends { user: string }>(
  current: readonly T[],
  edit: AssignmentEdit,
  make: (userId: string) => T,
): T[] {
  const remove = new Set((edit.remove ?? []).filter(Boolean))
  const kept = current.filter((r) => !remove.has(r.user))
  const have = new Set(kept.map((r) => r.user))
  const out = [...kept]
  for (const id of edit.add ?? []) {
    if (!id || have.has(id) || remove.has(id)) continue
    have.add(id)
    out.push(make(id))
  }
  return out
}

/** True when both lists name the same users in the same order. */
export function sameAssignees(
  a: readonly { user: string }[],
  b: readonly { user: string }[],
): boolean {
  return a.length === b.length && a.every((r, i) => r.user === b[i]!.user)
}

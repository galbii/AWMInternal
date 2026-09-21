// Pure helpers for editing a user's `apps` list. Every write path — the
// in-app Users view (/api/app-members), the directory (/api/directory) and the
// profile (/api/profile) — goes through `withApps`, so the stored array is
// always de-duplicated, in registry order, and free of ids that are not
// membership apps.

import { membershipApps } from './registry'

/**
 * `current` plus `add` minus `remove`, restricted to the valid membership app
 * ids and returned in registry order. `valid` defaults to the registry; tests
 * pass their own.
 */
export function withApps(
  current: readonly string[],
  add: readonly string[] = [],
  remove: readonly string[] = [],
  valid: readonly string[] = membershipApps().map((a) => a.id),
): string[] {
  const drop = new Set(remove)
  const want = new Set<string>()
  for (const id of current) if (!drop.has(id)) want.add(id)
  for (const id of add) if (!drop.has(id)) want.add(id)
  return valid.filter((id) => want.has(id))
}

// The activity feed's contract: one event shape for the per-offer rail on
// /offers/[id] and the cross-offer feed on the Analysis view, plus the filter
// vocabulary both use. Pure and import-safe on both sides (types only from
// payload-types); the routes map documents through `toActivityEvent` so the
// two feeds can never drift apart.

import type { OfferEvent, User } from '@/payload-types'

export interface ActivityChange {
  field: string
  label: string
  from: string
  to: string
}

export interface ActivityEvent {
  id: string
  offerId: string
  offerTitle: string
  kind: string
  summary: string
  changes: ActivityChange[]
  targetLabel: string
  targetRole: string
  editCount: number
  actorLabel: string
  at: string
}

export const KIND_LABEL: Record<string, string> = {
  created: 'Created',
  'field-edit': 'Edited',
  'stage-change': 'Stage',
  'letter-updated': 'Letter',
  'email-sent': 'Emailed',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  'assignment-role-change': 'Role',
  deleted: 'Deleted',
}

export type ActivityFilter = 'all' | 'edits' | 'stage' | 'people' | 'letter'

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'edits', label: 'Edits' },
  { id: 'stage', label: 'Stage moves' },
  { id: 'people', label: 'Assignments' },
  { id: 'letter', label: 'Letters' },
]

const FILTER_KINDS: Record<Exclude<ActivityFilter, 'all'>, string[]> = {
  edits: ['created', 'field-edit', 'deleted'],
  stage: ['stage-change'],
  people: ['assigned', 'unassigned', 'assignment-role-change'],
  letter: ['letter-updated', 'email-sent'],
}

/** The event kinds a filter admits; null for "everything" (no where clause). */
export function kindsForFilter(f: ActivityFilter): string[] | null {
  return f === 'all' ? null : FILTER_KINDS[f]
}

export function matchesActivityFilter(kind: string, f: ActivityFilter): boolean {
  const kinds = kindsForFilter(f)
  return kinds === null || kinds.includes(kind)
}

export function isActivityFilter(v: unknown): v is ActivityFilter {
  return typeof v === 'string' && ACTIVITY_FILTERS.some((f) => f.id === v)
}

const label = (u: unknown): string => {
  if (!u || typeof u !== 'object') return ''
  const user = u as Partial<User>
  return user.name || user.email || String(user.id ?? '')
}

/** An `offer-events` document (depth 1) as the feeds show it. */
export function toActivityEvent(e: OfferEvent): ActivityEvent {
  return {
    id: String(e.id),
    offerId: e.offerId,
    offerTitle: e.offerTitle || '',
    kind: e.kind,
    summary: e.summary || '',
    changes: (e.changes ?? []).map((c) => ({
      field: c.field,
      label: c.label || c.field,
      from: c.from || '',
      to: c.to || '',
    })),
    targetLabel: label(e.targetUser),
    targetRole: e.targetRole || '',
    editCount: e.editCount ?? 1,
    actorLabel: label(e.actor) || 'System',
    at: e.createdAt,
  }
}

// The activity feed contract shared by /api/offer-timeline (per offer) and
// /api/offer-activity (across offers): the document mapping and the filter
// vocabulary the Analysis view's chips use.

import { describe, expect, it } from 'bun:test'

import {
  ACTIVITY_FILTERS,
  isActivityFilter,
  kindsForFilter,
  matchesActivityFilter,
  toActivityEvent,
} from '@/lib/offers/activity'
import type { OfferEvent } from '@/payload-types'

describe('activity filters', () => {
  it('cover every event kind exactly once outside "all"', () => {
    const kinds = ACTIVITY_FILTERS.filter((f) => f.id !== 'all').flatMap(
      (f) => kindsForFilter(f.id) ?? [],
    )
    expect([...kinds].sort()).toEqual(
      [
        'assigned',
        'assignment-role-change',
        'created',
        'deleted',
        'email-sent',
        'field-edit',
        'letter-updated',
        'stage-change',
        'unassigned',
      ].sort(),
    )
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('"all" admits everything and needs no where clause', () => {
    expect(kindsForFilter('all')).toBeNull()
    expect(matchesActivityFilter('stage-change', 'all')).toBe(true)
    expect(matchesActivityFilter('anything-new', 'all')).toBe(true)
  })

  it('narrow filters admit only their kinds', () => {
    expect(matchesActivityFilter('stage-change', 'stage')).toBe(true)
    expect(matchesActivityFilter('field-edit', 'stage')).toBe(false)
    expect(matchesActivityFilter('assigned', 'people')).toBe(true)
    expect(matchesActivityFilter('letter-updated', 'letter')).toBe(true)
    expect(matchesActivityFilter('created', 'edits')).toBe(true)
  })

  it('rejects unknown filter ids from the query string', () => {
    expect(isActivityFilter('people')).toBe(true)
    expect(isActivityFilter('nope')).toBe(false)
    expect(isActivityFilter(null)).toBe(false)
  })
})

describe('toActivityEvent', () => {
  const base = {
    id: 'evt1',
    offerId: 'rabc123',
    offerTitle: 'Jane Doe',
    kind: 'field-edit' as const,
    summary: 'Edited 2 fields',
    changes: [
      { field: 'startDate', label: 'Expected Start Date', from: '2026-10-05', to: '2026-10-12' },
      { field: 'phone', from: null, to: '702' },
    ],
    targetUser: null,
    targetRole: null,
    editCount: 3,
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
  }

  it('resolves labels and fills every blank with an empty string', () => {
    const doc = { ...base, actor: { id: 'u1', name: 'Chance N', email: 'c@example.com' } }
    const out = toActivityEvent(doc as unknown as OfferEvent)
    expect(out).toEqual({
      id: 'evt1',
      offerId: 'rabc123',
      offerTitle: 'Jane Doe',
      kind: 'field-edit',
      summary: 'Edited 2 fields',
      changes: [
        { field: 'startDate', label: 'Expected Start Date', from: '2026-10-05', to: '2026-10-12' },
        { field: 'phone', label: 'phone', from: '', to: '702' },
      ],
      targetLabel: '',
      targetRole: '',
      editCount: 3,
      actorLabel: 'Chance N',
      at: '2026-09-21T10:00:00.000Z',
    })
  })

  it('names an actorless event "System" and an unpopulated actor by id', () => {
    expect(toActivityEvent({ ...base, actor: null } as unknown as OfferEvent).actorLabel).toBe(
      'System',
    )
    expect(toActivityEvent({ ...base, actor: 'u9' } as unknown as OfferEvent).actorLabel).toBe(
      'System',
    )
    expect(
      toActivityEvent({ ...base, actor: { id: 'u9' } } as unknown as OfferEvent).actorLabel,
    ).toBe('u9')
  })
})

// The form's on-screen grouping is a hand-written map, so it can drift from the
// schema. These tests are the guard: add a question to schema.ts without placing
// it in FORM_SECTIONS and the suite fails here rather than the field silently
// never rendering.

import { describe, expect, test } from 'bun:test'

import {
  FORM_SECTIONS,
  OVERRIDE_LINKS,
  fieldById,
  mappedFieldIds,
  navEntries,
  visibleFields,
} from '@/components/offers/form-sections'
import { FIELDS } from '@/lib/offers/schema'

describe('form section map', () => {
  test('places every visible field exactly once', () => {
    const mapped = mappedFieldIds()
    const visible = visibleFields().map((f) => f.id)

    const missing = visible.filter((id) => !mapped.includes(id))
    const extra = mapped.filter((id) => !visible.includes(id))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
    expect(mapped.length).toBe(new Set(mapped).size) // no duplicates
    expect(mapped.length).toBe(visible.length)
  })

  test('covers the 43 visible fields of the 68-field schema', () => {
    expect(FIELDS.length).toBe(68)
    expect(visibleFields().length).toBe(43)
    expect(mappedFieldIds().length).toBe(43)
  })

  test('every mapped id resolves to a real field', () => {
    mappedFieldIds().forEach((id) => {
      expect(fieldById(id)).toBeDefined()
    })
  })

  test('section and card ids are unique — they are DOM anchors', () => {
    const ids = navEntries().map((e) => e.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  test('every required field is reachable from the nav', () => {
    const counted = new Set(navEntries().flatMap((e) => e.fields))
    FIELDS.filter((f) => f.req).forEach((f) => {
      expect(counted.has(f.id)).toBe(true)
    })
  })

  test('override links point at real fields and real cards', () => {
    const cardIds = new Set(FORM_SECTIONS.flatMap((s) => (s.cards ?? []).map((c) => c.id)))
    OVERRIDE_LINKS.forEach((o) => {
      expect(fieldById(o.wordingId)).toBeDefined()
      expect(cardIds.has(o.targetCard)).toBe(true)
    })
  })

  test('the custom-wording card holds exactly the overriding fields', () => {
    const wording = FORM_SECTIONS.flatMap((s) => s.cards ?? []).find(
      (c) => c.id === 'pay-wording',
    )
    expect(wording).toBeDefined()
    expect([...(wording?.fields ?? [])].sort()).toEqual(
      OVERRIDE_LINKS.map((o) => o.wordingId).sort(),
    )
  })
})

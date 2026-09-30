// The view-as picker's "recent people" list. Ordering is pure and pinned here;
// the storage round trip is checked against a stub, because the helpers must
// stay import-safe on the server (every app's chrome imports the picker).

import { afterEach, describe, expect, test } from 'bun:test'

import {
  VIEW_AS_RECENT_KEY,
  VIEW_AS_RECENT_MAX,
  nextRecent,
  readViewAsRecent,
  rememberViewAs,
} from '@/lib/users/view-as-recent'

/** A minimal Storage that can be told to throw, like a blocked private window. */
function stubStorage(seed?: string, throws = false) {
  const store = new Map<string, string>()
  if (seed !== undefined) store.set(VIEW_AS_RECENT_KEY, seed)
  const localStorage = {
    getItem(k: string) {
      if (throws) throw new Error('blocked')
      return store.get(k) ?? null
    },
    setItem(k: string, v: string) {
      if (throws) throw new Error('blocked')
      store.set(k, v)
    },
  }
  ;(globalThis as { window?: unknown }).window = { localStorage }
  return store
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('nextRecent', () => {
  test('puts the newest first', () => {
    expect(nextRecent(['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  test('moves a repeat to the front instead of duplicating it', () => {
    expect(nextRecent(['b', 'c', 'a'], 'a')).toEqual(['a', 'b', 'c'])
    expect(nextRecent(['a'], 'a')).toEqual(['a'])
  })

  test('caps the list, dropping the oldest', () => {
    const full = ['1', '2', '3', '4']
    expect(full).toHaveLength(VIEW_AS_RECENT_MAX)
    expect(nextRecent(full, '5')).toEqual(['5', '1', '2', '3'])
  })
})

describe('readViewAsRecent', () => {
  test('is empty on the server — no window, no throw', () => {
    expect(readViewAsRecent()).toEqual([])
  })

  test('reads the stored ids back', () => {
    stubStorage(JSON.stringify(['a', 'b']))
    expect(readViewAsRecent()).toEqual(['a', 'b'])
  })

  test('survives junk: absent, unparseable, wrong shape, non-strings', () => {
    stubStorage()
    expect(readViewAsRecent()).toEqual([])
    stubStorage('not json')
    expect(readViewAsRecent()).toEqual([])
    stubStorage('{"a":1}')
    expect(readViewAsRecent()).toEqual([])
    stubStorage(JSON.stringify(['a', 7, null, 'b']))
    expect(readViewAsRecent()).toEqual(['a', 'b'])
  })

  test('caps what it reads, so an old oversized list cannot grow the menu', () => {
    stubStorage(JSON.stringify(['1', '2', '3', '4', '5', '6']))
    expect(readViewAsRecent()).toHaveLength(VIEW_AS_RECENT_MAX)
  })

  test('a storage that throws just means no recents', () => {
    stubStorage(JSON.stringify(['a']), true)
    expect(readViewAsRecent()).toEqual([])
  })
})

describe('rememberViewAs', () => {
  test('writes the new list through nextRecent', () => {
    const store = stubStorage(JSON.stringify(['b', 'c']))
    rememberViewAs('a')
    expect(JSON.parse(store.get(VIEW_AS_RECENT_KEY) as string)).toEqual(['a', 'b', 'c'])
  })

  test('never throws — on the server, or when storage is blocked', () => {
    expect(() => rememberViewAs('a')).not.toThrow()
    stubStorage(undefined, true)
    expect(() => rememberViewAs('a')).not.toThrow()
  })
})

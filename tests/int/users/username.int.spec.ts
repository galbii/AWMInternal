import { describe, expect, test } from 'bun:test'

import {
  deriveUsername,
  slugifyUsername,
  uniqueUsername,
  USERNAME_MAX,
  USERNAME_MIN,
  validateUsername,
} from '@/lib/users/username'

describe('slugifyUsername', () => {
  test('lowercases and trims', () => {
    expect(slugifyUsername('  JSmith  ')).toBe('jsmith')
  })

  test('turns spaces and punctuation into a single separator', () => {
    expect(slugifyUsername('Jane   Q. Smith')).toBe('jane.q.smith')
  })

  test('strips accents rather than dropping the letter', () => {
    expect(slugifyUsername('José Núñez')).toBe('jose.nunez')
  })

  test('keeps interior dots, dashes and underscores', () => {
    expect(slugifyUsername('dev-smoke')).toBe('dev-smoke')
    expect(slugifyUsername('a_b.c-d')).toBe('a_b.c-d')
  })

  test('trims leading and trailing separators', () => {
    expect(slugifyUsername('...jane...')).toBe('jane')
    expect(slugifyUsername('-jane-')).toBe('jane')
  })

  test('never returns a value longer than the max, or one ending in a separator', () => {
    const out = slugifyUsername('a'.repeat(40))
    expect(out.length).toBe(USERNAME_MAX)

    // A slice that lands mid-separator must not leave one dangling.
    const awkward = slugifyUsername(`${'a'.repeat(USERNAME_MAX - 1)} tail`)
    expect(awkward.endsWith('.')).toBe(false)
  })

  test('unusable input collapses to empty rather than throwing', () => {
    expect(slugifyUsername('...')).toBe('')
    expect(slugifyUsername('')).toBe('')
  })
})

describe('validateUsername', () => {
  test('accepts ordinary handles', () => {
    for (const ok of ['jane', 'j.smith', 'dev-smoke', 'a1', 'user-smoke']) {
      expect(validateUsername(ok)).toBeNull()
    }
  })

  test('rejects empty and too-short', () => {
    expect(validateUsername('')).not.toBeNull()
    expect(validateUsername('a')).not.toBeNull()
    expect(validateUsername('ab')).toBeNull()
    expect(USERNAME_MIN).toBe(2)
  })

  test('rejects too-long', () => {
    expect(validateUsername('a'.repeat(USERNAME_MAX))).toBeNull()
    expect(validateUsername('a'.repeat(USERNAME_MAX + 1))).not.toBeNull()
  })

  test('rejects uppercase, spaces and stray characters', () => {
    expect(validateUsername('Jane')).not.toBeNull()
    expect(validateUsername('jane smith')).not.toBeNull()
    expect(validateUsername('jane@example.com')).not.toBeNull()
    expect(validateUsername('jane/../admin')).not.toBeNull()
  })

  test('rejects separators at the edges', () => {
    expect(validateUsername('.jane')).not.toBeNull()
    expect(validateUsername('jane.')).not.toBeNull()
    expect(validateUsername('-jane')).not.toBeNull()
  })

  test('rejects reserved handles that would collide with app concepts', () => {
    for (const reserved of ['me', 'admin', 'api', 'login', 'settings', 'offers', 'new']) {
      expect(validateUsername(reserved)).not.toBeNull()
    }
  })

  test('every slugified derivation of a real email passes validation', () => {
    for (const email of ['chance@orcaclub.pro', 'dev-smoke@example.com', 'j.q.public@x.io']) {
      const handle = deriveUsername(email, null)
      expect(validateUsername(handle)).toBeNull()
    }
  })
})

describe('deriveUsername', () => {
  test('prefers the email local part', () => {
    expect(deriveUsername('jsmith@example.com', 'Jane Smith')).toBe('jsmith')
  })

  test('falls back to the name when the local part is unusable', () => {
    expect(deriveUsername('a@example.com', 'Jane Smith')).toBe('jane.smith')
  })

  test('skips a reserved local part rather than producing an invalid handle', () => {
    expect(deriveUsername('admin@example.com', 'Dana Ops')).toBe('dana.ops')
  })

  test('always returns something valid, even with nothing to work from', () => {
    const handle = deriveUsername(null, null)
    expect(validateUsername(handle)).toBeNull()
  })
})

describe('uniqueUsername', () => {
  test('returns the base when it is free', async () => {
    expect(await uniqueUsername('jane', async () => false)).toBe('jane')
  })

  test('suffixes until it finds a free handle', async () => {
    const taken = new Set(['jane', 'jane-2', 'jane-3'])
    expect(await uniqueUsername('jane', async (c) => taken.has(c))).toBe('jane-4')
  })

  test('gives up on an endless collision rather than looping forever', async () => {
    const handle = await uniqueUsername('jane', async () => true)
    expect(handle.startsWith('jane-')).toBe(true)
    expect(validateUsername(handle)).toBeNull()
  })

  test('a suffixed handle still fits inside the length limit', async () => {
    const base = 'a'.repeat(USERNAME_MAX)
    const handle = await uniqueUsername(base, async (c) => c === base)
    expect(handle.length).toBeLessThanOrEqual(USERNAME_MAX)
    expect(validateUsername(handle)).toBeNull()
  })
})

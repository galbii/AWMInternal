// Pins the theme cookie contract (src/lib/theme.ts): every root layout and
// the SettingsModal depend on these exact fallbacks — a bad cookie must mean
// 'system' (no data-theme attribute), never a crash or a stuck theme.

import { describe, expect, it } from 'bun:test'

import { parseTheme, themeDomAttr, THEME_COOKIE } from '@/lib/theme'

describe('parseTheme', () => {
  it('accepts the two explicit themes', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })

  it('treats everything else as system', () => {
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme(undefined)).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('DARK')).toBe('system')
    expect(parseTheme(42)).toBe('system')
  })
})

describe('themeDomAttr', () => {
  it('stamps explicit themes and omits for system', () => {
    expect(themeDomAttr('light')).toBe('light')
    expect(themeDomAttr('dark')).toBe('dark')
    expect(themeDomAttr('system')).toBeUndefined()
  })
})

it('cookie name is frozen — browsers hold it for a year', () => {
  expect(THEME_COOKIE).toBe('awm-theme')
})

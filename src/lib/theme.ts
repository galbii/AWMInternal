// Dashboard theme (light / dark / system) — shared by every app's root layout
// and by the shell's SettingsModal. The preference lives in a plain cookie so
// the server can stamp `data-theme` on <html> before first paint (no flash of
// the wrong theme, no inline script).
//
// Contract:
//   'light' | 'dark'  → data-theme="light" / "dark" on <html>
//   'system'          → NO data-theme attribute; CSS `prefers-color-scheme`
//                       media queries decide (see shell.css / hub.css)
//
// Import-safe on server and client: no next/headers, no document access here.
// Root layouts read the cookie via cookies(); SettingsModal writes it via
// document.cookie. Keep the name stable — it is effectively a public API to
// every signed-in browser.

export type Theme = 'light' | 'dark' | 'system'

export const THEME_COOKIE = 'awm-theme'

/** One year — the preference should outlive the session cookie. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * The value for <html data-theme=…>. `undefined` (system) makes React omit
 * the attribute entirely, which is what lets the media query take over.
 */
export function themeDomAttr(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme
}

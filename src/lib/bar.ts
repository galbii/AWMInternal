// The session bar's minimized state — a plain cookie, like the theme, so the
// server can render the bar folded before first paint (no layout jump for
// someone who keeps it tucked away). AppShell reads it via cookies();
// SessionBar writes it via document.cookie. Import-safe on both sides.

export type BarPref = 'full' | 'min'

export const BAR_COOKIE = 'awm-bar'

/** One year — it is a preference, not a session. */
export const BAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseBarPref(value: unknown): BarPref {
  return value === 'min' ? 'min' : 'full'
}

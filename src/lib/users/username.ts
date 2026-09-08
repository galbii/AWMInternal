// Profile handles — the `/u/<username>` URL segment.
//
// Rules, deliberately narrow: lowercase letters, digits, and single interior
// dots/dashes/underscores. Narrow because a handle ends up in a URL, in link
// text, and next to a person's name, and because loosening a format later is
// painless while tightening it breaks every existing link.

export const USERNAME_MIN = 2
export const USERNAME_MAX = 30

/** Lowercase alnum start/end, with . _ - allowed only in between. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/

/**
 * Handles the app itself needs, or that would read as an instruction rather
 * than a person. `me` is reserved because /u/me resolves to "your own profile".
 */
const RESERVED = new Set([
  'me',
  'new',
  'edit',
  'admin',
  'administrator',
  'api',
  'login',
  'logout',
  'signin',
  'signup',
  'settings',
  'profile',
  'profiles',
  'user',
  'users',
  'u',
  'hub',
  'apps',
  'app',
  'offers',
  'system',
  'support',
  'help',
  'root',
  'null',
  'undefined',
  'awm',
  'allwestern',
])

/** Normalize any input to the closest legal handle. May return ''. */
export function slugifyUsername(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents left by NFKD
    .replace(/[^a-z0-9._-]+/g, '.') // everything else becomes a separator
    .replace(/[._-]{2,}/g, '.') // collapse runs
    .replace(/^[._-]+|[._-]+$/g, '') // trim separators
    .slice(0, USERNAME_MAX)
    .replace(/[._-]+$/g, '') // slice may have left a trailing separator
}

/**
 * null when valid, otherwise a message written for the person typing it.
 * Callers must run this on every write — the field format is not enforced by
 * the database.
 */
export function validateUsername(value: string): string | null {
  if (!value) return 'Pick a username.'
  if (value.length < USERNAME_MIN) return `Usernames need at least ${USERNAME_MIN} characters.`
  if (value.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters.`
  if (value !== value.toLowerCase()) return 'Usernames are lowercase.'
  if (!USERNAME_RE.test(value)) {
    return 'Use letters and numbers, with dots, dashes or underscores in between.'
  }
  if (RESERVED.has(value)) return 'That username is reserved. Try another.'
  return null
}

/** The starting point for a new account: the email local part, else the name. */
export function deriveUsername(email?: string | null, name?: string | null): string {
  const fromEmail = email ? slugifyUsername(email.split('@')[0] ?? '') : ''
  if (fromEmail.length >= USERNAME_MIN && !RESERVED.has(fromEmail)) return fromEmail

  const fromName = name ? slugifyUsername(name) : ''
  if (fromName.length >= USERNAME_MIN && !RESERVED.has(fromName)) return fromName

  // Both unusable (single-character local part, all-punctuation name, …).
  return `user${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Append -2, -3, … until `isTaken` says no. Bounded: after 50 tries fall back
 * to a random suffix rather than hammering the database.
 */
export async function uniqueUsername(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const stem = base.slice(0, USERNAME_MAX - 4)
  if (!(await isTaken(base))) return base
  for (let n = 2; n <= 50; n++) {
    const candidate = `${stem}-${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  return `${stem}-${Math.random().toString(36).slice(2, 6)}`
}

// THE PERSISTENCE SEAM.
//
// Phase 1 keeps the whole org document in localStorage under the source's own
// key, so a browser that already ran the standalone app keeps its data. When
// the Payload collection lands, THIS FILE is what changes — plus a new
// /api/kern-org route handler. Nothing else in src/lib/kern or
// src/components/kern knows where the document lives.
//
// Three deliberate properties:
//
//  - ASYNC from day one, even though localStorage is synchronous. The offers
//    app's storage was built sync and had to be retrofitted when Payload
//    arrived, which rippled through its provider. This costs nothing now.
//  - WHOLE DOCUMENT in, whole document out. Kern's state is one document, not
//    a list of records, so there is no diffing counterpart to persistRecords.
//    That keeps the eventual collection design (single doc vs. doc-per-branch)
//    an open question.
//  - SERVER-SAFE. Every function returns a safe default when there is no
//    window, so any module may import this during SSR/build.
//
// K 42–47 (load), 110 (saveLocal), 162–179 (downloadJSON / loadFromFile).

import { normalize, seedState } from '@/lib/kern/normalize'
import type { OrgState } from '@/lib/kern/types'

/** K 237 — frozen: the standalone app's own key. */
export const LS_KEY = 'kernOrgApp.v3'

const isBrowser = (): boolean => typeof window !== 'undefined'

/**
 * The datasets normalize() needs. Loaded on demand so the ~90 KB of production
 * numbers and the roster stay out of the initial bundle.
 */
async function migrationDeps() {
  const [{ PROD }, { TYROSTER }] = await Promise.all([
    import('@/lib/kern/data/production'),
    import('@/lib/kern/data/roster'),
  ])
  return { production: PROD, tyRoster: TYROSTER }
}

/** Build the starting document from the bundled seed. K 47 */
export async function freshState(): Promise<OrgState> {
  return normalize(seedState(), await migrationDeps())
}

/**
 * Read the stored document, falling back to the seed. Always returns a
 * normalized document — an import from an older copy of the app arrives here
 * missing fields that normalize() fills in.
 */
export async function loadState(): Promise<OrgState> {
  if (!isBrowser()) return freshState()
  const deps = await migrationDeps()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<OrgState>
      // K 45 — `d.branches` is the source's "is this a real document" probe.
      if (d && d.branches) return normalize(d, deps)
    }
  } catch {
    /* unparseable or blocked — fall through to the seed, as the source does */
  }
  return normalize(seedState(), deps)
}

/** K 110 — persist the whole document. Resolves false when the write failed. */
export async function persistState(s: OrgState): Promise<boolean> {
  if (!isBrowser()) return false
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
    return true
  } catch {
    // Quota or private mode. The caller surfaces this; the source swallowed it.
    return false
  }
}

/** K 162–166 — download the document as JSON. */
export function exportJson(s: OrgState, filename = 'kern-org.json'): void {
  if (!isBrowser()) return
  const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * K 167–179 — read a JSON export back in. THE migration path off the standalone
 * app: its localStorage lives on a different origin and cannot be read here.
 * Throws when the file is not a recognisable org document.
 */
export async function importJson(file: File): Promise<OrgState> {
  const parsed = JSON.parse(await file.text()) as Partial<OrgState>
  if (!parsed || !Array.isArray(parsed.branches)) {
    throw new Error('That file does not look like a Kern Org export.')
  }
  return normalize(parsed, await migrationDeps())
}

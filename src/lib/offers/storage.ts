// The persistence seam. Records live in Payload (`offer-requests`) behind
// /api/offer-records; everything else here (email pref, intake dedup set,
// same-browser intake inbox) stays in localStorage on purpose:
//  - email pref is read inside synchronous click handlers right before
//    window.open — an await there gets the popup blocked;
//  - the inbox is a same-origin handoff written by the external intake page.
// Every function is a no-op returning an empty default on the server, so any
// module may import this file during SSR/build.
// S2 102–121 (records), S3 509–510 (email pref), S3 763–765 + 771 (intake sync).
//
// persistRecords keeps the whole-array call signature the provider depends on,
// but ships a minimal diff: a module-level snapshot remembers what THIS client
// last persisted (content JSON + list position per id) and only the changed
// records, position moves, and this-client removals go over the wire. Diffing
// against our own snapshot — never against the server list — means a delete
// can only ever mean "this client removed it", so two users can't clobber each
// other's new records. Writes are serialized through a queue so overlapping
// autosaves cannot reorder; a failed write does NOT advance the snapshot, so
// the next save retries the same diff.

import type { EmailClientPref, IntakeSubmission, OfferRecord } from '@/lib/offers/types'

// S2 102–103 — the legacy localStorage keys. LS_KEY is now read only once, to
// migrate a browser's pre-server data up to Payload on first load.
export const LS_KEY = 'onhr_records_v121'
export const LS_DRAFT = 'onhr_draft_v121'
/** Set after the one-time localStorage -> server migration has succeeded. */
export const MIGRATED_KEY = 'onhr_migrated_srv_v1'
// S3 509
export const LS_EMAIL_CLIENT = 'onhr_email_client'
// S3 763
export const IMPORTED_KEY = 'onhr_imported_sids'
// S3 771
export const INBOX_KEY = 'onhr_inbox'

const SYNC_URL = '/api/offer-records'

const isBrowser = (): boolean => typeof window !== 'undefined'

interface SnapEntry {
  json: string
  pos: number
}

interface UpsertEntry {
  rec: OfferRecord
  pos?: number
}

interface SyncBody {
  upsert: UpsertEntry[]
  reorder: { id: string; pos: number }[]
  remove: string[]
}

/** id -> content/position as last successfully persisted BY THIS CLIENT. */
let snapshot = new Map<string, SnapEntry>()
/** Serializes writes so two in-flight diffs can't reorder. */
let queue: Promise<boolean> = Promise.resolve(true)

async function syncPost(body: SyncBody): Promise<boolean> {
  try {
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

function readLegacyLocal(): OfferRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as OfferRecord[]) : []
  } catch {
    return []
  }
}

/** Fetch the record list from the server; seeds the diff snapshot. */
export async function loadRecords(): Promise<OfferRecord[]> {
  if (!isBrowser()) return []
  try {
    const res = await fetch(SYNC_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return []
    const { records } = (await res.json()) as { records: OfferRecord[] }
    const list = Array.isArray(records) ? records : []

    // One-time migration: this browser has pre-server data, the server has
    // nothing yet — push the local records up and keep working from them.
    if (!list.length && !localStorage.getItem(MIGRATED_KEY)) {
      const legacy = readLegacyLocal()
      if (legacy.length) {
        const ok = await syncPost({
          upsert: legacy.map((rec, i) => ({ rec, pos: i })),
          reorder: [],
          remove: [],
        })
        if (ok) {
          try {
            localStorage.setItem(MIGRATED_KEY, '1')
          } catch {
            /* quota — the unique ids make a re-push idempotent anyway */
          }
          snapshot = new Map(
            legacy.map((r, i) => [r.id, { json: JSON.stringify(r), pos: i }]),
          )
          return legacy
        }
      }
    }

    snapshot = new Map(list.map((r, i) => [r.id, { json: JSON.stringify(r), pos: i }]))
    return list
  } catch {
    return []
  }
}

function enqueuePersist(records: OfferRecord[], fullList: boolean): Promise<boolean> {
  if (!isBrowser()) return Promise.resolve(false)
  const run = async (): Promise<boolean> => {
    const entries = records.map((rec, i) => ({ rec, i, json: JSON.stringify(rec) }))
    const upsert: UpsertEntry[] = []
    const reorder: { id: string; pos: number }[] = []
    const nextIds = new Set<string>()

    for (const { rec, i, json } of entries) {
      nextIds.add(rec.id)
      const prev = snapshot.get(rec.id)
      if (!prev || prev.json !== json) {
        upsert.push(fullList ? { rec, pos: i } : { rec })
      } else if (fullList && prev.pos !== i) {
        reorder.push({ id: rec.id, pos: i })
      }
    }
    // Removals only in full-list mode: ids this client last persisted that are
    // gone from the array it now holds.
    const remove = fullList ? [...snapshot.keys()].filter((id) => !nextIds.has(id)) : []

    if (!upsert.length && !reorder.length && !remove.length) return true

    const ok = await syncPost({ upsert, reorder, remove })
    if (ok) {
      if (fullList) {
        snapshot = new Map(entries.map(({ rec, i, json }) => [rec.id, { json, pos: i }]))
      } else {
        for (const { rec, json } of entries) {
          const prev = snapshot.get(rec.id)
          snapshot.set(rec.id, { json, pos: prev ? prev.pos : -1 })
        }
      }
    }
    return ok
  }
  queue = queue.then(run, run)
  return queue
}

/**
 * Persist the FULL record list (the provider's single write path). Resolves
 * false when the server rejected or was unreachable — the caller toasts, the
 * snapshot stays put, and the next save retries the same diff.
 */
export function persistRecords(records: OfferRecord[]): Promise<boolean> {
  return enqueuePersist(records, true)
}

/**
 * Upsert-only persist for the standalone /offers/[id] page, which holds a
 * single record — it must never compute removals or positions from its
 * one-record view of the world.
 */
export function persistRecordsUpsertOnly(records: OfferRecord[]): Promise<boolean> {
  return enqueuePersist(records, false)
}

// S3 509
export function getEmailPref(): EmailClientPref {
  if (!isBrowser()) return 'desktop'
  try {
    return localStorage.getItem(LS_EMAIL_CLIENT) === 'web' ? 'web' : 'desktop'
  } catch {
    return 'desktop'
  }
}

// S3 510
export function setEmailPref(v: EmailClientPref): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(LS_EMAIL_CLIENT, v === 'web' ? 'web' : 'desktop')
  } catch {
    /* quota / private mode — ignore, as the source does */
  }
}

// S3 764
export function importedSids(): string[] {
  if (!isBrowser()) return []
  try {
    return JSON.parse(localStorage.getItem(IMPORTED_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

// S3 765
export function markImported(sid: string | undefined): void {
  if (!isBrowser()) return
  if (!sid) return
  try {
    let a = importedSids()
    if (a.indexOf(sid) < 0) {
      a.push(sid)
      if (a.length > 800) a = a.slice(-800)
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(a))
    }
  } catch {
    /* ignore */
  }
}

/**
 * S3 771 (pollInbox) — drains the same-browser intake inbox.
 * Reads `onhr_inbox`, clears it, and returns the submissions that carry data.
 */
export function readAndClearInbox(): IntakeSubmission[] {
  if (!isBrowser()) return []
  try {
    const inbox = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') as IntakeSubmission[]
    if (!Array.isArray(inbox) || !inbox.length) return []
    localStorage.setItem(INBOX_KEY, '[]')
    return inbox.filter((sub) => Boolean(sub && sub.data))
  } catch {
    return []
  }
}

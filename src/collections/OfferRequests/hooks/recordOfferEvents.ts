// afterChange/afterDelete: the audit trail. Writes offer-events rows describing
// WHO changed WHAT, with field-level diffs resolved to human labels from the
// app's own schema (src/lib/offers/schema.ts stays the single source of truth).
//
// Coalescing: the form autosaves on a 600ms debounce and letter options write
// per keystroke, so 'field-edit' and 'letter-updated' events merge into a
// rolling 10-minute window per (offer, actor, kind) — a typing burst lands as
// ONE event carrying the net diff (original `from`, latest `to`), never one
// event per keystroke. Assignment and stage events are always atomic.
//
// Event writes are best-effort: a failure is logged, never allowed to abort
// the user's save (they run inside the same transaction via `req`, so a THROWN
// error would roll the whole write back).

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { FIELDS } from '@/lib/offers/schema'
import type { OfferEvent } from '@/payload-types'

import { idOf } from './syncOfferMeta'

const WINDOW_MS = 10 * 60 * 1000
const VALUE_CAP = 400

const LABELS: Map<string, string> = new Map(FIELDS.map((f) => [f.id, f.label]))

const cap = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return s.length > VALUE_CAP ? s.slice(0, VALUE_CAP) + '…' : s
}

interface AssignmentRow {
  user?: unknown
  role?: string | null
  roleOther?: string | null
}

interface Change {
  field: string
  label?: string | null
  from?: string | null
  to?: string | null
}

/** What a hook may say about an event; offerId/offerTitle/actor are added centrally. */
interface EventInput {
  kind: OfferEvent['kind']
  summary?: string
  changes?: Change[]
  targetUser?: string
  targetRole?: string
  windowEndsAt?: string
  editCount?: number
}

const roleOf = (r: AssignmentRow): string => String(r.role || r.roleOther || '')

export const recordOfferEvents: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const { payload } = req
  const actorId = req.user ? String(req.user.id) : null
  const offerId = String(doc.id)
  const offerTitle = String(doc.employeeName || doc.id)

  const write = async (data: EventInput): Promise<void> => {
    await payload.create({
      collection: 'offer-events',
      data: { offerId, offerTitle, actor: actorId, ...data },
      req,
    })
  }

  /** Merge into an open rolling-window event of this kind, or create one. */
  const coalesce = async (
    kind: 'field-edit' | 'letter-updated',
    changes: Change[],
    summary: string,
  ): Promise<void> => {
    const windowEndsAt = new Date(Date.now() + WINDOW_MS).toISOString()
    if (actorId) {
      const open = await payload.find({
        collection: 'offer-events',
        limit: 1,
        sort: '-createdAt',
        where: {
          and: [
            { offerId: { equals: offerId } },
            { kind: { equals: kind } },
            { actor: { equals: actorId } },
            { windowEndsAt: { greater_than: new Date().toISOString() } },
          ],
        },
        req,
      })
      const existing = open.docs[0]
      if (existing) {
        // Last write wins per field, but keep the ORIGINAL `from`; a field
        // typed and then reverted drops out of the diff entirely.
        const merged = new Map<string, Change>(
          (existing.changes ?? []).map((c) => [c.field, c]),
        )
        for (const c of changes) {
          const prior = merged.get(c.field)
          merged.set(c.field, prior ? { ...c, from: prior.from } : c)
        }
        const net = [...merged.values()].filter((c) => (c.from ?? '') !== (c.to ?? ''))
        await payload.update({
          collection: 'offer-events',
          id: existing.id,
          data: {
            changes: net,
            editCount: (existing.editCount ?? 1) + 1,
            windowEndsAt,
            summary:
              kind === 'field-edit'
                ? `Edited ${net.length} field${net.length === 1 ? '' : 's'}`
                : summary,
          },
          req,
        })
        return
      }
    }
    await write({ kind, changes, summary, windowEndsAt, editCount: 1 })
  }

  try {
    if (operation === 'create') {
      await write({ kind: 'created', summary: `Created ${offerTitle}` })
      return doc
    }

    const prev = previousDoc ?? {}

    // 1. Assignments — atomic events, never coalesced.
    const beforeRows: AssignmentRow[] = Array.isArray(prev.assignments) ? prev.assignments : []
    const afterRows: AssignmentRow[] = Array.isArray(doc.assignments) ? doc.assignments : []
    const before = new Map(beforeRows.map((r) => [idOf(r.user), r]))
    const after = new Map(afterRows.map((r) => [idOf(r.user), r]))
    for (const [uid, row] of after) {
      if (!uid) continue
      const was = before.get(uid)
      if (!was) {
        await write({
          kind: 'assigned',
          targetUser: uid,
          targetRole: roleOf(row),
          summary: roleOf(row) ? `Assigned as ${roleOf(row)}` : 'Assigned',
        })
      } else if (roleOf(was) !== roleOf(row)) {
        await write({
          kind: 'assignment-role-change',
          targetUser: uid,
          targetRole: roleOf(row),
          changes: [{ field: 'role', from: roleOf(was), to: roleOf(row) }],
          summary: `Assignment role changed to ${roleOf(row) || '(none)'}`,
        })
      }
    }
    for (const [uid] of before) {
      if (uid && !after.has(uid)) {
        await write({ kind: 'unassigned', targetUser: uid, summary: 'Unassigned' })
      }
    }

    // 2. Stage — atomic. (`status` is derived from the form data; not audited.)
    const prevStage = prev.stage || 'pipeline'
    const nextStage = doc.stage || 'pipeline'
    if (prevStage !== nextStage) {
      await write({
        kind: 'stage-change',
        changes: [{ field: 'stage', from: String(prevStage), to: String(nextStage) }],
        summary: `Stage ${prevStage} → ${nextStage}`,
      })
    }

    // 3. Letter — coalesced. The letterHtml body itself is NEVER stored in an
    // event; only that it changed, and how.
    const prevHtml = prev.letterHtml ?? null
    const nextHtml = doc.letterHtml ?? null
    const letterChanged = JSON.stringify(prev.letter ?? null) !== JSON.stringify(doc.letter ?? null)
    if (prevHtml !== nextHtml || letterChanged) {
      const summary =
        nextHtml && nextHtml !== prevHtml
          ? `Letter edited by hand (${Math.round(String(nextHtml).length / 1024)} KB)`
          : letterChanged && !nextHtml
            ? 'Letter rebuilt from options'
            : 'Letter updated'
      await coalesce('letter-updated', [], summary)
    }

    // 4. The 68 form fields — diffed, labeled, coalesced.
    const a = (prev.data ?? {}) as Record<string, unknown>
    const b = (doc.data ?? {}) as Record<string, unknown>
    const changes: Change[] = []
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const from = cap(a[k] ?? '')
      const to = cap(b[k] ?? '')
      if (from !== to) changes.push({ field: k, label: LABELS.get(k), from, to })
    }
    if (changes.length) {
      await coalesce(
        'field-edit',
        changes,
        `Edited ${changes.length} field${changes.length === 1 ? '' : 's'}`,
      )
    }
  } catch (err) {
    payload.logger.error({ err, msg: `offer-events audit write failed for ${offerId}` })
  }

  return doc
}

export const recordOfferDeletion: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const { payload } = req
  try {
    await payload.create({
      collection: 'offer-events',
      data: {
        offerId: String(doc.id),
        offerTitle: String(doc.employeeName || doc.id),
        actor: req.user ? String(req.user.id) : null,
        kind: 'deleted',
        summary: `Deleted ${String(doc.employeeName || doc.id)}`,
      },
      req,
    })
  } catch (err) {
    payload.logger.error({ err, msg: `offer-events delete audit failed for ${String(doc.id)}` })
  }
}

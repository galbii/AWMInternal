// POST /api/apply — the public request form's only write. No session: the
// caller is a branch or hiring manager who is not a dashboard user. So this
// handler is deliberately narrow:
//
//  - only known form fields are accepted (src/lib/offers/schema.ts), values
//    are trimmed and capped, the body is size-limited;
//  - the same required fields HR's form enforces must be filled — a public
//    submission lands as a COMPLETE pipeline record at the top of the list;
//  - an optional shared code (APPLY_ACCESS_CODE) gates it, compared in
//    constant time; a honeypot field turns bots into a silent no-op;
//  - the create runs with overrideAccess (no user to evaluate) and carries the
//    submitter in `context.apply`, which the audit hook writes into the
//    "Created" event so HR can see who sent it.

import { timingSafeEqual } from 'node:crypto'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/lib/env'
import { toOfferDoc } from '@/lib/offers/payload-doc'
import { DATA_FIELDS, missingRequired, nowIso, uid } from '@/lib/offers/schema'
import type { OfferData, OfferRecord } from '@/lib/offers/types'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024
const MAX_VALUE_CHARS = 2000
const MAX_NAME_CHARS = 120
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD_IDS = new Set(DATA_FIELDS.map((f) => f.id))

function codeMatches(given: string, expected: string): boolean {
  const enc = new TextEncoder()
  const a = enc.encode(given)
  const b = enc.encode(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const bad = (msg: string, status = 400): Response => Response.json({ error: msg }, { status })

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return bad('Request too large', 413)

  let body: { data?: unknown; submitter?: unknown; code?: unknown; website?: unknown }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return bad('Bad request')
  }

  // Honeypot: a filled "website" means a bot. Say yes, store nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return Response.json({ id: 'r' + Date.now().toString(36) })
  }

  if (env.APPLY_ACCESS_CODE) {
    const given = typeof body.code === 'string' ? body.code.trim() : ''
    if (!given || !codeMatches(given, env.APPLY_ACCESS_CODE)) return bad('Wrong request code', 401)
  }

  const sub = (body.submitter ?? {}) as { name?: unknown; email?: unknown }
  const name = typeof sub.name === 'string' ? sub.name.trim().slice(0, MAX_NAME_CHARS) : ''
  const email = typeof sub.email === 'string' ? sub.email.trim().slice(0, MAX_NAME_CHARS) : ''
  if (!name || !EMAIL_RE.test(email)) return bad('Your name and a valid work email are required')

  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
    return bad('Bad request')
  const d: OfferData = {}
  DATA_FIELDS.forEach((f) => {
    d[f.id] = ''
  })
  for (const [k, v] of Object.entries(body.data as Record<string, unknown>)) {
    if (!FIELD_IDS.has(k) || typeof v !== 'string') continue
    d[k] = v.trim().slice(0, MAX_VALUE_CHARS)
  }
  const missing = missingRequired(d)
  if (missing.length) {
    return Response.json(
      { error: 'Required fields missing', missing: missing.map((f) => f.id) },
      { status: 400 },
    )
  }

  const now = nowIso()
  const rec: OfferRecord = {
    id: uid(),
    data: d,
    status: 'complete',
    created: now,
    updated: now,
    stage: 'pipeline',
  }

  const payload = await getPayload({ config: configPromise })
  try {
    // New submissions go to the TOP of the list: `pos` sorts ascending and the
    // client seam re-numbers from 0, so "one below the current minimum" is it.
    const first = await payload.find({
      collection: 'offer-requests',
      sort: 'pos',
      limit: 1,
      depth: 0,
      select: { pos: true },
      overrideAccess: true,
    })
    const minPos = first.docs[0]?.pos
    const pos = typeof minPos === 'number' ? minPos - 1 : 0

    await payload.create({
      collection: 'offer-requests',
      data: { ...toOfferDoc(rec, pos), id: rec.id },
      depth: 0,
      overrideAccess: true,
      context: { apply: { name, email } },
    })
  } catch (err) {
    payload.logger.error({ err, msg: 'public apply submission failed' })
    return bad('Could not save the request', 500)
  }

  return Response.json({ id: rec.id })
}

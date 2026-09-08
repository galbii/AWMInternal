// The write door for /u/<username> — profile & settings.
//
// GET   ?check=<candidate> -> { available, normalized, reason? }
//       The live handle check the editor runs as the user types. It answers
//       only yes/no: it never says WHOSE account holds a taken name.
// PATCH { id, name?, username?, email?, password?, roles? } -> { ok, profile }
//       Owner or admin/dev only, and rejected while emulating — view-as is
//       read-only across the whole app.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//  1. The request body NEVER reaches payload.update. Every accepted field is
//     copied out by hand into `ProfileUpdate` (the whitelist below), so a body
//     carrying `roles`, `emulationBlocked`, `hash`, `sessions`, `id`, … cannot
//     smuggle anything into the document.
//  2. Nothing describing a user leaves here except a ProfileView built by
//     src/lib/users/profile.ts. The raw updated doc (hash, salt, sessions,
//     loginAttempts, emulationBlocked) is never returned.
//
// Non-2xx bodies are plain text written for the person in the form (house
// style — see api/passkey/register/verify); 2xx bodies are JSON.

import { Forbidden, NotFound } from 'payload'

import { hasRole, type Role } from '@/access/roles'
import { deny, getViewer } from '@/lib/auth/viewer'
import { toProfileView } from '@/lib/users/profile'
import { slugifyUsername, validateUsername } from '@/lib/users/username'

export const dynamic = 'force-dynamic'

const ROLES = new Set<string>(['dev', 'admin', 'user'] satisfies Role[])
const PASSWORD_MIN = 8

/** Form-level failures. deny() still owns 401/403. */
const fail = (status: 400 | 404 | 409, msg: string): Response => new Response(msg, { status })

// ---------------------------------------------------------------- GET

export async function GET(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)

  const candidate = new URL(request.url).searchParams.get('check')
  if (candidate === null) return fail(400, 'Missing check.')

  const normalized = slugifyUsername(candidate)
  const reason = validateUsername(normalized)
  // A malformed or reserved handle is a form answer, not an HTTP error: the
  // editor shows `reason` under the field and keeps going.
  if (reason) return Response.json({ available: false, normalized, reason })

  // overrideAccess: this is a uniqueness probe over ALL users, which
  // `selfOrAdminOrDev` would otherwise narrow to the caller's own row (making
  // every taken name look free). Only the boolean escapes — never the holder.
  const { totalDocs } = await v.payload.count({
    collection: 'users',
    overrideAccess: true,
    where: {
      and: [
        { username: { equals: normalized } },
        // Keeping the handle you already have always reads as available.
        { id: { not_equals: v.actor.id } },
      ],
    },
  })

  return Response.json({ available: totalDocs === 0, normalized })
}

// ---------------------------------------------------------------- PATCH

interface PatchBody {
  id?: unknown
  name?: unknown
  username?: unknown
  email?: unknown
  password?: unknown
  roles?: unknown
}

/** The ONLY fields that may reach payload.update. Nothing else is copied. */
interface ProfileUpdate {
  name?: string
  username?: string
  email?: string
  password?: string
  roles?: Role[]
}

export async function PATCH(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (v.isEmulating) {
    return deny(403, 'Read-only: you are viewing as another user. Exit view-as to make changes.')
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return fail(400, 'Bad request.')
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return fail(400, 'Missing profile id.')

  const isSelf = String(v.actor.id) === id
  const isAdmin = hasRole(v.actor, 'admin', 'dev')
  // Authorization is on the TARGET, not merely on "is signed in" — posting
  // somebody else's id is the whole attack this guard exists for. Payload's
  // own `selfOrAdminOrDev` update access is the second line of defence below.
  if (!isSelf && !isAdmin) return deny(403, 'You can only edit your own profile.')

  const data: ProfileUpdate = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return fail(400, 'Name must be text.')
    data.name = body.name.trim()
  }

  if (body.username !== undefined) {
    if (typeof body.username !== 'string') return fail(400, 'Username must be text.')
    // Normalize and validate HERE so the caller gets this sentence back as a
    // 400, instead of the ensureUsername hook throwing mid-write.
    const normalized = slugifyUsername(body.username)
    const reason = validateUsername(normalized)
    if (reason) return fail(400, reason)
    data.username = normalized
  }

  if (body.email !== undefined) {
    // Payload treats `email` as the LOGIN IDENTIFIER for the users collection:
    // changing it changes what this person signs in with. Allowed for the
    // owner and for admins/devs — the same people who may edit at all.
    if (typeof body.email !== 'string') return fail(400, 'Email must be text.')
    const email = body.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter a valid email address.')
    data.email = email
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < PASSWORD_MIN) {
      return fail(400, `Passwords need at least ${PASSWORD_MIN} characters.`)
    }
    data.password = body.password
  }

  if (body.roles !== undefined) {
    if (!isAdmin) return deny(403, 'Only an admin can change roles.')
    // Nobody edits their own roles — an admin doing so is either demoting
    // themselves out of the app or self-promoting past review. The `roles`
    // field is admin-only at field level too; this is the account-level half.
    if (isSelf) return deny(403, 'You cannot change your own roles.')
    if (!Array.isArray(body.roles)) return fail(400, 'Roles must be a list.')
    const supplied: unknown[] = body.roles
    if (supplied.length === 0) return fail(400, 'Pick at least one role.')
    const roles = supplied.filter((r): r is Role => typeof r === 'string' && ROLES.has(r))
    if (roles.length !== supplied.length) return fail(400, 'Unknown role.')
    data.roles = roles
  }

  if (Object.keys(data).length === 0) return fail(400, 'Nothing to update.')

  try {
    // overrideAccess: false + user: actor so Payload re-runs collection access
    // (`selfOrAdminOrDev`) AND field access (`roles` is admin-only) against the
    // real human — never the emulated viewer, who cannot get this far anyway.
    const updated = await v.payload.update({
      collection: 'users',
      id,
      data,
      depth: 0,
      overrideAccess: false,
      user: v.actor,
    })
    // Projection, not the document: `updated` still carries hash/salt/sessions.
    return Response.json({ ok: true, profile: toProfileView(updated, v.actor, false) })
  } catch (err) {
    v.payload.logger.warn({ err, msg: 'profile update failed', id })
    if (err instanceof NotFound) return fail(404, 'That profile no longer exists.')
    if (err instanceof Forbidden) return deny(403, 'You cannot make that change.')
    const message = err instanceof Error ? err.message.trim() : ''
    // ensureUsername throws sentences written for the person typing; a
    // collision is the one that deserves 409.
    if (/already taken/i.test(message)) return fail(409, message)
    // Surface a message only when it still reads like one we wrote (or one of
    // Payload's field-validation lines). Anything long or multi-line is a
    // driver/stack detail and gets a generic sentence instead.
    const readable = message.length > 0 && message.length <= 160 && !message.includes('\n')
    return fail(400, readable ? message : 'That change could not be saved.')
  }
}

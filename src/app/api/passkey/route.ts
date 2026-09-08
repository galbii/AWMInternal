// The signed-in person's own passkeys: list them, remove one.
//
// Scoped to the CALLER in both directions. Admins/devs can reach anyone's
// rows through /admin (the collection's access allows it) — this endpoint
// deliberately does not, so a compromised session can only ever touch its own
// credentials.

import { deny } from '@/lib/auth/viewer'
import { relationshipId, toPasskeySummary } from '@/lib/passkeys/credential'
import { requirePasskeyActor } from '@/lib/passkeys/guard'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const v = await requirePasskeyActor()
  if (v instanceof Response) return v

  const { docs } = await v.payload.find({
    collection: 'passkeys',
    where: { user: { equals: v.actor.id } },
    sort: '-createdAt',
    depth: 0,
    limit: 0,
    pagination: false,
    user: v.actor,
    overrideAccess: false,
  })

  return Response.json({ passkeys: docs.map(toPasskeySummary) })
}

export async function DELETE(request: Request): Promise<Response> {
  const v = await requirePasskeyActor()
  if (v instanceof Response) return v

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return new Response('Bad request', { status: 400 })

  // Ownership is checked HERE, on the loaded doc, rather than leaning on the
  // collection's access rules — those also say yes to admins/devs, and this
  // route must not.
  const doc = await v.payload
    .findByID({ collection: 'passkeys', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return new Response('Not found', { status: 404 })
  if (relationshipId(doc.user) !== String(v.actor.id)) {
    return deny(403, 'That passkey belongs to another account.')
  }

  await v.payload.delete({ collection: 'passkeys', id, depth: 0, overrideAccess: true })
  return Response.json({ ok: true })
}

// Step 2 of signing in with a passkey: the assertion arrives, and if it holds
// up we mint a real Payload session — the same `payload-token` cookie the
// password form gets from /api/users/login.
//
// PUBLIC, so every failure answers the same way: 401 with one flat message.
// A "no such credential" that reads differently from "bad signature" turns
// this endpoint into an oracle for which passkeys are enrolled here.

import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'

import { deny, EMULATE_COOKIE } from '@/lib/auth/viewer'
import { env } from '@/lib/env'
import { AUTHENTICATION_CHALLENGE, clearChallenge, readChallenge } from '@/lib/passkeys/challenge'
import { decodePublicKey, normalizeTransports, relationshipId } from '@/lib/passkeys/credential'
import { createSessionCookie } from '@/lib/passkeys/session'

export const dynamic = 'force-dynamic'

const UNVERIFIED = 'That passkey could not be verified.'

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'rawId' in value &&
    'response' in value &&
    'type' in value
  )
}

export async function POST(request: Request): Promise<Response> {
  let body: { response?: unknown }
  try {
    body = (await request.json()) as { response?: unknown }
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const response = body.response
  if (!isAuthenticationResponse(response)) return new Response('Bad request', { status: 400 })

  // Burn the challenge BEFORE doing any work with it. A captured assertion
  // replayed a second later then has nothing left to match against.
  const expectedChallenge = await readChallenge(AUTHENTICATION_CHALLENGE)
  await clearChallenge(AUTHENTICATION_CHALLENGE)
  if (!expectedChallenge) return deny(401, UNVERIFIED)

  const payload = await getPayload({ config })

  try {
    // `response.id` only NAMES a credential — everything trusted comes from
    // the stored row: the public key that checks the signature, and the
    // counter that catches a clone.
    const { docs } = await payload.find({
      collection: 'passkeys',
      where: { credentialID: { equals: response.id } },
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const stored = docs[0]
    if (!stored) return deny(401, UNVERIFIED)

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.PASSKEY.origins,
      expectedRPID: env.PASSKEY.rpID,
      credential: {
        id: stored.credentialID,
        publicKey: decodePublicKey(stored.publicKey),
        counter: stored.counter,
        transports: normalizeTransports(stored.transports),
      },
      // Mirrors the 'preferred' we asked for in the options.
      requireUserVerification: false,
    })
    if (!verification.verified) return deny(401, UNVERIFIED)

    const userId = relationshipId(stored.user)
    if (!userId) return deny(401, UNVERIFIED)
    const user = await payload
      .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!user) return deny(401, UNVERIFIED)

    await payload.update({
      collection: 'passkeys',
      id: stored.id,
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
    })

    const sessionCookie = await createSessionCookie(payload, user)

    // A stale view-as cookie must not survive into a brand new session — the
    // person signing in is whoever the passkey says, not whoever the last
    // session was looking at.
    const jar = await cookies()
    jar.delete(EMULATE_COOKIE)

    return Response.json({ verified: true }, { headers: { 'Set-Cookie': sessionCookie } })
  } catch (err) {
    payload.logger.warn({ err, msg: 'passkey authentication failed' })
    return deny(401, UNVERIFIED)
  }
}

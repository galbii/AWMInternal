// Step 2 of enrolling a passkey: check the signature over the challenge we
// issued, then store the public key.
//
// `requireUserVerification: false` matches the `userVerification: 'preferred'`
// we asked for in the options — demanding it here would reject authenticators
// that legitimately answered "presence only", which is what 'preferred' means.

import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { ValidationError } from 'payload'

import { deny } from '@/lib/auth/viewer'
import { env } from '@/lib/env'
import { clearChallenge, readChallenge, REGISTRATION_CHALLENGE } from '@/lib/passkeys/challenge'
import {
  encodePublicKey,
  normalizeTransports,
  sanitizeLabel,
  toPasskeySummary,
} from '@/lib/passkeys/credential'
import { requirePasskeyActor } from '@/lib/passkeys/guard'

export const dynamic = 'force-dynamic'

const UNVERIFIED = 'That passkey could not be verified.'

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
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
  const v = await requirePasskeyActor()
  if (v instanceof Response) return v

  let body: { label?: unknown; response?: unknown }
  try {
    body = (await request.json()) as { label?: unknown; response?: unknown }
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!isRegistrationResponse(body.response)) return new Response('Bad request', { status: 400 })

  // Read then immediately burn it: one challenge, one attempt, success or not.
  const expectedChallenge = await readChallenge(REGISTRATION_CHALLENGE)
  await clearChallenge(REGISTRATION_CHALLENGE)
  if (!expectedChallenge) {
    return new Response('Registration challenge expired — start again.', { status: 400 })
  }

  const { payload } = v
  try {
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: env.PASSKEY.origins,
      expectedRPID: env.PASSKEY.rpID,
      requireUserVerification: false,
    })
    if (!verification.verified) return deny(401, UNVERIFIED)

    const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo
    const created = await payload.create({
      collection: 'passkeys',
      data: {
        user: v.actor.id,
        credentialID: credential.id,
        publicKey: encodePublicKey(credential.publicKey),
        counter: credential.counter,
        transports: normalizeTransports(credential.transports) ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: sanitizeLabel(body.label),
        // Left unset on purpose: "last used" means last SIGN-IN, and enrolling
        // is not one.
      },
      depth: 0,
      overrideAccess: true,
    })

    return Response.json({ verified: true, passkey: toPasskeySummary(created) })
  } catch (err) {
    // The unique index on credentialID is the backstop for a credential that
    // is already enrolled — possibly on somebody else's account, which is
    // exactly when excludeCredentials cannot have caught it. Everything else
    // in `data` is server-built, so a validation error can only be that.
    if (err instanceof ValidationError) {
      return new Response('That passkey is already registered.', { status: 409 })
    }
    payload.logger.warn({ err, msg: 'passkey registration verification failed' })
    return deny(401, UNVERIFIED)
  }
}

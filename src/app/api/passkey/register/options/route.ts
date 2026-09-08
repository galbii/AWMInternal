// Step 1 of enrolling a passkey: hand the browser a challenge to sign.
//
// `residentKey: 'required'` is the whole point — it makes the credential
// DISCOVERABLE, which is what lets someone sign in later without typing an
// email first, and what puts the passkey in the autofill dropdown.

import { generateRegistrationOptions } from '@simplewebauthn/server'
import { isoUint8Array } from '@simplewebauthn/server/helpers'

import { env } from '@/lib/env'
import { isSecureRequest, REGISTRATION_CHALLENGE, setChallenge } from '@/lib/passkeys/challenge'
import { normalizeTransports } from '@/lib/passkeys/credential'
import { requirePasskeyActor } from '@/lib/passkeys/guard'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const v = await requirePasskeyActor()
  if (v instanceof Response) return v

  const user = v.actor

  // Already-registered authenticators. The browser refuses to enrol one of
  // these a second time, so the person gets "you already have a passkey here"
  // from the OS instead of a silent duplicate.
  const { docs } = await v.payload.find({
    collection: 'passkeys',
    where: { user: { equals: user.id } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })

  const options = await generateRegistrationOptions({
    rpName: env.PASSKEY.rpName,
    rpID: env.PASSKEY.rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    // A STABLE user handle. With a random one, every enrolment would look
    // like a separate account inside the password manager's passkey list.
    userID: isoUint8Array.fromUTF8String(String(user.id)),
    attestationType: 'none',
    excludeCredentials: docs.map((doc) => ({
      id: doc.credentialID,
      transports: normalizeTransports(doc.transports),
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })

  await setChallenge(REGISTRATION_CHALLENGE, options.challenge, isSecureRequest(request))
  return Response.json(options)
}

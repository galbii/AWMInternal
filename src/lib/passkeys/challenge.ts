// A WebAuthn ceremony is two HTTP requests: the server issues a challenge,
// then verifies a signature over it. The challenge has to survive the gap, and
// it has to be bound to the same browser that asked for it — otherwise anyone
// could replay a captured assertion.
//
// A short-lived httpOnly cookie does both jobs with no server-side store: the
// browser can't read it, it rides along automatically, and it expires on its
// own in five minutes if the ceremony is abandoned. The verify handlers clear
// it BEFORE verifying, which makes every challenge strictly single-use.

import { cookies } from 'next/headers'

export const REGISTRATION_CHALLENGE = 'awm-pk-reg'
export const AUTHENTICATION_CHALLENGE = 'awm-pk-auth'

export type ChallengeName = typeof AUTHENTICATION_CHALLENGE | typeof REGISTRATION_CHALLENGE

/** Long enough for a slow "reach for your phone" ceremony, short enough that */
/** an abandoned challenge is not sitting around. Matches the WebAuthn timeout. */
const CHALLENGE_TTL_SECONDS = 300

/**
 * `secure` is passed in rather than assumed: a Secure cookie is silently
 * DROPPED over plain http, which would break local dev at
 * http://localhost:3000 in a way that looks like a WebAuthn bug.
 */
export async function setChallenge(
  name: ChallengeName,
  value: string,
  secure: boolean,
): Promise<void> {
  const jar = await cookies()
  jar.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: CHALLENGE_TTL_SECONDS,
  })
}

export async function readChallenge(name: ChallengeName): Promise<null | string> {
  const jar = await cookies()
  return jar.get(name)?.value ?? null
}

export async function clearChallenge(name: ChallengeName): Promise<void> {
  const jar = await cookies()
  jar.delete(name)
}

/** Same test the emulation route uses — the request's own scheme decides. */
export const isSecureRequest = (request: Request): boolean =>
  new URL(request.url).protocol === 'https:'

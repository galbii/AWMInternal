// Step 1 of signing in with a passkey. PUBLIC by definition — nobody is
// logged in yet.
//
// No `allowCredentials`: the whole flow is usernameless. The browser offers
// whichever discoverable passkey it holds for this site, and the assertion
// tells us who they are. Sending a list would mean first asking "who are
// you?", which is the password-shaped thing passkeys exist to avoid — and it
// would leak which accounts have credentials to anyone who asked.

import { generateAuthenticationOptions } from '@simplewebauthn/server'

import { env } from '@/lib/env'
import { AUTHENTICATION_CHALLENGE, isSecureRequest, setChallenge } from '@/lib/passkeys/challenge'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const options = await generateAuthenticationOptions({
    rpID: env.PASSKEY.rpID,
    userVerification: 'preferred',
  })

  await setChallenge(AUTHENTICATION_CHALLENGE, options.challenge, isSecureRequest(request))
  return Response.json(options)
}

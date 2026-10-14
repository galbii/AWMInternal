// DocuSign JWT Grant. The app signs an assertion with the integration's RSA
// key and receives a token that acts as env.DOCUSIGN.userId — which works
// only once that user has granted consent, ONCE, through consentUrl().
//
// Server-only: it reads the private key. Shared by any app that needs
// signatures, which is why it lives here and not under src/lib/offers/.

import { createSign } from 'node:crypto'

import { env } from '@/lib/env'

const SCOPE = 'signature impersonation'

export type DocusignConfig = NonNullable<typeof env.DOCUSIGN>

/** Where DocuSign sends the user back after consent. Must be registered in Apps and Keys. */
export function consentRedirectUri(): string {
  return `${env.PASSKEY.origins[0]}/api/docusign/callback`
}

export function consentUrl(cfg: DocusignConfig): string {
  const q = new URLSearchParams({
    response_type: 'code',
    scope: SCOPE,
    client_id: cfg.integrationKey,
    redirect_uri: consentRedirectUri(),
  })
  return `https://${cfg.authServer}/oauth/auth?${q}`
}

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

export type TokenResult =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; error: string }

/** Never throws: `consent_required` is an expected answer, not a crash. */
export async function getAccessToken(cfg: DocusignConfig): Promise<TokenResult> {
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: cfg.integrationKey,
    sub: cfg.userId,
    aud: cfg.authServer,
    iat: now,
    exp: now + 3600,
    scope: SCOPE,
  })}`
  try {
    const sig = createSign('RSA-SHA256').update(body).sign(cfg.privateKey).toString('base64url')
    const res = await fetch(`https://${cfg.authServer}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${body}.${sig}`,
      }),
      cache: 'no-store',
    })
    const json = (await res.json()) as {
      access_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }
    if (json.access_token) {
      return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 }
    }
    return { ok: false, error: json.error_description || json.error || `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

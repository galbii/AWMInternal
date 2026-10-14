// The link you send to the DocuSign user: GET /api/docusign/consent.
// It forwards to DocuSign's one-time consent screen, which comes back to
// /api/docusign/callback.
//
// Public on purpose — the person granting consent may have no AWM login, and
// DocuSign's own sign-in decides who can accept. Nothing secret leaves here:
// the URL carries only the integration key, which is a public client id.

import { consentUrl } from '@/lib/docusign/auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  if (!env.DOCUSIGN) {
    return new Response('DocuSign is not configured on this server.', { status: 503 })
  }
  return Response.redirect(consentUrl(env.DOCUSIGN), 302)
}

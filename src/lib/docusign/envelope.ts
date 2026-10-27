// Send one PDF to DocuSign for ONE signer: an envelope created already `sent`,
// so DocuSign emails the signer the link itself.
//
// Server-only (it calls getAccessToken, which reads the private key). Generic
// on purpose — it knows nothing about offers; the offers route decides what is
// sent, to whom, and whether it may be.
//
// The body itself (pure, tested), and why tabs are placed by coordinates, is
// build.ts.

import { getAccessToken, type DocusignConfig } from '@/lib/docusign/auth'
import { buildEnvelope, type EnvelopeInput } from '@/lib/docusign/build'

export type EnvelopeResult = { ok: true; envelopeId: string } | { ok: false; error: string }

/** Never throws: DocuSign's own wording comes back as `error`. */
export async function sendEnvelope(
  cfg: DocusignConfig,
  input: EnvelopeInput,
): Promise<EnvelopeResult> {
  const token = await getAccessToken(cfg)
  if (!token.ok) {
    return {
      ok: false,
      error:
        token.error === 'consent_required'
          ? 'DocuSign has no consent on record for the configured user. Open /api/docusign/consent once to grant it.'
          : 'DocuSign sign-in failed: ' + token.error,
    }
  }
  try {
    const res = await fetch(`${cfg.basePath}/v2.1/accounts/${cfg.accountId}/envelopes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildEnvelope(input)),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as {
      envelopeId?: string
      errorCode?: string
      message?: string
    }
    if (res.ok && json.envelopeId) return { ok: true, envelopeId: json.envelopeId }
    return {
      ok: false,
      error: json.message || json.errorCode || `DocuSign answered HTTP ${res.status}`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

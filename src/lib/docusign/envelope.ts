// The DocuSign envelope calls: create one (sent, or a draft for HR to finish),
// open the sender view for a draft, and read an envelope's status back.
//
// Server-only (it calls getAccessToken, which reads the private key). Generic
// on purpose — it knows nothing about offers; the offers route decides what is
// sent, to whom, and whether it may be.
//
// The bodies themselves (pure, tested), and why tabs are placed by
// coordinates, are build.ts.

import { getAccessToken, type DocusignConfig } from '@/lib/docusign/auth'
import { buildEnvelope, buildSenderView, type EnvelopeInput } from '@/lib/docusign/build'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

/** One authenticated call. Never throws: DocuSign's own wording comes back as `error`. */
async function call<T>(
  cfg: DocusignConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Result<{ json: T }>> {
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
    const res = await fetch(`${cfg.basePath}/v2.1/accounts/${cfg.accountId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as T & { errorCode?: string; message?: string }
    if (res.ok) return { ok: true, json }
    return { ok: false, error: json.message || json.errorCode || `DocuSign answered HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createEnvelope(
  cfg: DocusignConfig,
  input: EnvelopeInput,
): Promise<Result<{ envelopeId: string }>> {
  const r = await call<{ envelopeId?: string }>(cfg, 'POST', '/envelopes', buildEnvelope(input))
  if (!r.ok) return r
  return r.json.envelopeId
    ? { ok: true, envelopeId: r.json.envelopeId }
    : { ok: false, error: 'DocuSign did not return an envelope id.' }
}

/** The tagging screen for a DRAFT envelope. The URL is short-lived and single-use. */
export async function senderViewUrl(
  cfg: DocusignConfig,
  envelopeId: string,
  returnUrl: string,
): Promise<Result<{ url: string }>> {
  const r = await call<{ url?: string }>(
    cfg,
    'POST',
    `/envelopes/${encodeURIComponent(envelopeId)}/views/sender`,
    buildSenderView(returnUrl),
  )
  if (!r.ok) return r
  return r.json.url ? { ok: true, url: r.json.url } : { ok: false, error: 'DocuSign did not return a sending link.' }
}

/** 'created' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided' … */
export async function envelopeStatus(
  cfg: DocusignConfig,
  envelopeId: string,
): Promise<Result<{ status: string; emailSubject: string }>> {
  const r = await call<{ status?: string; emailSubject?: string }>(
    cfg,
    'GET',
    `/envelopes/${encodeURIComponent(envelopeId)}`,
  )
  if (!r.ok) return r
  return { ok: true, status: r.json.status || '', emailSubject: r.json.emailSubject || '' }
}

export interface EnvelopeRecipient {
  name: string
  email: string
  routingOrder: number
}

/** Who the envelope routes to, as DocuSign holds it — HR may have changed it in the sender view. */
export async function envelopeRecipients(
  cfg: DocusignConfig,
  envelopeId: string,
): Promise<Result<{ signers: EnvelopeRecipient[]; copies: EnvelopeRecipient[] }>> {
  type Raw = { name?: string; email?: string; routingOrder?: string }
  const r = await call<{ signers?: Raw[]; carbonCopies?: Raw[] }>(
    cfg,
    'GET',
    `/envelopes/${encodeURIComponent(envelopeId)}/recipients`,
  )
  if (!r.ok) return r
  const map = (xs: Raw[] = []): EnvelopeRecipient[] =>
    xs
      .map((x) => ({ name: x.name || '', email: x.email || '', routingOrder: Number(x.routingOrder) || 0 }))
      .sort((a, b) => a.routingOrder - b.routingOrder)
  return { ok: true, signers: map(r.json.signers), copies: map(r.json.carbonCopies) }
}

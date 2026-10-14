// DocuSign returns here after the consent screen (the redirect URI registered
// in Apps and Keys). JWT Grant never exchanges the `code` — consent is
// recorded on DocuSign's side — so this only PROVES it worked by asking for a
// token, and tells the person in plain words. The token itself is discarded.

import { getAccessToken } from '@/lib/docusign/auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function page(ok: boolean, title: string, detail: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6f8;
font:16px/1.5 system-ui,sans-serif;color:#1b2430;padding:16px}main{max-width:440px;background:#fff;
border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
.m{font-size:40px;color:${ok ? '#1a7f37' : '#b42318'}}h1{font-size:20px;margin:8px 0}
p{margin:0;color:#4a5562}</style></head>
<body><main><div class="m">${ok ? '✓' : '✕'}</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></main></body></html>`
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(request: Request): Promise<Response> {
  if (!env.DOCUSIGN) {
    return page(
      false,
      'DocuSign is not configured',
      env.DOCUSIGN_ERROR ?? 'Ask the site administrator.',
    )
  }

  const denied = new URL(request.url).searchParams.get('error')
  if (denied) return page(false, 'Consent was not granted', `DocuSign said: ${denied}.`)

  const t = await getAccessToken(env.DOCUSIGN)
  return t.ok
    ? page(true, 'DocuSign is connected', 'Thank you — All Western Mortgage can now send documents for signature. You can close this tab.')
    : page(
        false,
        'DocuSign is not connected yet',
        t.error === 'consent_required'
          ? 'DocuSign has no consent on record for the user this app is set up for. If you just accepted, you were probably signed in to a different DocuSign account. Sign in as the correct user and try the link again.'
          : `DocuSign said: ${t.error}`,
      )
}

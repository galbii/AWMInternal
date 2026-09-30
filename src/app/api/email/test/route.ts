// Prove Resend works from inside the running app.
//
// GET          -> what the server actually sees: { configured, fromAddress,
//                 fromName, keyLooksValid, overrideTo }. Never the key itself.
// POST { to? } -> sends a real email through src/lib/email/send.ts, the same
//                 seam every feature uses, and returns Resend's verdict.
//                 `to` defaults to the signed-in admin's own address, which is
//                 also the only recipient Resend allows before a domain is
//                 verified.
//
// Admin/dev only, and refused while emulating: "view as" is read-only, and
// sending mail as somebody else is a write with a paper trail outside the app.

import { hasRole } from '@/access/roles'
import { blockEmulatedWrite, deny, getViewer, type Viewer } from '@/lib/auth/viewer'
import { emailStatus, sendEmail } from '@/lib/email/send'

export const dynamic = 'force-dynamic'

async function gate(): Promise<{ v: Viewer } | { err: Response }> {
  const v = await getViewer()
  if (!v) return { err: deny(401) }
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) return { err: blocked }
  if (!hasRole(v.actor, 'admin', 'dev')) return { err: deny(403) }
  return { v }
}

export async function GET(): Promise<Response> {
  const g = await gate()
  if ('err' in g) return g.err
  return Response.json(emailStatus())
}

export async function POST(request: Request): Promise<Response> {
  const g = await gate()
  if ('err' in g) return g.err
  const { v } = g

  let to = ''
  try {
    const body = (await request.json()) as { to?: unknown }
    to = typeof body.to === 'string' ? body.to.trim() : ''
  } catch {
    // No body is fine — fall through to the actor's own address.
  }
  if (!to) to = v.actor.email

  const sent = new Date()
  const result = await sendEmail({
    to,
    subject: 'Resend test — AWM Internal',
    text: [
      'This is a test message from AWM Internal.',
      '',
      `Requested by: ${v.actor.name || v.actor.email}`,
      `Sent: ${sent.toISOString()}`,
      '',
      'If this arrived, Resend is wired up correctly.',
    ].join('\n'),
    html: [
      '<p>This is a test message from <strong>AWM Internal</strong>.</p>',
      `<p>Requested by: ${v.actor.name || v.actor.email}<br>Sent: ${sent.toISOString()}</p>`,
      '<p>If this arrived, Resend is wired up correctly.</p>',
    ].join(''),
  })

  return Response.json(
    { ...result, to, status: emailStatus() },
    { status: result.ok ? 200 : result.skipped ? 503 : 502 },
  )
}

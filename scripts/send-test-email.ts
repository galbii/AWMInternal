/**
 * Preflight the Resend credentials from a terminal — no browser, no session.
 *
 *   bun run email:test you@allwesternmortgage.com
 *   bun run email:test you@allwesternmortgage.com --from 'AWM <onboarding@resend.dev>'
 *
 * It reads the SAME resolved config the app does (`src/lib/env.ts`, which
 * imports nothing, so it is safe here) and then calls api.resend.com directly.
 * Deliberately NOT through src/lib/email/send.ts: that imports
 * @payload-config, and pulling Lexical into a plain script fails outside
 * Next's bundler — the same reason the backfills talk to Mongo directly.
 *
 * So this checks exactly what Resend checks — the key, the sender's domain,
 * the recipient — and nothing else. Once it passes, POST /api/email/test
 * exercises the real app path (Payload's adapter, admin-gated) in the browser.
 *
 * Bun loads .env.local automatically, so nothing needs exporting first.
 */

import { env } from '../src/lib/env'

interface ResendOk {
  id: string
}
interface ResendErr {
  statusCode?: number
  name?: string
  message?: string
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

async function main(): Promise<void> {
  // The recipient is the first bare address — skipping any flag's own value,
  // since `--from 'AWM <x@y.com>'` also contains an "@".
  const args = process.argv.slice(2)
  const fromValue = arg('--from')
  const to = args.find((a) => a.includes('@') && !a.startsWith('--') && a !== fromValue)
  if (!to) {
    throw new Error("Who to? Usage: bun run email:test you@example.com ['--from' 'Name <addr>']")
  }

  const resend = env.RESEND
  if (!resend) {
    throw new Error(
      'Resend is off: RESEND_API_KEY is unset or still a placeholder in .env.local.\n' +
        'Get a key at resend.com → API Keys (it starts with "re_"), then re-run.',
    )
  }
  if (!resend.apiKey.startsWith('re_')) {
    console.warn('⚠ RESEND_API_KEY does not start with "re_" — check you pasted the whole key.')
  }

  const from = arg('--from') || `${resend.fromName} <${resend.fromAddress}>`
  // Mirror the adapter: RESEND_OVERRIDE_TO swallows every recipient.
  const recipient = resend.overrideTo ?? to
  if (resend.overrideTo) {
    console.log(`↪ RESEND_OVERRIDE_TO is set — redirecting ${to} → ${resend.overrideTo}`)
  }

  console.log(`Sending from ${from}\n           to ${recipient} …`)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipient,
      subject: 'Resend test — AWM Internal',
      text: `Preflight from bun run email:test at ${new Date().toISOString()}.\nIf this arrived, the key and the sending domain are good.`,
    }),
  })

  const data = (await res.json()) as ResendOk | ResendErr
  if ('id' in data && data.id) {
    console.log(`✓ Accepted by Resend — id ${data.id}`)
    console.log('  Delivery (and any bounce) shows up at resend.com/emails.')
    return
  }

  const err = data as ResendErr
  const code = err.statusCode ?? res.status
  console.error(`✗ Resend refused (${code}): ${err.name ?? 'error'} — ${err.message ?? 'no message'}`)
  if (code === 403) {
    console.error(
      '  Before a domain is verified, Resend only delivers from onboarding@resend.dev\n' +
        "  and only to the address that owns the account. Verify the sender's domain\n" +
        '  at resend.com/domains to mail anyone else.',
    )
  }
  if (code === 401) console.error('  The key was rejected — it may be revoked or from another account.')
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

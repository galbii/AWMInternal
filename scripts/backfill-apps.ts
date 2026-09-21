/**
 * Give every existing account an `apps` list.
 *
 * Before per-app membership (2026-09) every signed-in user could open the
 * Offer & New Hire Manager. Accounts created before the field existed have no
 * list at all, which the new rule reads as "no apps" — so without this, every
 * plain user would land on an empty hub after the deploy. Admins/developers
 * are unaffected (they open every app regardless) but get the same list so
 * the directory reads consistently.
 *
 * Idempotent — accounts that already have a list are skipped, so it is safe
 * to re-run.
 *
 *   bun run backfill:apps                    # give everyone without a list: offers
 *   bun run backfill:apps --apps offers,kern # …a different set
 *   bun run backfill:apps --dry-run          # show what it would do
 *
 * Talks to Mongo directly for the same reason backfill-usernames.ts does:
 * importing @payload-config pulls Lexical in, which fails to initialise
 * outside Next's bundler. The registry is pure, so the valid ids stay shared.
 */

import { MongoClient } from 'mongodb'

import { withApps } from '../src/lib/apps/membership'
import { membershipApps } from '../src/lib/apps/registry'

interface UserRow {
  _id: unknown
  email?: string
  name?: string
  apps?: string[] | null
}

const dryRun = process.argv.includes('--dry-run')
const appsArg = process.argv.indexOf('--apps')
const requested =
  appsArg >= 0 ? String(process.argv[appsArg + 1] || '').split(',').map((s) => s.trim()) : ['offers']

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  throw new Error('DATABASE_URL is not set. Run with it exported (it normally lives in .env.local).')
}

async function main(): Promise<void> {
  const valid = membershipApps().map((a) => a.id)
  const grant = withApps([], requested, [], valid)
  const unknown = requested.filter((id) => id && !valid.includes(id))
  if (unknown.length) throw new Error(`Unknown app id(s): ${unknown.join(', ')} (valid: ${valid.join(', ')})`)
  if (!grant.length) throw new Error('Nothing to grant.')

  const client = new MongoClient(databaseUrl())
  await client.connect()
  try {
    const users = client.db().collection<UserRow>('users')
    const missing = await users
      .find({ $or: [{ apps: { $exists: false } }, { apps: null }] }, {
        projection: { email: 1, name: 1, apps: 1 },
      })
      .toArray()

    if (!missing.length) {
      console.log('Every account already has an apps list. Nothing to do.')
      return
    }
    console.log(`${missing.length} account(s) have no apps list; granting: ${grant.join(', ')}\n`)

    for (const u of missing) {
      const label = u.email || u.name || String(u._id)
      if (dryRun) {
        console.log(`  would set  ${label}  ->  [${grant.join(', ')}]`)
        continue
      }
      await users.updateOne({ _id: u._id }, { $set: { apps: grant } })
      console.log(`  set  ${label}  ->  [${grant.join(', ')}]`)
    }
    console.log(dryRun ? '\nDry run — nothing was written.' : '\nDone.')
  } finally {
    await client.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })

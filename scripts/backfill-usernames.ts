/**
 * Give every existing user a `/u/<username>` handle.
 *
 * Accounts created before the username field existed have no handle, so their
 * profile is only reachable by id. This fills one in, derived from the email
 * local part (falling back to the name), de-duplicated against handles already
 * in use.
 *
 * Idempotent — users who already have a handle are skipped, so it is safe to
 * re-run after seeding or importing more accounts.
 *
 *   bun run backfill:usernames            # apply
 *   bun run backfill:usernames --dry-run  # show what it would do
 *
 * Deliberately talks to Mongo directly instead of booting Payload: this is a
 * one-field data migration, it needs no hooks, and importing @payload-config
 * pulls the Lexical editor in, which fails to initialise outside Next's
 * bundler. `username.ts` is pure, so the derivation rules stay shared with the
 * app rather than being re-implemented here.
 */

import { MongoClient } from 'mongodb'

import { deriveUsername, uniqueUsername } from '../src/lib/users/username'

interface UserRow {
  _id: unknown
  email?: string
  name?: string
  username?: string
}

const dryRun = process.argv.includes('--dry-run')

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  // Scripts run outside Next, which is what normally loads .env.local.
  const file = Bun.file('.env.local')
  throw new Error(
    `DATABASE_URL is not set. Run with it exported, or check ${file.name} exists.`,
  )
}

async function main(): Promise<void> {
  const client = new MongoClient(databaseUrl())
  await client.connect()

  try {
    const users = client.db().collection<UserRow>('users')
    const all = await users
      .find({}, { projection: { email: 1, name: 1, username: 1 } })
      .toArray()

    // Seed the taken-set from existing handles so two accounts derived from
    // the same local part can't both claim it inside a single run.
    const taken = new Set<string>(
      all.map((u) => (typeof u.username === 'string' ? u.username : '')).filter(Boolean),
    )

    const missing = all.filter((u) => !u.username)
    if (!missing.length) {
      console.log(`All ${all.length} user(s) already have a username. Nothing to do.`)
      return
    }

    console.log(`${missing.length} of ${all.length} user(s) need a username.\n`)

    for (const user of missing) {
      const base = deriveUsername(user.email, user.name)
      const handle = await uniqueUsername(base, async (candidate) => taken.has(candidate))
      taken.add(handle)

      const label = user.email || user.name || String(user._id)
      if (dryRun) {
        console.log(`  would set  ${label}  ->  @${handle}`)
        continue
      }

      await users.updateOne({ _id: user._id }, { $set: { username: handle } })
      console.log(`  set  ${label}  ->  @${handle}`)
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

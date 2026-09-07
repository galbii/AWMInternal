/**
 * One-off migration for the dashboard roles: any existing user with no `roles`
 * value gets ALL roles (['dev','admin','user']) — before roles existed, every
 * authenticated user could do everything, so this preserves their privileges
 * exactly. New users created afterwards default to ['user'].
 *
 * Dry-run (prints what it would change, writes nothing):
 *   bun run scripts/backfill-roles.ts
 * Commit for real:
 *   bun run scripts/backfill-roles.ts --commit
 *
 * Requires a reachable DATABASE_URL (.env.local).
 */
import configPromise from '@payload-config'
import { getPayload } from 'payload'

const COMMIT = process.argv.includes('--commit')

async function main(): Promise<void> {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  let changed = 0
  for (const u of docs) {
    const roles = Array.isArray(u.roles) ? u.roles : []
    if (roles.length) {
      console.log(`ok      ${u.email} — roles already set: ${roles.join(', ')}`)
      continue
    }
    changed++
    if (COMMIT) {
      await payload.update({
        collection: 'users',
        id: u.id,
        data: { roles: ['dev', 'admin', 'user'] },
        overrideAccess: true,
      })
      console.log(`updated ${u.email} -> dev, admin, user`)
    } else {
      console.log(`would   ${u.email} -> dev, admin, user`)
    }
  }
  console.log(
    COMMIT
      ? `Done — ${changed} user(s) updated.`
      : `Dry run — ${changed} user(s) would be updated. Re-run with --commit.`,
  )
  process.exit(0)
}

void main()

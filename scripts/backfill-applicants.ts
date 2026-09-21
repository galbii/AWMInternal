/**
 * Link every existing offer to a row in the `applicants` collection.
 *
 * Offers saved before the collection existed have no `applicant`. The
 * linkApplicant hook fills it in on the offer's next save; this does the same
 * for everything at once, so the Applicant panel and cross-offer list on
 * /offers/[id] are complete from day one.
 *
 * Idempotent — offers that already carry a link are skipped unless `--all`
 * is passed, which re-syncs every offer (useful after changing the matching
 * rules). Offers are walked oldest-save-first so the NEWEST offer is the one
 * whose identity fields end up mirrored on the applicant, exactly as the hook
 * would have left them.
 *
 *   bun run backfill:applicants            # link offers that have no applicant
 *   bun run backfill:applicants --dry-run  # show what it would do
 *   bun run backfill:applicants --all      # re-sync every offer
 *
 * Talks to Mongo directly for the same reason backfill-usernames.ts does:
 * importing @payload-config pulls Lexical in, which fails to initialise
 * outside Next's bundler. The identity rules stay shared through
 * src/lib/offers/applicant.ts.
 */

import { MongoClient, ObjectId } from 'mongodb'

import { applicantKey, applicantSnapshot, snapshotChanged } from '../src/lib/offers/applicant'
import type { OfferData } from '../src/lib/offers/types'

interface OfferRow {
  _id: string
  data?: OfferData
  applicant?: ObjectId | string | null
  updated?: string
}

interface ApplicantRow {
  _id: ObjectId
  key: string
  name?: string
  preferredName?: string
  email?: string
  phone?: string
  address?: string
  nmls?: string
  lastOffer?: string | null
}

const dryRun = process.argv.includes('--dry-run')
const all = process.argv.includes('--all')

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  throw new Error('DATABASE_URL is not set. Run with it exported (it normally lives in .env.local).')
}

async function main(): Promise<void> {
  const client = new MongoClient(databaseUrl())
  await client.connect()

  try {
    const offers = client.db().collection<OfferRow>('offer-requests')
    const applicants = client.db().collection<ApplicantRow>('applicants')

    const rows = await offers
      .find(all ? {} : { $or: [{ applicant: { $exists: false } }, { applicant: null }] }, {
        projection: { data: 1, applicant: 1, updated: 1 },
      })
      .sort({ updated: 1 })
      .toArray()

    if (!rows.length) {
      console.log('Every offer already has an applicant. Nothing to do.')
      return
    }
    console.log(`${rows.length} offer(s) to link${all ? ' (re-syncing all)' : ''}.\n`)

    // Applicants created during this run, so two unlinked offers for the same
    // person share one row even on a dry run.
    const created = new Map<string, ObjectId>()
    let linked = 0
    let skipped = 0

    for (const offer of rows) {
      const data = offer.data && typeof offer.data === 'object' ? offer.data : {}
      const key = applicantKey(data)
      const label = data.employeeName || offer._id
      if (!key) {
        skipped++
        console.log(`  skip  ${label}  (no email or name to key on)`)
        continue
      }
      const snap = applicantSnapshot(data)
      const now = new Date()

      let id = created.get(key) ?? null
      const existing = id ? null : await applicants.findOne({ key })
      if (existing) {
        id = existing._id
        if (snapshotChanged(existing, snap) || existing.lastOffer !== offer._id) {
          if (!dryRun) {
            await applicants.updateOne(
              { _id: id },
              { $set: { ...snap, lastOffer: offer._id, updatedAt: now } },
            )
          }
        }
      } else if (!id) {
        id = new ObjectId()
        created.set(key, id)
        if (!dryRun) {
          await applicants.insertOne({
            _id: id,
            key,
            ...snap,
            lastOffer: offer._id,
            createdAt: now,
            updatedAt: now,
          } as ApplicantRow)
        }
        console.log(`  new applicant  ${snap.name || key}`)
      }

      if (String(offer.applicant ?? '') !== String(id)) {
        if (!dryRun) await offers.updateOne({ _id: offer._id }, { $set: { applicant: id } })
        linked++
        console.log(`  ${dryRun ? 'would link' : 'linked'}  ${label}  ->  ${snap.name || key}`)
      }
    }

    console.log(
      `\n${linked} offer(s) ${dryRun ? 'would be ' : ''}linked, ${created.size} applicant(s) ${dryRun ? 'would be ' : ''}created, ${skipped} skipped.` +
        (dryRun ? '\nDry run — nothing was written.' : ''),
    )
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

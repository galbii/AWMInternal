// beforeChange: keep `applicant` pointing at the person this offer is for.
//
// Runs only on writes that carry the form (`data.data`): the records sync and
// the create path. Assignment and reorder updates never touch the link.
//
// Matching, in order (rules in src/lib/offers/applicant.ts):
//  1. an applicant already on file under this offer's key (email, else name);
//  2. otherwise the applicant this offer is ALREADY linked to, re-keyed — an
//     email added to a draft, a typo fixed — but only while no other offer
//     shares them. If others do, this offer has been re-purposed for a new
//     person and gets a new row rather than renaming everyone's;
//  3. otherwise a new applicant.
// The matched row's identity fields are refreshed from this offer (the latest
// save is the latest truth) and `lastOffer` records where they came from.
//
// Best-effort like the audit hook: a failure is logged, never allowed to
// abort the user's save. Every Local API call passes `req` so it runs inside
// the sync route's transaction.

import type { CollectionBeforeChangeHook } from 'payload'

import { applicantKey, applicantSnapshot, snapshotChanged } from '@/lib/offers/applicant'
import type { OfferData } from '@/lib/offers/types'

import { idOf } from './syncOfferMeta'

export const linkApplicant: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const d = data as Record<string, unknown>
  const form = d.data
  if (!form || typeof form !== 'object' || Array.isArray(form)) return d

  const offerData = form as OfferData
  const key = applicantKey(offerData)
  const orig = (originalDoc ?? {}) as Record<string, unknown>
  const currentId = idOf(d.applicant ?? orig.applicant)
  // An empty draft has nothing to key on: leave whatever link exists alone.
  if (!key) return d

  const offerId = typeof orig.id === 'string' ? orig.id : typeof d.id === 'string' ? d.id : ''
  const snap = applicantSnapshot(offerData)
  const { payload } = req

  try {
    const byKey = await payload.find({
      collection: 'applicants',
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      req,
    })
    let target = byKey.docs[0] ?? null

    if (!target && currentId) {
      const cur = await payload.findByID({
        collection: 'applicants',
        id: currentId,
        depth: 0,
        disableErrors: true,
        req,
      })
      if (cur) {
        const shared = await payload.find({
          collection: 'offer-requests',
          where: {
            and: [
              { applicant: { equals: currentId } },
              ...(offerId ? [{ id: { not_equals: offerId } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
          select: { id: true },
          req,
        })
        if (!shared.docs.length) target = cur
      }
    }

    if (target) {
      const stale =
        target.key !== key ||
        snapshotChanged(target, snap) ||
        (offerId !== '' && idOf(target.lastOffer) !== offerId)
      if (stale) {
        await payload.update({
          collection: 'applicants',
          id: target.id,
          data: { key, ...snap, ...(offerId ? { lastOffer: offerId } : {}) },
          depth: 0,
          req,
        })
      }
      d.applicant = String(target.id)
    } else {
      const created = await payload.create({
        collection: 'applicants',
        data: { key, ...snap, lastOffer: offerId || null },
        depth: 0,
        req,
      })
      d.applicant = String(created.id)
    }
  } catch (err) {
    payload.logger.error({ err, msg: `applicant link failed for ${offerId || '(new offer)'}` })
  }

  return d
}

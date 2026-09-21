// Applicant identity, derived from an offer's form data.
//
// An applicant is one PERSON across any number of offers (a re-offer after a
// declined letter, a duplicate request, a returning hire). The `applicants`
// collection is maintained server-side by the offer-requests `linkApplicant`
// hook and by scripts/backfill-applicants.ts, both of which take their rules
// from here so "which person is this" is decided in one pure, tested place.
//
// Identity: the new hire's email when there is one, otherwise their name.
// Nothing here is ever typed by hand — the offer form (group A) is the source
// and the applicant row mirrors the most recently saved offer.

import type { OfferData } from '@/lib/offers/types'

export interface ApplicantSnapshot {
  name: string
  preferredName: string
  email: string
  phone: string
  address: string
  nmls: string
}

const t = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

export function normalizeEmail(v: string | null | undefined): string {
  return t(v).toLowerCase()
}

export function normalizeName(v: string | null | undefined): string {
  return t(v).toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The lookup key an applicant row is found by: `email:<addr>` when the form has
 * an email, else `name:<full name>`. '' when there is nothing to key on (an
 * empty draft), in which case no link is made or changed.
 */
export function applicantKey(d: OfferData): string {
  const email = normalizeEmail(d.email)
  if (email) return 'email:' + email
  const name = normalizeName(d.employeeName)
  return name ? 'name:' + name : ''
}

/** The identity fields mirrored onto the applicant row (Q1–Q6 of the form). */
export function applicantSnapshot(d: OfferData): ApplicantSnapshot {
  return {
    name: t(d.employeeName),
    preferredName: t(d.preferredName),
    email: t(d.email),
    phone: t(d.phone),
    address: t(d.fullAddress),
    nmls: t(d.nmls),
  }
}

const SNAPSHOT_KEYS: (keyof ApplicantSnapshot)[] = [
  'name',
  'preferredName',
  'email',
  'phone',
  'address',
  'nmls',
]

/** True when writing `next` over `current` would change a mirrored field. */
export function snapshotChanged(
  current: Partial<Record<keyof ApplicantSnapshot, string | null | undefined>>,
  next: ApplicantSnapshot,
): boolean {
  return SNAPSHOT_KEYS.some((k) => t(current[k]) !== next[k])
}

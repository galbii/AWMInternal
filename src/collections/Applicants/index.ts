// Applicants — one row per PERSON, across however many offers they have had.
//
// Nobody types these in. The offer-requests `linkApplicant` hook keeps the
// identity fields mirrored from the most recently saved offer's group A
// (name, email, phone, address, NMLS) and points `applicant` on that offer at
// this row; `scripts/backfill-applicants.ts` does the same for offers that
// predate the collection. `notes` is the one hand-written field and is never
// touched by a sync.
//
// Identity is decided by src/lib/offers/applicant.ts (`key`: the email when
// there is one, else the name) — see that file before changing the matching.
//
// REST stays open (unlike offer-requests): the admin relationship picker and
// the join table below read through it, and HR may keep notes here directly.

import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDev } from '../../access/roles'

export const Applicants: CollectionConfig = {
  slug: 'applicants',
  access: {
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: adminOrDev,
  },
  graphQL: false,
  admin: {
    group: 'Offers',
    description:
      'One row per person. Identity fields mirror their latest saved offer; only Notes is edited here.',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'phone', 'lastOffer', 'updatedAt'],
  },
  defaultSort: 'name',
  fields: [
    {
      // 'email:<addr>' or 'name:<full name>' — see applicantKey(). Indexed, not
      // unique: a unique index would turn a rare same-instant double save into
      // an aborted offer transaction; the hook always takes the first match.
      name: 'key',
      type: 'text',
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Mirrored from Q1 of the latest saved offer.' },
    },
    { name: 'preferredName', type: 'text', admin: { description: 'Mirrored from Q2.' } },
    {
      // `text`, not `email`: the form accepts whatever HR typed, and a format
      // rejection here would abort the offer save it is riding on.
      name: 'email',
      type: 'text',
      index: true,
      admin: { description: 'Mirrored from Q3.' },
    },
    { name: 'phone', type: 'text', admin: { description: 'Mirrored from Q4.' } },
    { name: 'address', type: 'textarea', admin: { description: 'Mirrored from Q5.' } },
    { name: 'nmls', type: 'text', admin: { description: 'Mirrored from Q6.' } },
    {
      name: 'notes',
      type: 'textarea',
      admin: { description: 'Hand-written. Never overwritten by an offer save.' },
    },
    {
      name: 'lastOffer',
      type: 'relationship',
      relationTo: 'offer-requests',
      admin: { readOnly: true, description: 'The offer these identity fields were last mirrored from.' },
    },
    {
      // Virtual: every offer whose `applicant` points here. Rendered in /admin
      // through a server function, so it works although offer-requests keeps
      // its REST endpoints closed.
      name: 'offers',
      type: 'join',
      collection: 'offer-requests',
      on: 'applicant',
      admin: { defaultColumns: ['employeeName', 'stage', 'status', 'updated'] },
    },
  ],
  timestamps: true,
}

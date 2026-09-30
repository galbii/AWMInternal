// Offer & New Hire requests — the server home of the app's frozen OfferRecord
// shape (src/lib/offers/types.ts). The app at "/" owns these documents through
// /api/offer-records; /admin is a read-mostly audit surface.
//
// PARITY: `data` stays an untyped json blob on purpose. The 68 field
// definitions live in src/lib/offers/schema.ts (single source of truth for
// validation, xlsx headers, and rendering); typing them here would duplicate
// that schema and let Payload coerce/reformat the literal strings the letter
// text depends on. Unknown keys from old backups must survive round-trips.

import type { Access, CollectionConfig, Where } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDevFieldAccess, hasRole } from '../../access/roles'
import type { User } from '@/payload-types'

import { linkApplicant } from './hooks/linkApplicant'
import { recordOfferDeletion, recordOfferEvents } from './hooks/recordOfferEvents'
import { syncOfferMeta } from './hooks/syncOfferMeta'

/**
 * Deleting an offer is admin/dev — EXCEPT your own unsaved-by-hand draft.
 *
 * Without the exception, "+ New Request" → type → Cancel is broken for every
 * plain user: the client drops the record, `/api/offer-records` refuses the
 * removal with overrideAccess:false, and the draft quietly survives in Mongo
 * to reappear on the next load. Cancel is the population's main exit, so the
 * rule has to admit it.
 *
 * Kept as narrow as it can be — YOUR row (`createdBy`), and only while it is
 * still a `draft`. A complete record, or anyone else's, stays admin/dev. Public
 * /apply submissions have no `createdBy` at all, so they are never matched.
 */
export const deleteOfferRequest: Access<User> = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin', 'dev')) return true
  const own: Where = {
    and: [{ createdBy: { equals: user.id } }, { status: { equals: 'draft' } }],
  }
  return own
}

export const OfferRequests: CollectionConfig = {
  slug: 'offer-requests',
  // Access Option A ("shared workspace"): every logged-in user reads/edits all
  // offers; admin/dev delete and manage assignments, with ONE exception for
  // your own draft (see deleteOfferRequest). Flipping to "need to know" later
  // is a swap of these functions — the indexed `assignedUsers` mirror below
  // already supports the Where constraint.
  access: {
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: deleteOfferRequest,
  },
  // The app's own authenticated route handler is the only door.
  endpoints: false,
  graphQL: false,
  admin: {
    group: 'Offers',
    description: 'Owned by the Offer Manager app at "/" — edit there, not here.',
    useAsTitle: 'employeeName',
    defaultColumns: ['employeeName', 'stage', 'status', 'updated'],
  },
  defaultSort: 'pos',
  // versions deliberately OFF: change history lives in `offer-events`
  // (versions snapshot every 600ms autosave, record no actor, and copy the
  // multi-KB letterHtml per snapshot).
  hooks: {
    beforeChange: [syncOfferMeta, linkApplicant],
    afterChange: [recordOfferEvents],
    afterDelete: [recordOfferDeletion],
  },
  fields: [
    // Custom text ID — the app's client-generated uid() ('r' + base36) is the
    // Mongo _id verbatim. Frozen contract; backups and letterSig depend on it.
    { name: 'id', type: 'text', required: true, admin: { readOnly: true } },

    {
      name: 'employeeName',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'Denormalized from data.employeeName.' },
    },

    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Complete', value: 'complete' },
        { label: 'Draft', value: 'draft' },
      ],
    },
    {
      name: 'stage',
      type: 'select',
      index: true,
      options: [
        { label: 'Pipeline', value: 'pipeline' },
        { label: 'Hired', value: 'hired' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { description: 'Absent = pipeline (frozen record shape).' },
    },

    // App-managed ISO strings. Deliberately `text`, not `date`: intake carries
    // sub.submitted verbatim (src/lib/offers/intake.ts), which a date field
    // would coerce or reject. Payload's createdAt/updatedAt cover admin sorting.
    { name: 'created', type: 'text', required: true },
    { name: 'updated', type: 'text', required: true, index: true },

    {
      name: 'data',
      type: 'json',
      required: true,
      jsonSchema: {
        uri: 'awm://offers/offer-data.json',
        fileMatch: ['awm://offers/offer-data.json'],
        // Generates `{ [k: string]: string }` in payload-types.ts — OfferData.
        schema: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },

    // StoredLetterConfig — deep-partial override blob (rows are always
    // re-derived at render time; see src/lib/offers/letter.ts resolveLetter).
    { name: 'letter', type: 'json' },
    // Generated/hand-edited letter HTML. textarea so /admin shows readable markup.
    { name: 'letterHtml', type: 'textarea' },
    { name: 'letterStale', type: 'checkbox' },

    // Client array order is display order (frozen behavior: newest prepended,
    // imports/restores preserve relative order). The app's storage seam writes
    // this index; the list endpoint sorts by it.
    { name: 'pos', type: 'number', index: true, admin: { hidden: true } },

    {
      name: 'assignments',
      type: 'array',
      labels: { singular: 'Assignment', plural: 'Assignments' },
      access: {
        create: adminOrDevFieldAccess,
        update: adminOrDevFieldAccess,
      },
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true },
        {
          name: 'role',
          type: 'select',
          options: [
            { label: 'Recruiter', value: 'recruiter' },
            { label: 'Hiring manager', value: 'hiring-manager' },
            { label: 'HR', value: 'hr' },
            { label: 'Approver', value: 'approver' },
            { label: 'Observer', value: 'observer' },
          ],
        },
        {
          name: 'roleOther',
          type: 'text',
          admin: { description: 'Free-text role when none of the presets fit.' },
        },
        { name: 'assignedAt', type: 'date', admin: { readOnly: true } },
        { name: 'assignedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      ],
    },
    // Flat mirror of assignments[].user, maintained by syncOfferMeta — the
    // single indexed field access queries and "assigned to me" filter on.
    {
      name: 'assignedUsers',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      index: true,
      admin: { readOnly: true, hidden: true },
    },

    // The person this offer is for — one `applicants` row per human across
    // all their offers. Owned by the linkApplicant hook (keyed on the form's
    // email, else name); never set from the client blob, never edited by hand.
    {
      name: 'applicant',
      type: 'relationship',
      relationTo: 'applicants',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: "Linked automatically from the new hire's email (or name) on every save.",
      },
    },

    // PUSH TO HR (2026-09-29) — the handoff from the `hiring` app to `offers`.
    // Deliberately BESIDE the frozen OfferRecord shape, exactly like
    // `assignments`: toOfferDoc() never writes these, so the client blob can
    // neither set nor clobber them and the byte-stable round trip is untouched
    // (tests/int/offers/payload-doc.int.spec.ts). /api/offer-push is the door.
    //
    // A letter is official only when this is true AND the viewer may issue —
    // see src/lib/offers/official.ts.
    {
      name: 'pushedToHr',
      type: 'checkbox',
      index: true,
      admin: {
        readOnly: true,
        description: 'Handed to HR for a final letter. Set from the app, never by hand.',
      },
    },
    { name: 'pushedAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'pushedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },

    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true },
    },
    { name: 'updatedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
  ],
  timestamps: true,
}

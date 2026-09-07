// Offer & New Hire requests — the server home of the app's frozen OfferRecord
// shape (src/lib/offers/types.ts). The app at "/" owns these documents through
// /api/offer-records; /admin is a read-mostly audit surface.
//
// PARITY: `data` stays an untyped json blob on purpose. The 68 field
// definitions live in src/lib/offers/schema.ts (single source of truth for
// validation, xlsx headers, and rendering); typing them here would duplicate
// that schema and let Payload coerce/reformat the literal strings the letter
// text depends on. Unknown keys from old backups must survive round-trips.

import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDev, adminOrDevFieldAccess } from '../../access/roles'
import { recordOfferDeletion, recordOfferEvents } from './hooks/recordOfferEvents'
import { syncOfferMeta } from './hooks/syncOfferMeta'

export const OfferRequests: CollectionConfig = {
  slug: 'offer-requests',
  // Access Option A ("shared workspace"): every logged-in user reads/edits all
  // offers; only admin/dev delete or manage assignments. Flipping to
  // "need to know" later is a swap of these three functions — the indexed
  // `assignedUsers` mirror below already supports the Where constraint.
  access: {
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: adminOrDev,
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
    beforeChange: [syncOfferMeta],
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

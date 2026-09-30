// Append-only audit trail for offer-requests. Rows are written ONLY by the
// offer-requests hooks (Local API, no user-facing write path). The timeline on
// /offers/[id] reads them newest-first.
//
// `offerId` is plain text (not a relationship) so deletion events survive the
// offer itself being deleted.

import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDev } from '../../access/roles'

export const OfferEvents: CollectionConfig = {
  slug: 'offer-events',
  access: {
    create: () => false,
    update: () => false,
    read: authenticated,
    delete: adminOrDev,
  },
  endpoints: false,
  graphQL: false,
  admin: {
    group: 'Offers',
    description: 'Change history — written automatically, never by hand.',
    useAsTitle: 'summary',
    defaultColumns: ['offerTitle', 'kind', 'actor', 'createdAt'],
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'offerId', type: 'text', required: true, index: true },
    { name: 'offerTitle', type: 'text' },
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Created', value: 'created' },
        { label: 'Field edit', value: 'field-edit' },
        { label: 'Stage change', value: 'stage-change' },
        { label: 'Letter updated', value: 'letter-updated' },
        { label: 'Emailed', value: 'email-sent' },
        { label: 'Note', value: 'note' },
        { label: 'Pushed to HR', value: 'pushed-to-hr' },
        { label: 'Returned to hiring', value: 'returned-to-hiring' },
        { label: 'Assigned', value: 'assigned' },
        { label: 'Unassigned', value: 'unassigned' },
        { label: 'Assignment role change', value: 'assignment-role-change' },
        { label: 'Deleted', value: 'deleted' },
      ],
    },
    // DUAL ATTRIBUTION (2026-09-29). `actor` is ALWAYS the real human. When an
    // admin is ACTING as someone (view-as in write mode), the write itself runs
    // as that person — so `actingAs` names them and the feed reads
    // "Chance (as Dana)". Recording only the emulated identity would forge the
    // trail; recording only the admin would hide whose limits applied.
    { name: 'actor', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'actingAs',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, description: 'Set when the actor was acting as this user.' },
    },
    { name: 'summary', type: 'text' },
    {
      name: 'changes',
      type: 'array',
      fields: [
        { name: 'field', type: 'text', required: true },
        { name: 'label', type: 'text' },
        { name: 'from', type: 'text' },
        { name: 'to', type: 'text' },
      ],
    },
    { name: 'targetUser', type: 'relationship', relationTo: 'users' },
    { name: 'targetRole', type: 'text' },
    // Rolling coalescing window (field-edit / letter-updated): while now <
    // windowEndsAt, further edits by the same actor merge into this row.
    { name: 'windowEndsAt', type: 'date', index: true, admin: { hidden: true } },
    { name: 'editCount', type: 'number', defaultValue: 1, admin: { hidden: true } },
  ],
  timestamps: true,
}

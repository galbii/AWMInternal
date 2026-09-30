// Who viewed or acted as whom, and when.
//
// Before this, entering "view as" left NO trace: the cookie was set, the admin
// saw someone else's dashboard, and nothing recorded it. That was tolerable
// while emulation was read-only. It is not tolerable now that `act` mode can
// write, so every mode change is a row here.
//
// Written only by /api/emulate with overrideAccess (the actor is an admin, but
// the row must land whatever the collection's own access says). Nobody edits
// these by hand — that is the point of an audit table.

import type { CollectionConfig } from 'payload'

import { adminOrDev } from '../../access/roles'

export const EmulationEvents: CollectionConfig = {
  slug: 'emulation-events',
  access: {
    read: adminOrDev,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    group: 'Administration',
    description: 'View-as / act-as sessions. Append-only.',
    useAsTitle: 'summary',
    defaultColumns: ['summary', 'action', 'mode', 'createdAt'],
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'target', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Started', value: 'start' },
        { label: 'Changed mode', value: 'mode' },
        { label: 'Stopped', value: 'stop' },
      ],
    },
    {
      name: 'mode',
      type: 'select',
      options: [
        { label: 'View only', value: 'view' },
        { label: 'Acting (writes allowed)', value: 'act' },
      ],
    },
    { name: 'summary', type: 'text' },
  ],
  timestamps: true,
}

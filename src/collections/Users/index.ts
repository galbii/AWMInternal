import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDev, adminOrDevFieldAccess, selfOrAdminOrDev } from '../../access/roles'

// The very first account (created through /admin's create-first-user flow)
// gets every role — otherwise nobody could ever grant roles or manage users.
const bootstrapFirstUser: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  // Deliberately NOT passing `req`: Mongo cannot run `count` inside the
  // create's multi-document transaction (OperationNotSupportedInTransaction).
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    overrideAccess: true,
  })
  if (totalDocs === 0) data.roles = ['dev', 'admin', 'user']
  return data
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: adminOrDev,
    delete: adminOrDev,
    read: selfOrAdminOrDev,
    update: selfOrAdminOrDev,
  },
  admin: {
    defaultColumns: ['name', 'email', 'roles'],
    useAsTitle: 'name',
  },
  auth: {
    // 8h — one workday for the internal dashboard; the Payload default is 2h.
    tokenExpiration: 60 * 60 * 8,
  },
  hooks: {
    beforeChange: [bootstrapFirstUser],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['user'],
      saveToJWT: true,
      options: [
        { label: 'Developer', value: 'dev' },
        { label: 'Admin', value: 'admin' },
        { label: 'User', value: 'user' },
      ],
      // Only admins/devs may grant roles — otherwise any user could promote themselves.
      access: {
        create: adminOrDevFieldAccess,
        update: adminOrDevFieldAccess,
      },
    },
    {
      name: 'emulationBlocked',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Prevent dev "view as" from emulating this account.' },
      access: {
        create: adminOrDevFieldAccess,
        update: adminOrDevFieldAccess,
      },
    },
  ],
  timestamps: true,
}

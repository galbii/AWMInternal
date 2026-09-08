import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { adminOrDev, adminOrDevFieldAccess, selfOrAdminOrDev } from '../../access/roles'
import {
  deriveUsername,
  slugifyUsername,
  uniqueUsername,
  validateUsername,
} from '../../lib/users/username'

/**
 * Every account needs a handle for its `/u/<username>` profile. This fills one
 * in on create and normalizes any hand-edited value, so no write path can
 * produce a user without a usable, unique handle.
 *
 * Like bootstrapFirstUser below, the uniqueness probe deliberately does NOT
 * pass `req`: Mongo refuses a read against the same multi-document transaction
 * the create is running inside.
 */
const ensureUsername: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const taken = async (candidate: string): Promise<boolean> => {
    const { totalDocs } = await req.payload.count({
      collection: 'users',
      overrideAccess: true,
      where: {
        and: [
          { username: { equals: candidate } },
          // On update, colliding with yourself is not a collision.
          ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
        ],
      },
    })
    return totalDocs > 0
  }

  const supplied = typeof data.username === 'string' ? data.username : ''

  if (supplied) {
    const normalized = slugifyUsername(supplied)
    const problem = validateUsername(normalized)
    if (problem) throw new Error(problem)
    // Unchanged handle on an update — nothing to probe.
    if (originalDoc && normalized === originalDoc.username) return data
    if (await taken(normalized)) throw new Error('That username is already taken.')
    data.username = normalized
    return data
  }

  // Nothing supplied: only invent one when the doc doesn't already have it.
  if (operation === 'create' || !originalDoc?.username) {
    const base = deriveUsername(
      typeof data.email === 'string' ? data.email : originalDoc?.email,
      typeof data.name === 'string' ? data.name : originalDoc?.name,
    )
    data.username = await uniqueUsername(base, taken)
  }

  return data
}

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
    defaultColumns: ['name', 'username', 'email', 'roles'],
    useAsTitle: 'name',
  },
  auth: {
    // 8h — one workday for the internal dashboard; the Payload default is 2h.
    tokenExpiration: 60 * 60 * 8,
  },
  hooks: {
    beforeChange: [bootstrapFirstUser, ensureUsername],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      // The /u/<username> handle. NOT `unique: true`: a unique Mongo index
      // treats every pre-existing doc's missing value as null and collides on
      // the second one, so the index would fail to build on an existing
      // database. `ensureUsername` owns uniqueness on every write instead, and
      // `index: true` keeps the lookup fast.
      name: 'username',
      type: 'text',
      index: true,
      admin: {
        description: 'Profile handle — the /u/<username> URL. Lowercase, no spaces.',
      },
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

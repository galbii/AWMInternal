// WebAuthn credentials. One row per authenticator a person has registered —
// a laptop's Touch ID, a phone, a hardware key.
//
// Rows are written ONLY by the ceremony routes under /api/passkey, which pass
// `overrideAccess: true` deliberately: create/update are closed to everyone
// here, because a passkey is only meaningful if the bytes in it came from a
// verified attestation, never from a form. Reading and deleting stay open to
// the owner (and to admins/devs, who have to be able to clear a lost device).
//
// Nothing stored here is a secret — `publicKey` is a PUBLIC key and
// `credentialID` is a handle the authenticator hands out. The security of the
// scheme is in the signature check, not in hiding these.

import type { Access, CollectionConfig } from 'payload'

import { hasRole } from '../../access/roles'

/** The `user` field's equivalent of selfOrAdminOrDev in src/access/roles.ts. */
const ownerOrAdminOrDev: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin', 'dev')) return true
  return { user: { equals: user.id } }
}

export const Passkeys: CollectionConfig = {
  slug: 'passkeys',
  access: {
    // Only the verified ceremony may mint a credential (routes use
    // overrideAccess: true). No API surface can forge one.
    create: () => false,
    // A passkey is immutable apart from its counter/lastUsedAt, which only the
    // auth/verify route touches — again with overrideAccess.
    update: () => false,
    read: ownerOrAdminOrDev,
    delete: ownerOrAdminOrDev,
  },
  endpoints: false,
  graphQL: false,
  admin: {
    group: 'Access',
    description: 'WebAuthn credentials — created automatically, never by hand.',
    useAsTitle: 'label',
    defaultColumns: ['label', 'user', 'deviceType', 'lastUsedAt', 'createdAt'],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      // Base64URL credential id straight from the authenticator. Unique +
      // indexed because usernameless sign-in has nothing else to go on: the
      // assertion arrives with only this id, and it must resolve to exactly
      // one credential.
      name: 'credentialID',
      type: 'text',
      required: true,
      index: true,
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: 'publicKey',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description: 'COSE public key, base64url-encoded (see src/lib/passkeys/credential.ts).',
      },
    },
    {
      // Signature counter. Some authenticators keep it at 0 forever; those
      // that do increment it let us notice a cloned credential.
      name: 'counter',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      // json, not a select: the transport list is an open WebAuthn enum that
      // grows ('usb', 'nfc', 'ble', 'internal', 'hybrid', 'cable', …) and it
      // is only ever handed straight back to the browser as a hint.
      name: 'transports',
      type: 'json',
      admin: { readOnly: true },
    },
    {
      name: 'deviceType',
      type: 'text',
      admin: { readOnly: true, description: '"singleDevice" or "multiDevice".' },
    },
    {
      name: 'backedUp',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true, description: 'Synced to a passkey provider (iCloud, Google, …).' },
    },
    {
      name: 'label',
      type: 'text',
      defaultValue: 'Passkey',
      admin: { description: 'What the person calls this device, e.g. "MacBook Pro".' },
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
}

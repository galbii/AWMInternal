// Shape-shifting between what WebAuthn hands us and what the `passkeys`
// collection stores — plus the ONE summary shape every passkey route returns.
//
// A COSE public key is raw bytes; Mongo would happily take a Buffer, but a
// base64url string round-trips through JSON, the Payload admin UI, and
// backups without surprises. base64url (not plain base64) keeps it in the same
// alphabet as every other WebAuthn identifier, including `credentialID`.

import type { Uint8Array_ } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

/** Bit 3 of the authenticator flags: can this credential ever be synced? */
export type PasskeyDeviceType = 'multiDevice' | 'singleDevice'

/**
 * What every route hands back to the browser. Deliberately excludes
 * `credentialID`, `publicKey` and `counter` — the UI has no use for them and
 * they are the only fields worth not spraying around.
 */
export interface PasskeySummary {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  deviceType: PasskeyDeviceType
  backedUp: boolean
}

/** The subset of a passkey doc the summary needs. Kept structural so the */
/** generated `Passkey` type satisfies it without an import cycle. */
export interface PasskeyDocLike {
  id: number | string
  label?: null | string
  createdAt: string
  lastUsedAt?: null | string
  deviceType?: null | string
  backedUp?: boolean | null
}

export const encodePublicKey = (key: Uint8Array_): string => isoBase64URL.fromBuffer(key)

export const decodePublicKey = (encoded: string): Uint8Array_ => isoBase64URL.toBuffer(encoded)

/** `transports` is stored as untyped json — narrow it back to what */
/** SimpleWebAuthn accepts (`string[]`), or undefined if it was never recorded. */
export function normalizeTransports(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const transports = value.filter((t): t is string => typeof t === 'string')
  return transports.length ? transports : undefined
}

const isDeviceType = (value: unknown): value is PasskeyDeviceType =>
  value === 'multiDevice' || value === 'singleDevice'

/** A relationship field is an id or a populated doc, depending on `depth`. */
export function relationshipId(value: unknown): null | string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

export function toPasskeySummary(doc: PasskeyDocLike): PasskeySummary {
  return {
    id: String(doc.id),
    label: doc.label || 'Passkey',
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt ?? null,
    // Older/odd authenticators may not report it; "this device only" is the
    // conservative thing to tell someone about where their key lives.
    deviceType: isDeviceType(doc.deviceType) ? doc.deviceType : 'singleDevice',
    backedUp: doc.backedUp === true,
  }
}

/** Trimmed to something a Mongo text field and a UI list can both live with. */
export function sanitizeLabel(value: unknown): string {
  if (typeof value !== 'string') return 'Passkey'
  const label = value.trim().slice(0, 60)
  return label || 'Passkey'
}

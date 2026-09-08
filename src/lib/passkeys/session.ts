// Turning a verified passkey assertion into a real Payload session.
//
// `payload.login()` is the normal door and it is closed to us: it REQUIRES a
// password. So this replicates exactly what the login operation does after it
// has decided the person is who they say they are —
// `node_modules/payload/dist/auth/operations/login.js`, the block that runs
// addSessionToUser -> getFieldsToSign -> jwtSign -> generatePayloadCookie.
//
// The session row is not optional bookkeeping. `useSessions` defaults to true
// in Payload 3.88, and payload.auth() rejects a JWT whose `sid` has no
// matching entry in `user.sessions` — a token minted without one would look
// perfectly valid and still fail on every request. `addSessionToUser` is not
// exported from the package root, so its behaviour is reproduced here:
// expired sessions are dropped, the new one is appended.

import { getFieldsToSign, jwtSign, type Payload } from 'payload'
import { generatePayloadCookie } from 'payload/shared'

import type { User } from '@/payload-types'

/** Only reached if a config somehow omits it; Users sets 8h explicitly. */
const FALLBACK_TOKEN_EXPIRATION = 60 * 60 * 2

interface StoredSession {
  id: string
  createdAt: Date
  expiresAt: Date
}

/**
 * Records a fresh session on the user and returns the `Set-Cookie` value that
 * authenticates it. The caller decides how to attach it — nothing here writes
 * to the response.
 */
export async function createSessionCookie(payload: Payload, user: User): Promise<string> {
  const collection = payload.collections['users']
  if (!collection) throw new Error('The `users` collection is not registered.')
  const collectionConfig = collection.config

  const tokenExpiration = collectionConfig.auth.tokenExpiration ?? FALLBACK_TOKEN_EXPIRATION
  const now = new Date()
  // crypto.randomUUID() rather than the `uuid` package Payload uses: it is a
  // Node/Web global here and not a dependency this app declares.
  const sid = crypto.randomUUID()

  const existing = Array.isArray(user.sessions) ? user.sessions : []
  const sessions: StoredSession[] = [
    ...existing
      .filter((session) => new Date(session.expiresAt) > now)
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt ? new Date(session.createdAt) : now,
        expiresAt: new Date(session.expiresAt),
      })),
    { id: sid, createdAt: now, expiresAt: new Date(now.getTime() + tokenExpiration * 1000) },
  ]

  // Only `sessions` is sent. Payload's own helper posts the whole user doc,
  // but the Mongo adapter turns this into a `$set`, so naming just the one
  // field cannot disturb `hash`/`salt` or anything else on the account.
  // `updatedAt: null` is Payload's documented signal for "leave the timestamp
  // alone" — the adapter deletes the key rather than writing null. Signing in
  // is not an edit to the user record.
  await payload.db.updateOne({
    collection: 'users',
    id: user.id,
    data: { sessions, updatedAt: null },
    returning: false,
  })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: user.email,
    sid,
    user: { ...user, collection: 'users' },
  })
  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration })

  return generatePayloadCookie({
    collectionAuthConfig: collectionConfig.auth,
    cookiePrefix: payload.config.cookiePrefix,
    token,
  })
}

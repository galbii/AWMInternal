// The gate every passkey-management route starts with.
//
// View-as is READ-ONLY, and for passkeys that has to be absolute: an admin
// emulating someone must never be able to enrol a credential onto that
// account (which would be a permanent backdoor), nor delete one out from
// under them. Even the read paths refuse while emulating — the manager UI
// treats a 403 as "you are viewing as someone else" and says so.
//
// Every passkey route therefore acts as the ACTOR, never the viewer.

import { deny, getViewer, type Viewer } from '@/lib/auth/viewer'

export const EMULATION_MESSAGE =
  'Read-only: you are viewing as another user. Exit view-as to manage passkeys.'

/** Returns the viewer, or the Response to send instead. */
export async function requirePasskeyActor(): Promise<Response | Viewer> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (v.isEmulating) return deny(403, EMULATION_MESSAGE)
  return v
}

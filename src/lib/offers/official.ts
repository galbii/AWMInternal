// WHO MAY ISSUE A FINAL OFFER LETTER — the one place that answers it.
//
// The Offer Manager ships as TWO hub apps over ONE `offer-requests` collection:
//
//   `hiring`  Hiring & branch managers. They raise requests, fill in the
//             42 questions and preview the letter — but every letter they
//             generate is stamped SAMPLE, because nothing they produce has
//             been through HR. When the request is ready they PUSH IT TO HR.
//   `offers`  HR. Same app, same screens, plus the right to issue the final,
//             un-watermarked letter for a request that has been pushed.
//
// ACCESS IS APP MEMBERSHIP, NOT A ROLE (2026-09-29). `users.roles` stays
// `dev | admin | user` — a suite-wide axis that should not learn one app's
// vocabulary. Who may issue is `users.apps`, the list the registry, the
// directory, the profile editor and every app's own <AppMembers> roster
// already maintain through withApps(). Adding an HR person is putting them on
// the `offers` list.
//
// GRANTING IT IS ADMIN/DEV ONLY. Every door checks the same thing —
// /api/app-members (GET included), /api/directory, /api/profile's `apps`
// branch, and `users.apps`' own create/update field access. So an HR person
// who is only `user` + apps:['offers'] issues letters but cannot add anyone,
// and cannot even open the roster. If HR is to run its own membership, those
// people need the `admin` role as well — which also hands them view-as, the
// user directory and every other app, so it is a real decision, not a
// formality.
//
//   viewer                       | hiring | offers | may issue a final letter
//   -----------------------------|--------|--------|-------------------------
//   admin / dev                  |   ✔    |   ✔    | yes (opens every app)
//   HR         (apps: offers)    |        |   ✔    | yes, once pushed to HR
//   Hiring mgr (apps: hiring)    |   ✔    |        | NEVER — always SAMPLE
//   both       (apps: both)      |   ✔    |   ✔    | yes, once pushed to HR
//   neither                      |        |        | cannot open either app
//
// TWO PROPERTIES, BOTH REQUIRED. A letter is official only when HR HAS IT
// (`pushedToHr`) *and* THE VIEWER MAY ISSUE. The first half is why HR opening
// a request nobody pushed still sees SAMPLE: it has not been through the
// process, and who is looking does not change that.
//
// The capability is derived from the VIEWER's membership, never from the URL.
// Route-derived rules ("you are in /hiring, so you are stamped") are bypassed
// by typing the other URL; this one travels with the person, so a hiring
// manager who reaches an HR screen still cannot issue.
//
// UX FILTER, NOT A SECURITY BOUNDARY — the same rule the registry carries.
// Every route handler re-checks with getViewer(); see /api/offer-push and
// /api/offer-email. And note the watermark itself is a GUARDRAIL: the PDF is
// rendered in the browser (src/lib/offers/pdf.ts), so there is no server-side
// renderer to enforce it against someone with devtools open. It stops
// mistakes and shortcuts, not a determined actor.

import { isAppManager, userApps } from '@/lib/apps/registry'

/** The registry id of the HR app — membership on it IS the right to issue. */
export const HR_APP_ID = 'offers'

/** The registry id of the hiring-manager app. */
export const HIRING_APP_ID = 'hiring'

/**
 * May this person produce a final, un-watermarked letter at all?
 *
 * Takes a Payload user (server) — admins and devs open every app, so they
 * qualify without appearing on any list.
 */
export function mayIssueFinal(user: unknown): boolean {
  return isAppManager(user) || userApps(user).includes(HR_APP_ID)
}

/**
 * The client half: <AppShell> hands every app `isManager` and the VIEWER's
 * `apps`, so emulation is already accounted for — an admin viewing as a hiring
 * manager gets the hiring manager's answer.
 */
export function mayIssueFinalForShell(v: { isManager: boolean; apps: string[] }): boolean {
  return v.isManager || v.apps.includes(HR_APP_ID)
}

/**
 * Is THIS letter official? Both halves must hold.
 *
 * `pushedToHr` lives beside the frozen OfferRecord (like assignments), so it
 * arrives as a plain boolean rather than a field on the record.
 */
export function letterIsOfficial(pushedToHr: boolean, mayIssue: boolean): boolean {
  return pushedToHr === true && mayIssue === true
}

/** Why a letter is being stamped — surfaced in the UI so it is never a mystery. */
export type StampReason = 'not-pushed' | 'may-not-issue' | null

export function stampReason(pushedToHr: boolean, mayIssue: boolean): StampReason {
  if (!mayIssue) return 'may-not-issue'
  if (!pushedToHr) return 'not-pushed'
  return null
}

export const STAMP_TEXT: Record<Exclude<StampReason, null>, string> = {
  'may-not-issue': 'This letter is stamped SAMPLE. Push it to HR to have a final letter issued.',
  'not-pushed': 'This request has not been pushed to HR yet, so the letter is stamped SAMPLE.',
}

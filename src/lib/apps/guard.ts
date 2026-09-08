// The per-app auth gate. Every app's (authed) layout starts with one line:
//
//   const v = await requireApp('offers')
//
// It resolves { actor, viewer, isEmulating, payload } exactly as getViewer()
// does, redirecting to /login (with ?next= so the deep link survives sign-in)
// when there is no session, and to / when the signed-in user lacks the roles
// the registry declares for that app.
//
// Layouts are a UX gate, not a security boundary — the same rule the offers app
// already documents. Route handlers must still call getViewer() themselves and
// pass { user: viewer, overrideAccess: false } to Payload.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { canUseApp, getApp } from '@/lib/apps/registry'
import { getViewer, type Viewer } from '@/lib/auth/viewer'
import { PATHNAME_HEADER } from '@/middleware'

/**
 * The path the browser actually asked for, stamped by middleware.ts.
 *
 * Layouts get no `params`, so without this every gated deep link would
 * collapse to a hardcoded fallback and sign-in would drop the user somewhere
 * they didn't ask for. Falls back when the header is missing (a request that
 * bypassed the matcher).
 */
async function currentPath(fallback: string): Promise<string> {
  const value = (await headers()).get(PATHNAME_HEADER)
  // Same-origin paths only — never let a header turn into an open redirect.
  if (value && value.startsWith('/') && !value.startsWith('//')) return value
  return fallback
}

export async function requireApp(appId: string): Promise<Viewer> {
  const app = getApp(appId)
  if (!app) throw new Error(`requireApp('${appId}'): no such app in the registry.`)

  const v = await getViewer()
  // Use the real path, so /offers/<id> returns to that offer — not the app root.
  if (!v) redirect(`/login?next=${encodeURIComponent(await currentPath(app.href))}`)

  // Gate on the ACTOR, not the viewer: an admin emulating a plain user keeps
  // access to the app (the emulated session is read-only either way), which
  // keeps "view as" usable for debugging an app the target user can't open.
  if (!canUseApp(v.actor, app)) redirect('/')

  return v
}

/** Session-only gate for pages that belong to no app (the hub itself). */
export async function requireSession(nextPath = '/'): Promise<Viewer> {
  const v = await getViewer()
  if (!v) redirect(`/login?next=${encodeURIComponent(await currentPath(nextPath))}`)
  return v
}

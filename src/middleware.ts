// Stamps the request path onto a header so server components can read it.
//
// WHY: `requireApp()` / `requireSession()` run inside (authed) LAYOUTS, and a
// layout has no access to the URL it is rendering — Next gives `params` to
// pages, not layouts. Without this, every gated deep link collapsed to the
// layout's hardcoded fallback: hitting /u/chance signed-out sent you to
// /login?next=/ and dropped you on the hub instead of the profile you asked
// for. Same for /offers/<id>.
//
// This does NOT authenticate. Auth needs Payload and a database, which is far
// too heavy for middleware; the gate stays in the layouts and the route
// handlers. All this does is make the path visible to them.

import { NextResponse, type NextRequest } from 'next/server'

export const PATHNAME_HEADER = 'x-awm-pathname'

export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers)
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Skip static assets and API routes: route handlers resolve the viewer
  // themselves and answer with 401/403 rather than redirecting anywhere.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|api/).*)'],
}

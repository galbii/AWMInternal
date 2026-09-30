'use client'

// Which of the app's two doors is this tree rendered under?
//
// `hiring` and `offers` are ONE application served at two paths, so every
// in-app link has to stay inside the door the user came through — otherwise a
// hiring manager clicking a candidate's name lands in HR's app and is bounced
// by requireApp(). Five call sites used to hardcode '/offers', which is
// exactly the kind of thing that rots when a sixth is added.
//
// Derived from the pathname rather than a prop so no component has to thread
// it, and it cannot disagree with the URL the user is actually on.

import { usePathname } from 'next/navigation'

export type OfferAppBase = '/offers' | '/hiring'

export function useAppBase(): OfferAppBase {
  const path = usePathname() || ''
  return path.startsWith('/hiring') ? '/hiring' : '/offers'
}

/** The workspace URL for one request, under the current door. */
export function useOfferHref(): (id: string) => string {
  const base = useAppBase()
  return (id: string) => base + '/' + id
}

'use client'

// Which requests have been pushed to HR, and whether this viewer may push,
// return, or issue a final letter.
//
// Kept OUTSIDE the frozen OfferRecord shape for the same reason assignments
// are: records still round-trip byte-for-byte through /api/offer-records, and
// this context carries the handoff state beside them from /api/offer-push.
//
// `push()` is optimistic — the badge and the letter's stamp update at once,
// the POST follows, and a failure re-fetches the truth and returns false so
// the caller can toast.
//
// Without a provider `usePush()` returns an inert value whose `official` is
// FALSE: a tree that cannot prove a letter has been through HR must treat it
// as a draft. Deny by default, like ViewerProvider's ANON.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useViewer } from '@/components/shell/ViewerProvider'
import { letterIsOfficial, mayIssueFinalForShell, stampReason, type StampReason } from '@/lib/offers/official'

export interface PushState {
  pushedToHr: boolean
  pushedAt: string | null
  pushedBy: string | null
}

export interface PushApi {
  /** False until the first fetch resolves. */
  ready: boolean
  /** This viewer may hand requests to HR — and this door offers it (`allowPush`). */
  canPush: boolean
  /** This viewer may pull one back (HR only). */
  canReturn: boolean
  /** This viewer may produce a final, un-watermarked letter AT ALL. */
  mayIssueFinal: boolean
  /**
   * The manual Watermark tick (letter action bar, bulk selection bar) is
   * offered here: an issuer, on a door that composes `watermarkToggle`.
   */
  canToggleWatermark: boolean
  byOffer: Record<string, PushState>
  isPushed(id: string): boolean
  /**
   * Is THIS record's letter official — i.e. may it be generated without the
   * SAMPLE stamp? Both halves must hold (src/lib/offers/official.ts).
   */
  isOfficial(id: string): boolean
  /** Why a letter is being stamped, for the UI to explain itself. */
  whyStamped(id: string): StampReason
  /** Push (or, with push=false, return) every listed request. */
  push(ids: string[], push?: boolean): Promise<boolean>
  refresh(): Promise<void>
}

const URL = '/api/offer-push'

const INERT: PushApi = {
  ready: false,
  canPush: false,
  canReturn: false,
  mayIssueFinal: false,
  canToggleWatermark: false,
  byOffer: {},
  isPushed: () => false,
  isOfficial: () => false,
  whyStamped: () => 'may-not-issue',
  push: async () => false,
  refresh: async () => {},
}

const Ctx = createContext<PushApi>(INERT)

export const usePush = (): PushApi => useContext(Ctx)

interface Loaded {
  canPush: boolean
  canReturn: boolean
  mayIssueFinal: boolean
  byOffer: Record<string, PushState>
}

/**
 * `allowPush` is how a door's COMPOSITION decides whether it offers the
 * handoff: only the `hiring` pages pass it, so HR's /offers never shows Push
 * to HR (it is the hiring manager's action). It can only take the button
 * away — the server's `canPush` still has to agree — and it is a UX choice,
 * not a permission: /api/offer-push is unchanged.
 *
 * `watermarkToggle` is the same kind of switch for the manual Watermark tick
 * (2026-10-27): HR's /offers does NOT compose it, so nobody there can take a
 * stamp off a letter by hand — the stamp is the record's config plus the
 * SAMPLE rule, full stop. Only /hiring passes it.
 */
export function PushProvider({
  children,
  allowPush = false,
  watermarkToggle = false,
}: {
  children: React.ReactNode
  allowPush?: boolean
  watermarkToggle?: boolean
}) {
  const viewer = useViewer()
  // Seeded from membership so the first paint already stamps correctly; the
  // fetch confirms it (and is the value the server actually enforces).
  const seedMayIssue = mayIssueFinalForShell(viewer)

  const [ready, setReady] = useState(false)
  const [state, setState] = useState<Loaded>({
    canPush: false,
    canReturn: false,
    mayIssueFinal: seedMayIssue,
    byOffer: {},
  })

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(URL, { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as Loaded
      setState({
        canPush: allowPush && Boolean(data.canPush),
        canReturn: Boolean(data.canReturn),
        mayIssueFinal: Boolean(data.mayIssueFinal),
        byOffer: data.byOffer && typeof data.byOffer === 'object' ? data.byOffer : {},
      })
    } catch {
      /* nothing is marked pushed until the next refresh — the safe direction */
    } finally {
      setReady(true)
    }
  }, [allowPush])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const push = useCallback(
    async (ids: string[], on: boolean = true): Promise<boolean> => {
      if (!ids.length) return true
      const at = new Date().toISOString()
      setState((s) => {
        const byOffer = { ...s.byOffer }
        ids.forEach((id) => {
          byOffer[id] = {
            pushedToHr: on,
            pushedAt: on ? at : null,
            pushedBy: on ? viewer.id || null : null,
          }
        })
        return { ...s, byOffer }
      })
      try {
        const res = await fetch(URL, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids, push: on }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { byOffer?: Record<string, PushState> }
        if (data.byOffer) setState((s) => ({ ...s, byOffer: { ...s.byOffer, ...data.byOffer } }))
        return true
      } catch {
        await refresh()
        return false
      }
    },
    [refresh, viewer.id],
  )

  const api = useMemo<PushApi>(() => {
    const isPushed = (id: string): boolean => state.byOffer[id]?.pushedToHr === true
    return {
      ready,
      ...state,
      canToggleWatermark: watermarkToggle && state.mayIssueFinal,
      isPushed,
      isOfficial: (id: string) => letterIsOfficial(isPushed(id), state.mayIssueFinal),
      whyStamped: (id: string) => stampReason(isPushed(id), state.mayIssueFinal),
      push,
      refresh,
    }
  }, [ready, state, watermarkToggle, push, refresh])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

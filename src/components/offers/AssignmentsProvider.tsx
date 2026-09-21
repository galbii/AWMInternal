'use client'

// Who is assigned to which offer, for the LIST views. Kept OUTSIDE the frozen
// OfferRecord shape on purpose: records still round-trip byte-for-byte through
// the /api/offer-records seam, and this context carries the assignee map
// beside them from /api/offer-assignments.
//
// `assign()` is optimistic — the avatar stack updates at once, the POST
// follows, and a failure re-fetches the truth and returns false so the caller
// can toast. Without a provider (e.g. the /offers/[id] page, which has its own
// editor) `useAssignments()` returns an inert, read-only value.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { applyAssignmentEdit, type AssignmentEdit } from '@/lib/offers/assignments'

export interface Assignee {
  user: string
  label: string
  role: string
  roleOther: string
}

export interface AssignUser {
  id: string
  label: string
}

export interface AssignmentsApi {
  /** False until the first fetch resolves. */
  ready: boolean
  /** Admin/dev and not emulating. Everyone else sees the stacks read-only. */
  canAssign: boolean
  /** The VIEWER's user id — what "Assigned to me" means under view-as. */
  me: string | null
  /** People who can be assigned; empty unless `canAssign`. */
  users: AssignUser[]
  byOffer: Record<string, Assignee[]>
  /** Apply one add/remove edit to every listed offer. Resolves false on failure. */
  assign(ids: string[], edit: AssignmentEdit): Promise<boolean>
  refresh(): Promise<void>
}

const URL = '/api/offer-assignments'

const INERT: AssignmentsApi = {
  ready: false,
  canAssign: false,
  me: null,
  users: [],
  byOffer: {},
  assign: async () => false,
  refresh: async () => {},
}

const Ctx = createContext<AssignmentsApi>(INERT)

export const useAssignments = (): AssignmentsApi => useContext(Ctx)

interface Loaded {
  me: string | null
  canAssign: boolean
  users: AssignUser[]
  byOffer: Record<string, Assignee[]>
}

export function AssignmentsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<Loaded>({ me: null, canAssign: false, users: [], byOffer: {} })
  const usersRef = useRef<AssignUser[]>([])
  usersRef.current = state.users

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(URL, { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as Loaded
      setState({
        me: data.me ?? null,
        canAssign: Boolean(data.canAssign),
        users: Array.isArray(data.users) ? data.users : [],
        byOffer: data.byOffer && typeof data.byOffer === 'object' ? data.byOffer : {},
      })
    } catch {
      /* the list simply shows no assignees until the next refresh */
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const assign = useCallback(
    async (ids: string[], edit: AssignmentEdit): Promise<boolean> => {
      if (!ids.length) return true
      const labelOf = (id: string) => usersRef.current.find((u) => u.id === id)?.label || id
      const make = (user: string): Assignee => ({
        user,
        label: labelOf(user),
        role: '',
        roleOther: '',
      })
      setState((s) => {
        const byOffer = { ...s.byOffer }
        ids.forEach((id) => {
          byOffer[id] = applyAssignmentEdit(byOffer[id] ?? [], edit, make)
        })
        return { ...s, byOffer }
      })
      try {
        const res = await fetch(URL, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids, add: edit.add ?? [], remove: edit.remove ?? [] }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { byOffer?: Record<string, Assignee[]> }
        if (data.byOffer) setState((s) => ({ ...s, byOffer: { ...s.byOffer, ...data.byOffer } }))
        return true
      } catch {
        await refresh()
        return false
      }
    },
    [refresh],
  )

  const api = useMemo<AssignmentsApi>(
    () => ({ ready, ...state, assign, refresh }),
    [ready, state, assign, refresh],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

'use client'

// One client-side fetch of /api/offer-timeline for the whole /offers/[id]
// page: the header's applicant facts and assigned stack and the rail's
// activity feed all read from it. Deliberately NOT server-revalidated — a
// refresh here must never re-render the letter island.
//
// It follows the record on its own: when the record changes (an autosave
// lands, a stage moves) it refetches after a short settle, because the audit
// row is written by the save it rides on.

import { useCallback, useEffect, useRef, useState } from 'react'

import { useOffers } from '@/components/offers/OffersProvider'
import type { Stage } from '@/lib/offers/types'

export interface TimelineChange {
  field: string
  label: string
  from: string
  to: string
}

export interface TimelineEvent {
  id: string
  kind: string
  summary: string
  changes: TimelineChange[]
  targetLabel: string
  targetRole: string
  editCount: number
  actorLabel: string
  at: string
}

export interface ApplicantOffer {
  id: string
  title: string
  position: string
  branch: string
  stage: Stage
  status: 'complete' | 'draft'
  updated: string
}

export interface ApplicantInfo {
  id: string
  name: string
  preferredName: string
  email: string
  phone: string
  address: string
  nmls: string
  notes: string
  offers: ApplicantOffer[]
}

export interface AssignmentInfo {
  user: string
  label: string
  role: string
  roleOther: string
  assignedAt: string
  assignedByLabel: string
}

export interface OfferTimeline {
  events: TimelineEvent[]
  applicant: ApplicantInfo | null
  assignments: AssignmentInfo[]
  canAssign: boolean
}

/** The audit row is written by the save it rides on; give that save time to land. */
const SETTLE_MS = 2500

export function useOfferTimeline(recordId: string): {
  data: OfferTimeline | null
  error: string | null
  reload: () => void
} {
  const api = useOffers()
  const rec = api.records.find((r) => r.id === recordId) || null

  const [data, setData] = useState<OfferTimeline | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/offer-timeline?id=${encodeURIComponent(recordId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setError('Could not load activity.')
        return
      }
      setError(null)
      const body = (await res.json()) as Partial<OfferTimeline>
      setData({
        events: body.events || [],
        applicant: body.applicant || null,
        assignments: body.assignments || [],
        canAssign: Boolean(body.canAssign),
      })
    } catch {
      setError('Could not load activity.')
    }
  }, [recordId])

  useEffect(() => {
    void load()
  }, [load])

  const stamp = rec ? rec.updated + '|' + (rec.stage || 'pipeline') : ''
  const firstStamp = useRef(true)
  useEffect(() => {
    if (firstStamp.current) {
      firstStamp.current = false
      return
    }
    const t = window.setTimeout(() => {
      void load()
    }, SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [stamp, load])

  const reload = useCallback(() => {
    void load()
  }, [load])

  return { data, error, reload }
}

// beforeChange: keeps the server-side conveniences in sync with the frozen
// record payload — denormalized employeeName for the admin list, the flat
// assignedUsers mirror the access queries use, per-row assignedAt/assignedBy
// stamps, and createdBy/updatedBy attribution.

import type { CollectionBeforeChangeHook } from 'payload'

export const idOf = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: unknown }).id)
  return ''
}

interface AssignmentRow {
  user?: unknown
  role?: string | null
  roleOther?: string | null
  assignedAt?: string | null
  assignedBy?: unknown
  [k: string]: unknown
}

export const syncOfferMeta: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const d = data as Record<string, unknown>
  const orig = (originalDoc ?? {}) as Record<string, unknown>

  // Denormalize the candidate name out of the json blob for admin list views.
  const dataMap = (d.data ?? orig.data) as Record<string, unknown> | null | undefined
  if (dataMap && typeof dataMap === 'object') {
    d.employeeName = typeof dataMap.employeeName === 'string' ? dataMap.employeeName : ''
  }

  if (d.assignments !== undefined) {
    const prevRows: AssignmentRow[] = Array.isArray(orig.assignments)
      ? (orig.assignments as AssignmentRow[])
      : []
    const prev = new Map(prevRows.map((r) => [idOf(r.user), r]))
    const rows: AssignmentRow[] = Array.isArray(d.assignments)
      ? (d.assignments as AssignmentRow[])
      : []
    d.assignments = rows.map((r) => {
      const existing = prev.get(idOf(r.user))
      return existing
        ? { ...r, assignedAt: existing.assignedAt, assignedBy: idOf(existing.assignedBy) || null }
        : { ...r, assignedAt: new Date().toISOString(), assignedBy: req.user?.id ?? null }
    })
    d.assignedUsers = Array.from(
      new Set((d.assignments as AssignmentRow[]).map((r) => idOf(r.user)).filter(Boolean)),
    )
  } else if (operation === 'create') {
    d.assignedUsers = []
  }

  if (operation === 'create' && req.user) d.createdBy = req.user.id
  if (req.user) d.updatedBy = req.user.id

  return d
}

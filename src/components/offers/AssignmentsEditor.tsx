'use client'

// Self-contained assigned-users block: read-only list -> inline editor -> save.
// Used by the /offers/[id] sidebar and by the row "Edit" modal on the stage
// tables. Fetches its own data from /api/offer-timeline (only admin/dev get
// `canAssign: true` and the users list; everyone else sees the read-only list).

import React, { useCallback, useEffect, useState } from 'react'

export interface AssignmentDto {
  user: string
  label: string
  role: string
  roleOther: string
  assignedAt: string
  assignedByLabel: string
}

interface EditorData {
  assignments: AssignmentDto[]
  canAssign: boolean
  users: { id: string; label: string }[]
}

interface EditRow {
  user: string
  role: string
  roleOther: string
}

const ROLE_OPTIONS: [string, string][] = [
  ['', '(no role)'],
  ['recruiter', 'Recruiter'],
  ['hiring-manager', 'Hiring manager'],
  ['hr', 'HR'],
  ['approver', 'Approver'],
  ['observer', 'Observer'],
]

export const assignmentRoleText = (a: AssignmentDto): string => a.roleOther || a.role || ''

export default function AssignmentsEditor({
  recordId,
  onChanged,
}: {
  recordId: string
  /** Fired after a successful save — e.g. so a history panel can refresh. */
  onChanged?: () => void
}): React.JSX.Element {
  const [data, setData] = useState<EditorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/offer-timeline?id=${encodeURIComponent(recordId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setError('Could not load assignments.')
        return
      }
      setError(null)
      setData((await res.json()) as EditorData)
    } catch {
      setError('Could not load assignments.')
    }
  }, [recordId])

  useEffect(() => {
    setData(null)
    setEditing(false)
    void load()
  }, [load])

  const startEdit = (): void => {
    if (!data) return
    setRows(data.assignments.map((a) => ({ user: a.user, role: a.role, roleOther: a.roleOther })))
    setEditing(true)
  }

  const save = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/offer-timeline', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: recordId, assignments: rows.filter((r) => r.user) }),
      })
      if (res.ok) {
        setEditing(false)
        await load()
        if (onChanged) onChanged()
      } else {
        setError('Could not save assignments.')
      }
    } catch {
      setError('Could not save assignments.')
    }
    setSaving(false)
  }

  return (
    <div className="assign-editor">
      {error && <div className="od-error">{error}</div>}
      {!data && !error && <div className="od-dim">Loading…</div>}

      {data && !editing && (
        <>
          <ul className="od-assignees">
            {data.assignments.length === 0 && <li className="od-dim">No one assigned yet.</li>}
            {data.assignments.map((a) => (
              <li key={a.user}>
                <strong>{a.label}</strong>
                {assignmentRoleText(a) && <span className="od-role">{assignmentRoleText(a)}</span>}
                {a.assignedByLabel && <span className="od-dim"> · by {a.assignedByLabel}</span>}
              </li>
            ))}
          </ul>
          {data.canAssign && (
            <button className="od-mini assign-edit-btn" onClick={startEdit}>
              Edit assignments
            </button>
          )}
        </>
      )}

      {data && editing && (
        <div className="od-assign-edit">
          {rows.map((r, i) => (
            <div className="od-assign-row" key={i}>
              <select
                value={r.user}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))
                }
              >
                <option value="">Choose user…</option>
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <select
                value={r.role}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))
                }
              >
                {ROLE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {!r.role && (
                <input
                  type="text"
                  placeholder="Custom role (optional)"
                  value={r.roleOther}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) => (j === i ? { ...x, roleOther: e.target.value } : x)),
                    )
                  }
                />
              )}
              <button className="od-mini" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <div className="od-assign-actions">
            <button
              className="od-mini"
              onClick={() => setRows([...rows, { user: '', role: '', roleOther: '' }])}
            >
              + Add
            </button>
            <span className="sb-spacer" />
            <button className="od-mini" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button className="od-mini od-save" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

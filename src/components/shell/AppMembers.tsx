'use client'

// The "Users" view every membership-managed app shows inside itself: who can
// open THIS app, and — for admins/developers — an add picker and a Remove per
// row. Shared chrome, so the offers sidebar and the Kern tab bar render the
// same thing; styling is the `.am-*` block in shell.css (Kern re-maps its
// tokens in kern.css).
//
// All data comes from /api/app-members, which decides `canManage` server-side
// (admin/dev, never while emulating). Nothing here is a security boundary.

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { initialsOf } from '@/lib/users/initials'

interface Member {
  id: string
  name: string
  username: string
  email?: string
  roles: string[]
  implicit: boolean
}

interface Candidate {
  id: string
  name: string
  username: string
  email: string
}

interface MembersData {
  app: { id: string; name: string }
  canManage: boolean
  members: Member[]
  candidates: Candidate[]
}

const isManager = (roles: string[]): boolean => roles.includes('admin') || roles.includes('dev')

async function readMessage(res: Response, fallback: string): Promise<string> {
  const text = (await res.text().catch(() => '')).trim()
  return text && text.length <= 200 && !text.startsWith('<') ? text : fallback
}

export default function AppMembers({ appId }: { appId: string }): React.JSX.Element {
  const [data, setData] = useState<MembersData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/app-members?app=${encodeURIComponent(appId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setError(await readMessage(res, 'Could not load the user list.'))
        return
      }
      setError(null)
      setData((await res.json()) as MembersData)
    } catch {
      setError('Could not load the user list.')
    }
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  const change = async (body: { add?: string[]; remove?: string[] }): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app-members', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: appId, ...body }),
      })
      if (!res.ok) {
        setError(await readMessage(res, 'That change could not be saved.'))
      } else {
        setData((await res.json()) as MembersData)
        setPick('')
      }
    } catch {
      setError('That change could not be saved.')
    }
    setBusy(false)
  }

  const shown = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return data.members
    return data.members.filter((m) =>
      [m.name, m.username, m.email || ''].some((s) => s.toLowerCase().includes(needle)),
    )
  }, [data, q])

  const appName = data ? data.app.name : ''
  const listed = data ? data.members.filter((m) => !m.implicit).length : 0

  return (
    <section className="am" aria-busy={busy}>
      <div className="am-head">
        <div>
          <h2 className="am-title">Users</h2>
          <p className="am-blurb">
            Who can open {appName || 'this app'}. Admins and developers can always open every app.
          </p>
        </div>
        {data && data.canManage ? (
          <form
            className="am-add"
            onSubmit={(e) => {
              e.preventDefault()
              if (pick) void change({ add: [pick] })
            }}
          >
            <select
              className="am-select"
              aria-label="Add a person"
              value={pick}
              disabled={busy || data.candidates.length === 0}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">
                {data.candidates.length ? 'Add a person…' : 'Everyone already has access'}
              </option>
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
            <button type="submit" className="am-btn-primary" disabled={busy || !pick}>
              Add
            </button>
          </form>
        ) : null}
      </div>

      {error ? (
        <p className="am-error" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="am-toolbar">
            <input
              type="search"
              className="am-search"
              placeholder="Filter by name or email…"
              aria-label="Filter users"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="am-count">
              {listed} {listed === 1 ? 'person' : 'people'} with access
              {data.members.length > listed
                ? `, plus ${data.members.length - listed} admin${data.members.length - listed === 1 ? '' : 's'}`
                : ''}
            </span>
          </div>

          <ul className="am-list">
            {shown.map((m) => (
              <li className={m.implicit ? 'am-row am-row-implicit' : 'am-row'} key={m.id}>
                <span className="am-av" aria-hidden="true">
                  {initialsOf(m.name)}
                </span>
                <div className="am-who">
                  <span className="am-line">
                    <Link className="am-name" href={'/u/' + (m.username || m.id)}>
                      {m.name}
                    </Link>
                    {m.username ? <span className="am-handle">@{m.username}</span> : null}
                  </span>
                  {m.email ? (
                    <a className="am-email" href={'mailto:' + m.email}>
                      {m.email}
                    </a>
                  ) : null}
                </div>
                <div className="am-tags">
                  {isManager(m.roles) ? (
                    <span className="am-tag">{m.roles.includes('dev') ? 'Developer' : 'Admin'}</span>
                  ) : null}
                  {m.implicit ? <span className="am-tag am-tag-quiet">Opens every app</span> : null}
                </div>
                {data.canManage && !m.implicit ? (
                  <button
                    type="button"
                    className="am-remove"
                    disabled={busy}
                    onClick={() => void change({ remove: [m.id] })}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {shown.length === 0 ? (
            <p className="am-empty">
              {data.members.length ? 'No one matches.' : 'No one has access yet.'}
            </p>
          ) : null}
        </>
      ) : error ? null : (
        <p className="am-empty">Loading…</p>
      )}
    </section>
  )
}

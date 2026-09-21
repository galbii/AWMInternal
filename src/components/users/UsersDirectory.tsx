'use client'

// The Users app's one screen: search and filter the directory, create an
// account, and act on a row — grant or revoke admin/developer, grant or revoke
// each membership-managed app, block or allow view-as, open the profile,
// delete. Changes apply optimistically and go through /api/directory, which
// re-checks admin/dev and refuses emulation.
//
// `canManage` is false while emulating: rows still render, actions do not.

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'

import type { Role } from '@/access/roles'
import Modal from '@/components/shell/Modal'
import NewUserModal from '@/components/shell/NewUserModal'
import { withApps } from '@/lib/apps/membership'
import { membershipApps } from '@/lib/apps/registry'
import type { DirectoryUser } from '@/lib/users/directory'
import { initialsOf } from '@/lib/users/initials'

interface UsersDirectoryProps {
  rows: DirectoryUser[]
  /** The ACTOR's id — the row that is "You", which cannot be demoted or deleted here. */
  me: string
  canManage: boolean
}

type RoleFilter = 'all' | 'admins' | 'users'

const ROLE_LABEL: Record<Role, string> = { dev: 'Developer', admin: 'Admin', user: 'User' }
const ROLE_ORDER: Role[] = ['dev', 'admin', 'user']

const isAdmin = (u: DirectoryUser): boolean => u.roles.includes('admin') || u.roles.includes('dev')

/** The apps a person can be granted, in registry order. */
const MEMBER_APPS = membershipApps()

function joined(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

interface MenuPos {
  top?: number
  bottom?: number
  right: number
}
const MENU_HEIGHT = 250
const MENU_GAP = 6

function menuPosition(r: DOMRect): MenuPos {
  const right = window.innerWidth - r.right
  const fits = r.bottom + MENU_GAP + MENU_HEIGHT <= window.innerHeight
  return fits
    ? { top: r.bottom + MENU_GAP, right }
    : { bottom: window.innerHeight - r.top + MENU_GAP, right }
}

async function readMessage(res: Response, fallback: string): Promise<string> {
  const text = (await res.text().catch(() => '')).trim()
  return text && text.length <= 200 && !text.startsWith('<') ? text : fallback
}

export default function UsersDirectory({ rows: initial, me, canManage }: UsersDirectoryProps) {
  const [rows, setRows] = useState<DirectoryUser[]>(initial)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [menu, setMenu] = useState<{ id: string; pos: MenuPos } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [toDelete, setToDelete] = useState<DirectoryUser | null>(null)

  // The server component re-fetches after a create (NewUserModal reloads).
  useEffect(() => setRows(initial), [initial])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((u) => {
      if (filter === 'admins' && !isAdmin(u)) return false
      if (filter === 'users' && isAdmin(u)) return false
      if (!needle) return true
      return [u.name, u.email, u.username].some((s) => s.toLowerCase().includes(needle))
    })
  }, [rows, q, filter])

  const admins = rows.filter(isAdmin).length

  /** PATCH one account; keep the optimistic row unless the server says no. */
  async function patch(
    u: DirectoryUser,
    body: Record<string, unknown>,
    optimistic: Partial<DirectoryUser>,
  ) {
    setError(null)
    setBusyId(u.id)
    const before = u
    setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, ...optimistic } : r)))
    try {
      const res = await fetch('/api/directory', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: u.id, ...body }),
      })
      if (!res.ok) throw new Error(await readMessage(res, 'That change could not be saved.'))
      const data = (await res.json()) as { user: DirectoryUser }
      setRows((rs) => rs.map((r) => (r.id === u.id ? data.user : r)))
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === u.id ? before : r)))
      setError(err instanceof Error ? err.message : 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  function toggleApp(u: DirectoryUser, appId: string) {
    const has = u.apps.includes(appId)
    const apps = withApps(u.apps, has ? [] : [appId], has ? [appId] : [])
    void patch(u, { apps }, { apps })
  }

  function toggleRole(u: DirectoryUser, role: 'admin' | 'dev') {
    const has = u.roles.includes(role)
    let roles = has ? u.roles.filter((r) => r !== role) : [...u.roles, role]
    if (!roles.includes('user')) roles = [...roles, 'user']
    roles = ROLE_ORDER.filter((r) => roles.includes(r))
    void patch(u, { roles }, { roles })
  }

  async function remove(u: DirectoryUser) {
    setToDelete(null)
    setError(null)
    setBusyId(u.id)
    try {
      const res = await fetch('/api/directory', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      })
      if (!res.ok) throw new Error(await readMessage(res, 'That account could not be deleted.'))
      setRows((rs) => rs.filter((r) => r.id !== u.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That account could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  const profileHref = (u: DirectoryUser) => '/u/' + (u.username || u.id)

  const menuFor = menu ? rows.find((r) => r.id === menu.id) : undefined

  return (
    <div className="us">
      <header className="us-head">
        <div>
          <h1>Users</h1>
          <p className="us-blurb">
            Everyone who can sign in to AWM Internal, and what they can do.
          </p>
        </div>
        {canManage ? (
          <button type="button" className="us-btn-primary" onClick={() => setNewOpen(true)}>
            New user
          </button>
        ) : null}
      </header>

      <div className="us-toolbar">
        <input
          type="text"
          className="us-search"
          placeholder="Search name, email or handle…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search users"
        />
        {(
          [
            ['all', 'Everyone'],
            ['admins', 'Admins & developers'],
            ['users', 'Users only'],
          ] as [RoleFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="us-chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <span className="us-count">
          {rows.length} {rows.length === 1 ? 'account' : 'accounts'}, {admins} with admin access
        </span>
      </div>

      {error ? (
        <p className="us-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="us-table-wrap">
        <table className="us-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Apps</th>
              <th>Joined</th>
              <th>View-as</th>
              <th className="c-act">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const self = u.id === me
              const busy = busyId === u.id
              return (
                <tr key={u.id}>
                  <td>
                    <div className="us-person">
                      <span className="us-av" aria-hidden="true">
                        {initialsOf(u.name)}
                      </span>
                      <div className="us-who">
                        <span>
                          <Link className="us-name" href={profileHref(u)}>
                            {u.name}
                          </Link>
                          {self ? <span className="us-you">You</span> : null}
                        </span>
                        {u.username ? <span className="us-handle">@{u.username}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <a className="us-email" href={'mailto:' + u.email}>
                      {u.email}
                    </a>
                  </td>
                  <td>
                    <div className="us-roles">
                      {ROLE_ORDER.filter((r) => u.roles.includes(r)).map((r) => (
                        <span className="profile-role" key={r}>
                          {ROLE_LABEL[r]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="us-roles">
                      {isAdmin(u) ? (
                        <span className="us-dim" title="Admins and developers open every app">
                          All apps
                        </span>
                      ) : u.apps.length === 0 ? (
                        <span className="us-flag" title="Sees an empty hub until an app is granted">
                          None
                        </span>
                      ) : (
                        MEMBER_APPS.filter((a) => u.apps.includes(a.id)).map((a) => (
                          <span className="profile-role" key={a.id} title={a.name}>
                            {a.short}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="us-dim">{joined(u.createdAt)}</td>
                  <td>
                    {u.emulationBlocked ? (
                      <span className="us-flag" title="Admins cannot view as this account">
                        Blocked
                      </span>
                    ) : (
                      <span className="us-dim">Allowed</span>
                    )}
                  </td>
                  <td className="c-act">
                    {canManage ? (
                      <button
                        type="button"
                        className="us-more"
                        aria-haspopup="menu"
                        aria-expanded={menu?.id === u.id}
                        aria-label={'Actions for ' + u.name}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenu(
                            menu?.id === u.id
                              ? null
                              : {
                                  id: u.id,
                                  pos: menuPosition(e.currentTarget.getBoundingClientRect()),
                                },
                          )
                        }}
                      >
                        {busy ? '…' : '⋯'}
                      </button>
                    ) : (
                      <Link className="us-view" href={profileHref(u)}>
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <div className="us-empty">{rows.length ? 'No one matches.' : 'No accounts yet.'}</div>
        ) : null}
      </div>

      {menu && menuFor ? (
        <div
          className="us-menu"
          role="menu"
          aria-label={'Actions for ' + menuFor.name}
          style={{
            right: menu.pos.right,
            top: menu.pos.top ?? 'auto',
            bottom: menu.pos.bottom ?? 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link role="menuitem" href={profileHref(menuFor)}>
            Open profile
          </Link>
          {menuFor.id !== me ? (
            <>
              <div className="us-menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  toggleRole(menuFor, 'admin')
                }}
              >
                {menuFor.roles.includes('admin') ? 'Revoke admin' : 'Grant admin'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  toggleRole(menuFor, 'dev')
                }}
              >
                {menuFor.roles.includes('dev') ? 'Revoke developer' : 'Grant developer'}
              </button>
            </>
          ) : null}
          {!isAdmin(menuFor) ? (
            <>
              <div className="us-menu-sep" />
              {MEMBER_APPS.map((a) => (
                <button
                  type="button"
                  role="menuitem"
                  key={a.id}
                  onClick={() => {
                    setMenu(null)
                    toggleApp(menuFor, a.id)
                  }}
                >
                  {menuFor.apps.includes(a.id) ? `Revoke ${a.short}` : `Grant ${a.short}`}
                </button>
              ))}
            </>
          ) : null}
          <div className="us-menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              void patch(
                menuFor,
                { emulationBlocked: !menuFor.emulationBlocked },
                { emulationBlocked: !menuFor.emulationBlocked },
              )
            }}
          >
            {menuFor.emulationBlocked ? 'Allow view-as' : 'Block view-as'}
          </button>
          {menuFor.id !== me ? (
            <>
              <div className="us-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="us-menu-danger"
                onClick={() => {
                  setMenu(null)
                  setToDelete(menuFor)
                }}
              >
                Delete account…
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={toDelete !== null}
        title="Delete account"
        onBackdrop={() => setToDelete(null)}
        foot={
          <>
            <button className="btn-light" onClick={() => setToDelete(null)}>
              Cancel
            </button>
            <button className="btn-danger" onClick={() => toDelete && void remove(toDelete)}>
              Delete {toDelete?.name}
            </button>
          </>
        }
      >
        <p style={{ margin: '0 0 8px' }}>
          Delete <strong>{toDelete?.name}</strong> ({toDelete?.email})? They will no longer be able
          to sign in, and their passkeys stop working.
        </p>
        <p style={{ margin: 0 }} className="us-dim">
          Offers they touched keep their history; their name simply stops resolving there. This
          cannot be undone.
        </p>
      </Modal>

      {canManage ? <NewUserModal open={newOpen} onClose={() => setNewOpen(false)} /> : null}
    </div>
  )
}

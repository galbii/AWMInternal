'use client'

// The Users app, opened from the dock in ANY app: the Users directory in a modal
// over whatever you were doing, so managing an account no longer means
// leaving the app. It is the SAME UsersDirectory the /users page renders —
// one component, two hosts — fed by GET /api/directory, which re-checks
// admin/dev and refuses emulation exactly like the page's writes do. The dock
// only renders this for `adminTools`; that is a UX filter, the route is the
// boundary.
//
// The rows are fetched each time it opens, so it never shows a stale list.
// Its look is the dock's: dark glass, with the --awm-* tokens the directory
// reads re-defined under `.mu` (shell.css), so it is the same in every app
// and both themes.

import { X } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, useId, useState } from 'react'

import UsersDirectory from '@/components/users/UsersDirectory'
import type { DirectoryUser } from '@/lib/users/directory'

interface Loaded {
  rows: DirectoryUser[]
  me: string
}

export default function ManageUsersModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    let live = true
    setError(null)
    fetch('/api/directory', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('The user list could not be loaded.')
        return (await res.json()) as Loaded
      })
      .then((d) => {
        if (live) setData(d)
      })
      .catch((err: unknown) => {
        if (live)
          setError(err instanceof Error ? err.message : 'The user list could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [open])

  // Escape closes — unless one of the directory's own dialogs (New user,
  // confirm delete) is open on top, which handles its own way out.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.modal-bg.show')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="mu-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mu" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="mu-head">
          <h2 id={titleId}>Manage users</h2>
          <Link className="mu-link" href="/users">
            Open full page
          </Link>
          <button type="button" className="mu-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className="mu-body">
          {error ? (
            <p className="us-error" role="alert">
              {error}
            </p>
          ) : data ? (
            <UsersDirectory rows={data.rows} me={data.me} canManage embedded />
          ) : (
            <p className="mu-loading">Loading…</p>
          )}
        </div>
      </div>
    </div>
  )
}

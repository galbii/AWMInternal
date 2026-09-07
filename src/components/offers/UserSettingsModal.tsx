'use client'

// "My settings" modal: the signed-in user's basic info (name, email, password).
// Reads via Payload's own /api/users/me and saves via PATCH /api/users/:id —
// both cookie-authenticated and access-controlled (self or admin/dev; the
// roles field is admin/dev-only, so nothing here can self-promote).

import React, { useEffect, useState } from 'react'

import Modal from './Modal'

interface MeUser {
  id: string
  name?: string | null
  email: string
}

export default function UserSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const [me, setMe] = useState<MeUser | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setPw('')
    setPw2('')
    void (async () => {
      try {
        const res = await fetch('/api/users/me', { credentials: 'same-origin', cache: 'no-store' })
        if (!res.ok) {
          setError('Could not load your account.')
          return
        }
        const data = (await res.json()) as { user: MeUser | null }
        if (!data.user) {
          setError('Could not load your account.')
          return
        }
        setMe(data.user)
        setName(data.user.name || '')
        setEmail(data.user.email)
      } catch {
        setError('Could not load your account.')
      }
    })()
  }, [open])

  const save = async (): Promise<void> => {
    if (!me || busy) return
    setError(null)
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (pw || pw2) {
      if (pw.length < 8) {
        setError('New password must be at least 8 characters.')
        return
      }
      if (pw !== pw2) {
        setError('Passwords do not match.')
        return
      }
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/users/${me.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          ...(pw ? { password: pw } : {}),
        }),
      })
      if (res.ok) {
        // Full reload so the server-rendered session bar picks up the new name.
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      setError(body?.errors?.[0]?.message || 'Could not save your changes.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      title="My settings"
      onBackdrop={onClose}
      foot={
        <>
          <button className="btn-light" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy || !me}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="usm-form">
        {error && <div className="login-error">{error}</div>}
        {!me && !error && <div className="od-dim">Loading…</div>}
        {me && (
          <>
            <label>
              Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="usm-divider">Change password (optional)</div>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}

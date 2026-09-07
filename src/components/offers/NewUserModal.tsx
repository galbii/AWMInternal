'use client'

// "New user" modal for admins/devs. Creates the account through Payload's own
// /api/users REST endpoint — access control (create: adminOrDev) and the
// roles field access run server-side, so this is UI over an existing door.

import React, { useState } from 'react'

import Modal from './Modal'

const ROLE_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: 'user', label: 'User', hint: 'works offers' },
  { value: 'admin', label: 'Admin', hint: 'manages users & assignments, can view-as' },
  { value: 'dev', label: 'Developer', hint: 'same permissions as admin' },
]

export default function NewUserModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [roles, setRoles] = useState<string[]>(['user'])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggleRole = (r: string): void => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }

  const save = async (): Promise<void> => {
    if (busy) return
    setError(null)
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (pw.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (pw !== pw2) {
      setError('Passwords do not match.')
      return
    }
    if (!roles.length) {
      setError('Pick at least one role.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password: pw, roles }),
      })
      if (res.ok) {
        // Full reload so the view-as list picks up the new account.
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      setError(body?.errors?.[0]?.message || 'Could not create the user.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      title="New user"
      onBackdrop={onClose}
      foot={
        <>
          <button className="btn-light" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      <div className="usm-form">
        {error && <div className="login-error">{error}</div>}
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        </label>
        <div className="usm-divider">Roles</div>
        <div className="nu-roles">
          {ROLE_CHOICES.map((r) => (
            <label className="nu-role" key={r.value}>
              <input
                type="checkbox"
                checked={roles.includes(r.value)}
                onChange={() => toggleRole(r.value)}
              />
              <span>
                <strong>{r.label}</strong> <span className="od-dim">— {r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}

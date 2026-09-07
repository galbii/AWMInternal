'use client'

// Signs in against Payload's own /api/users/login, which sets the httpOnly
// `payload-token` cookie itself. A full navigation (not router.push) re-runs
// the server layout so the session bar and gate see the new cookie.

import React, { useState } from 'react'

export default function LoginForm(): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      setError(res.status === 401 ? 'Invalid email or password.' : 'Sign-in failed — try again.')
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={(e) => {
          void submit(e)
        }}
      >
        <h1>Offer &amp; New Hire Request Manager</h1>
        <p className="login-sub">Sign in to continue</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

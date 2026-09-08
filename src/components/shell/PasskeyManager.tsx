'use client'

// Passkey management for the signed-in user, rendered on their /u/<username> page.
// Talks to /api/passkey* (owned by another agent) — this file only consumes
// the documented contract. WebAuthn ceremonies run client-side via
// @simplewebauthn/browser.

import React, { useEffect, useState } from 'react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'

interface Passkey {
  id: string
  label: string
  createdAt: string
  lastUsedAt?: string | null
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
}

function defaultLabel(): string {
  if (typeof navigator === 'undefined') return 'Passkey'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android device'
  if (/Mac/i.test(platform) || /Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux'
  return 'Passkey'
}

function formatMeta(pk: Passkey): string {
  const created = new Date(pk.createdAt).toLocaleDateString()
  const parts = [`Added ${created}`]
  if (pk.lastUsedAt) {
    parts.push(`Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`)
  }
  return parts.join(' · ')
}

export default function PasskeyManager(): React.JSX.Element {
  const [supported, setSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [emulating, setEmulating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/passkey', { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 403) {
        setEmulating(true)
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError('Could not load your passkeys.')
        setLoading(false)
        return
      }
      const data = (await res.json()) as { passkeys: Passkey[] }
      setPasskeys(data.passkeys || [])
    } catch {
      setError('Could not reach the server.')
    }
    setLoading(false)
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
    setLabel(defaultLabel())
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async (): Promise<void> => {
    if (adding) return
    setError(null)
    setAdding(true)
    try {
      const optionsRes = await fetch('/api/passkey/register/options', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (optionsRes.status === 403) {
        setEmulating(true)
        setAdding(false)
        return
      }
      if (!optionsRes.ok) {
        setError('Could not start passkey setup.')
        setAdding(false)
        return
      }
      const optionsJSON = (await optionsRes.json()) as PublicKeyCredentialCreationOptionsJSON

      let response
      try {
        response = await startRegistration({ optionsJSON })
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        if (name === 'NotAllowedError' || name === 'AbortError') {
          // User cancelled the OS prompt — silent no-op.
          setAdding(false)
          return
        }
        setError('Could not create a passkey on this device.')
        setAdding(false)
        return
      }

      const verifyRes = await fetch('/api/passkey/register/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response, label: label.trim() || 'Passkey' }),
      })
      if (verifyRes.status === 403) {
        setEmulating(true)
        setAdding(false)
        return
      }
      if (!verifyRes.ok) {
        setError('Could not save your passkey.')
        setAdding(false)
        return
      }
      setLabel(defaultLabel())
      await load()
    } catch {
      setError('Could not reach the server.')
    }
    setAdding(false)
  }

  const handleRemove = async (id: string): Promise<void> => {
    setRemovingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/passkey?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.status === 403) {
        setEmulating(true)
        setRemovingId(null)
        return
      }
      if (!res.ok) {
        setError('Could not remove that passkey.')
        setRemovingId(null)
        return
      }
      setConfirmingId(null)
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Could not reach the server.')
    }
    setRemovingId(null)
  }

  return (
    <section className="pk-section" aria-busy={adding || loading}>
      <div className="pk-head">
        <div className="pk-title">Passkeys</div>
        <div className="pk-sub">
          Sign in with Touch ID, Windows Hello, or your phone instead of a password.
        </div>
      </div>

      {error && <div className="pk-error">{error}</div>}

      {emulating && (
        <div className="pk-note">You can&apos;t change passkeys while viewing as another user.</div>
      )}

      {!emulating && !supported && (
        <div className="pk-note">This browser doesn&apos;t support passkeys.</div>
      )}

      {!emulating && loading && <div className="pk-note">Loading…</div>}

      {!emulating && !loading && (
        <>
          {passkeys.length === 0 ? (
            <div className="pk-empty">No passkeys yet. Add one to sign in without a password.</div>
          ) : (
            <ul className="pk-list">
              {passkeys.map((pk) => (
                <li className="pk-item" key={pk.id}>
                  <div className="pk-item-main">
                    <div className="pk-item-name">
                      {pk.label}{' '}
                      <span className="pk-badge">
                        {pk.deviceType === 'multiDevice' || pk.backedUp
                          ? 'Synced'
                          : 'This device only'}
                      </span>
                    </div>
                    <div className="pk-item-meta">{formatMeta(pk)}</div>
                  </div>
                  <div className="pk-item-actions">
                    {confirmingId === pk.id ? (
                      <>
                        <button
                          type="button"
                          className="pk-remove-confirm"
                          disabled={removingId === pk.id}
                          onClick={() => void handleRemove(pk.id)}
                        >
                          {removingId === pk.id ? 'Removing…' : 'Remove?'}
                        </button>
                        <button
                          type="button"
                          className="pk-remove"
                          disabled={removingId === pk.id}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="pk-remove"
                        onClick={() => setConfirmingId(pk.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {supported && (
            <div className="pk-add-row">
              <label>
                Passkey name
                <input
                  type="text"
                  className="pk-add-input"
                  value={label}
                  disabled={adding}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="pk-add"
                disabled={adding}
                onClick={() => void handleAdd()}
              >
                {adding ? 'Waiting for your device…' : 'Add a passkey'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

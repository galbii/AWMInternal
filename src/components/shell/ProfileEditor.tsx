'use client'

// The editable half of /u/<username>. Replaces the old "My settings" modal.
//
// Three INDEPENDENT sections — profile, password, roles — each with its own
// save button and its own status line. That is deliberate: a failed password
// change must never discard a typed name, and saving a name must never require
// re-entering a password.
//
// Every write goes to PATCH /api/profile, which re-derives permissions
// server-side; nothing here is a security boundary. `canEditRoles` only decides
// whether the roles UI is worth rendering.

import React, { useEffect, useState } from 'react'

import type { Role } from '@/access/roles'
import type { ProfileView } from '@/lib/users/profile'

interface ProfileEditorProps {
  profile: ProfileView
}

type Status =
  { kind: 'idle' } | { kind: 'saved'; message: string } | { kind: 'error'; message: string }

const IDLE: Status = { kind: 'idle' }

/** Result of the debounced username probe. */
type Check = { kind: 'none' } | { kind: 'ok'; message: string } | { kind: 'bad'; message: string }

const NO_CHECK: Check = { kind: 'none' }

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'dev', label: 'Developer' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
]

interface CheckResponse {
  available: boolean
  normalized: string
  reason?: string
}

interface PatchSuccess {
  ok: true
  profile: ProfileView
}

type PatchResult = PatchSuccess | { ok: false; message: string }

/** Pull a human message out of a JSON `{ error }` body or a plain text body. */
function readError(raw: string, status: number): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown }
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim()
    } catch {
      /* not JSON after all — fall through to the raw body */
    }
  } else if (trimmed) {
    return trimmed
  }
  if (status === 403) return 'You can’t make changes while viewing as another user.'
  return 'Could not save your changes. Try again.'
}

async function patchProfile(body: Record<string, unknown>): Promise<PatchResult> {
  let res: Response
  try {
    res = await fetch('/api/profile', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return {
      ok: false,
      message: 'Could not reach the server. Check your connection and try again.',
    }
  }

  const raw = await res.text().catch(() => '')

  // /api/profile writes its non-2xx bodies as plain sentences meant for the
  // person in the form ("Only an admin can change roles.", "…already taken."),
  // so show those verbatim; readError() supplies the fallback per status.
  if (!res.ok) return { ok: false, message: readError(raw, res.status) }

  try {
    const data = JSON.parse(raw) as Partial<PatchSuccess> | null
    if (data && data.profile) return { ok: true, profile: data.profile }
  } catch {
    /* the write succeeded but the body was unreadable — treat it as saved */
  }
  return { ok: false, message: 'Saved, but the server sent an unexpected reply. Reload to check.' }
}

export default function ProfileEditor({ profile }: ProfileEditorProps): React.JSX.Element {
  // ---- Profile section -----------------------------------------------------
  const [name, setName] = useState(profile.name)
  const [username, setUsername] = useState(profile.username)
  const [email, setEmail] = useState(profile.email ?? '')
  const [savedUsername, setSavedUsername] = useState(profile.username)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileStatus, setProfileStatus] = useState<Status>(IDLE)
  const [check, setCheck] = useState<Check>(NO_CHECK)

  const showEmail = profile.email !== undefined
  const usernameChanged = username.trim() !== savedUsername

  // Availability probe. Debounced so it never runs per keystroke, and never
  // gates the input itself — typing stays instant whatever the network does.
  useEffect(() => {
    const candidate = username.trim()
    if (!candidate || candidate === savedUsername) {
      setCheck(NO_CHECK)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/profile?check=${encodeURIComponent(candidate)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ctrl.signal,
          })
          if (!res.ok) {
            setCheck(NO_CHECK)
            return
          }
          const data = (await res.json()) as CheckResponse
          if (ctrl.signal.aborted) return
          if (data.available) {
            const message =
              data.normalized && data.normalized !== candidate
                ? `Available — saved as @${data.normalized}`
                : 'Available'
            setCheck({ kind: 'ok', message })
          } else {
            setCheck({ kind: 'bad', message: data.reason || 'Taken' })
          }
        } catch {
          // Aborted by the next keystroke, or offline. Either way the field
          // stays usable; the server re-checks on save.
          if (!ctrl.signal.aborted) setCheck(NO_CHECK)
        }
      })()
    }, 400)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [username, savedUsername])

  const saveProfile = async (): Promise<void> => {
    if (profileBusy) return
    const nextName = name.trim()
    const nextUsername = username.trim()
    if (!nextName) {
      setProfileStatus({ kind: 'error', message: 'Enter a name — it is what colleagues see.' })
      return
    }
    if (!nextUsername) {
      setProfileStatus({ kind: 'error', message: 'Enter a username — it is your profile link.' })
      return
    }
    if (showEmail && !email.trim()) {
      setProfileStatus({ kind: 'error', message: 'Enter an email address — it signs you in.' })
      return
    }

    setProfileStatus(IDLE)
    setProfileBusy(true)
    const result = await patchProfile({
      id: profile.id,
      name: nextName,
      username: nextUsername,
      ...(showEmail ? { email: email.trim() } : {}),
    })

    if (!result.ok) {
      setProfileStatus({ kind: 'error', message: result.message })
      setProfileBusy(false)
      return
    }

    const saved = result.profile
    if (saved.username && saved.username !== savedUsername) {
      // The URL now points at a handle that no longer exists — move to the new
      // one rather than leaving a stale address in the bar.
      window.location.href = `/u/${saved.username}`
      return
    }

    setName(saved.name)
    setUsername(saved.username)
    setSavedUsername(saved.username)
    if (saved.email !== undefined) setEmail(saved.email)
    setProfileStatus({ kind: 'saved', message: 'Saved' })
    setProfileBusy(false)
  }

  // ---- Password section ----------------------------------------------------
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwStatus, setPwStatus] = useState<Status>(IDLE)

  const pwLongEnough = password.length >= 8
  const pwMatches = password.length > 0 && password === confirm
  const pwReady = pwLongEnough && pwMatches

  const savePassword = async (): Promise<void> => {
    if (pwBusy || !pwReady) return
    setPwStatus(IDLE)
    setPwBusy(true)
    const result = await patchProfile({ id: profile.id, password })
    if (!result.ok) {
      setPwStatus({ kind: 'error', message: result.message })
      setPwBusy(false)
      return
    }
    setPassword('')
    setConfirm('')
    setPwStatus({ kind: 'saved', message: 'Password updated' })
    setPwBusy(false)
  }

  // ---- Roles section -------------------------------------------------------
  const [roles, setRoles] = useState<Role[]>(profile.roles)
  const [rolesBusy, setRolesBusy] = useState(false)
  const [rolesStatus, setRolesStatus] = useState<Status>(IDLE)

  const toggleRole = (role: Role, on: boolean): void => {
    setRolesStatus(IDLE)
    setRoles((prev) => {
      const next = on ? [...prev, role] : prev.filter((r) => r !== role)
      // Keep the canonical order so the saved array never depends on click order.
      return ROLE_OPTIONS.map((o) => o.value).filter((r) => next.includes(r))
    })
  }

  const saveRoles = async (): Promise<void> => {
    if (rolesBusy) return
    if (roles.length === 0) {
      setRolesStatus({ kind: 'error', message: 'Choose at least one role before saving.' })
      return
    }
    setRolesStatus(IDLE)
    setRolesBusy(true)
    const result = await patchProfile({ id: profile.id, roles })
    if (!result.ok) {
      setRolesStatus({ kind: 'error', message: result.message })
      setRolesBusy(false)
      return
    }
    setRoles(result.profile.roles)
    setRolesStatus({ kind: 'saved', message: 'Roles saved' })
    setRolesBusy(false)
  }

  const statusLine = (status: Status): React.JSX.Element => (
    <div className="pe-status" aria-live="polite">
      {status.kind === 'saved' ? status.message : null}
      {status.kind === 'error' ? <span className="pe-error">{status.message}</span> : null}
    </div>
  )

  return (
    <>
      <section className="pe-section" aria-busy={profileBusy}>
        <h2 className="pe-title">Profile</h2>
        <p className="pe-desc">
          {profile.isSelf
            ? 'This is how you appear across the internal apps.'
            : 'This is how this person appears across the internal apps.'}
        </p>

        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-name">
            Name
          </label>
          <input
            className="pe-input"
            id="pe-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setProfileStatus(IDLE)
            }}
          />
        </div>

        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-username">
            Username
          </label>
          <div className="pe-prefix-wrap">
            <span className="pe-prefix" aria-hidden="true">
              @
            </span>
            <input
              className="pe-input"
              id="pe-username"
              type="text"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase())
                setProfileStatus(IDLE)
              }}
            />
          </div>
          {check.kind === 'ok' && <p className="pe-hint pe-hint-ok">{check.message}</p>}
          {check.kind === 'bad' && <p className="pe-hint pe-hint-bad">{check.message}</p>}
          <p className="pe-hint">
            {usernameChanged
              ? `Saving this moves the profile to /u/${username.trim() || '…'} — the old link stops working.`
              : `This profile lives at /u/${savedUsername}. Changing the username changes that link.`}
          </p>
        </div>

        {showEmail && (
          <div className="pe-field">
            <label className="pe-label" htmlFor="pe-email">
              Email
            </label>
            <input
              className="pe-input"
              id="pe-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setProfileStatus(IDLE)
              }}
            />
            <p className="pe-hint">
              {profile.isSelf
                ? 'You sign in with this address.'
                : 'This person signs in with this address.'}
            </p>
          </div>
        )}

        <div className="pe-actions">
          <button
            className="pe-save"
            type="button"
            onClick={() => void saveProfile()}
            disabled={profileBusy}
          >
            {profileBusy ? 'Saving…' : 'Save changes'}
          </button>
          {statusLine(profileStatus)}
        </div>
      </section>

      <section className="pe-section" aria-busy={pwBusy}>
        <h2 className="pe-title">Password</h2>
        <p className="pe-desc">
          {profile.isSelf
            ? 'Set a new password. You stay signed in on this device.'
            : 'Set a new password for this account, then share it with them directly.'}
        </p>

        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-password">
            New password
          </label>
          <input
            className="pe-input"
            id="pe-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setPwStatus(IDLE)
            }}
          />
          <p className={`pe-hint${password && !pwLongEnough ? ' pe-hint-bad' : ''}`}>
            Use at least 8 characters.
          </p>
        </div>

        <div className="pe-field">
          <label className="pe-label" htmlFor="pe-confirm">
            Confirm new password
          </label>
          <input
            className="pe-input"
            id="pe-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setPwStatus(IDLE)
            }}
          />
          {confirm.length > 0 && !pwMatches && (
            <p className="pe-hint pe-hint-bad">Both fields must match.</p>
          )}
          {pwReady && <p className="pe-hint pe-hint-ok">Ready to save.</p>}
        </div>

        <div className="pe-actions">
          <button
            className="pe-save"
            type="button"
            onClick={() => void savePassword()}
            disabled={pwBusy || !pwReady}
          >
            {pwBusy ? 'Saving…' : 'Update password'}
          </button>
          {statusLine(pwStatus)}
        </div>
      </section>

      {profile.canEditRoles && (
        <section className="pe-section" aria-busy={rolesBusy}>
          <h2 className="pe-title">Roles</h2>
          <p className="pe-desc">
            Roles decide which apps this person can open. Developer and Admin carry the same
            permissions.
          </p>

          <div className="pe-roles">
            {ROLE_OPTIONS.map((opt) => (
              <div className="pe-role" key={opt.value}>
                <input
                  id={`pe-role-${opt.value}`}
                  type="checkbox"
                  checked={roles.includes(opt.value)}
                  disabled={rolesBusy}
                  onChange={(e) => toggleRole(opt.value, e.target.checked)}
                />
                <label className="pe-label" htmlFor={`pe-role-${opt.value}`}>
                  {opt.label}
                </label>
              </div>
            ))}
          </div>
          {roles.length === 0 && (
            <p className="pe-hint pe-hint-bad">Choose at least one role before saving.</p>
          )}

          <div className="pe-actions">
            <button
              className="pe-save"
              type="button"
              onClick={() => void saveRoles()}
              disabled={rolesBusy || roles.length === 0}
            >
              {rolesBusy ? 'Saving…' : 'Save roles'}
            </button>
            {statusLine(rolesStatus)}
          </div>
        </section>
      )}
    </>
  )
}

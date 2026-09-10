'use client'

// Sign-in for the whole dashboard. Two paths to the same place:
//
//  1. PASSKEY — the fast path. On mount we start a conditional-UI ceremony so
//     saved passkeys appear inside the email field's own autofill dropdown
//     (that is what `autocomplete="username webauthn"` is for). Nothing is
//     shown, nothing is clicked; if the browser can't do it, or the person
//     ignores it, the ceremony just sits there and we fall through silently.
//     The explicit button is the discoverable version of the same flow.
//  2. PASSWORD — posts to Payload's own /api/users/login, which sets the
//     httpOnly `payload-token` cookie itself.
//
// Either way we finish with a FULL navigation, not router.push: the server
// layouts have to re-run so the session bar and the auth gate see the cookie.
// On success the active button flips to a brief "Signed in" state before the
// navigation, so the handoff reads as arrival rather than a reload; the pause
// is skipped for prefers-reduced-motion.

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
} from '@simplewebauthn/browser'
import Image from 'next/image'
import React, { useCallback, useEffect, useRef, useState } from 'react'

/** Only ever redirect to a same-origin path — never an absolute URL. */
function safeNext(next?: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

interface LoginFormProps {
  /** Validated server-side too; re-checked here so any caller is safe. */
  next?: string
}

export default function LoginForm({ next }: LoginFormProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'password' | 'passkey'>(null)
  const [done, setDone] = useState(false)
  /**
   * Optimistically TRUE so the first paint already shows the passkey path —
   * starting false made the lede and button flash in on every load for the
   * overwhelming majority of browsers that do support WebAuthn. The effect
   * below removes it on the rare browser that doesn't. Matching the SSR value
   * also keeps hydration clean.
   */
  const [canPasskey, setCanPasskey] = useState(true)

  const destination = safeNext(next)
  /** Guards against a late autofill ceremony resolving after we've navigated. */
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    doneRef.current = true
    setDone(true)
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Long enough to read as confirmation, short enough to never feel slow.
    window.setTimeout(
      () => {
        window.location.href = destination
      },
      reduced ? 0 : 450,
    )
  }, [destination])

  /** Exchange a signed assertion for a session cookie. */
  const verifyAssertion = useCallback(
    async (response: unknown): Promise<boolean> => {
      const res = await fetch('/api/passkey/auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      return res.ok
    },
    [],
  )

  // Synchronous, but it touches `window` — so it runs after mount, not during
  // render, to keep the server and first client render identical.
  useEffect(() => {
    setCanPasskey(browserSupportsWebAuthn())
  }, [])

  // Conditional UI. Deliberately silent: every failure path here is a
  // non-event, because the password form is right there.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return
      try {
        const res = await fetch('/api/passkey/auth/options', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        if (!res.ok || cancelled) return
        const optionsJSON = (await res.json()) as Parameters<
          typeof startAuthentication
        >[0]['optionsJSON']
        const assertion = await startAuthentication({ optionsJSON, useBrowserAutofill: true })
        if (cancelled || doneRef.current) return
        if (await verifyAssertion(assertion)) finish()
      } catch {
        /* no autofill passkey chosen — the form handles it */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [finish, verifyAssertion])

  const signInWithPasskey = async (): Promise<void> => {
    if (busy || done) return
    setBusy('passkey')
    setError(null)
    try {
      const res = await fetch('/api/passkey/auth/options', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) throw new Error('options')
      const optionsJSON = (await res.json()) as Parameters<
        typeof startAuthentication
      >[0]['optionsJSON']
      const assertion = await startAuthentication({ optionsJSON })
      if (await verifyAssertion(assertion)) {
        finish()
        return
      }
      setError('That passkey isn’t registered here. Sign in with your password instead.')
    } catch (err) {
      // Cancelling the OS prompt is a decision, not a failure.
      const name = err instanceof Error ? err.name : ''
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setError('Passkey sign-in didn’t finish. Try again, or use your password.')
      }
    }
    setBusy(null)
  }

  const submitPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy || done) return
    setBusy('password')
    setError(null)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) {
        finish()
        return
      }
      setError(
        res.status === 401
          ? 'That email and password don’t match.'
          : 'Sign-in failed. Try again in a moment.',
      )
    } catch {
      setError('Can’t reach the server. Check your connection and try again.')
    }
    setBusy(null)
  }

  // Which button shows the success state: the one whose flow finished. An
  // autofill-ceremony success has no busy flag — it reads as the passkey path.
  const passkeyDone = done && busy !== 'password'
  const passwordDone = done && busy === 'password'

  const check = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="signin-check">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )

  return (
    <main className="signin">
      {/* The brand holds the left panel; the swoosh is the logo's own horizon
          redrawn as a single line that draws itself in. Decorative — hidden
          from assistive tech. */}
      <section className="signin-brand">
        <Image
          className="signin-mark"
          src="/brand/awm-logo.png"
          alt="All Western Mortgage"
          width={200}
          height={200}
          priority
        />

        <svg
          className="signin-swoosh"
          viewBox="0 0 720 240"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className="signin-swoosh-line"
            pathLength="1"
            d="M0,170 C230,96 470,44 720,72"
          />
          <path
            className="signin-swoosh-echo"
            pathLength="1"
            d="M0,196 C240,126 480,78 720,104"
          />
        </svg>

        <p className="signin-brand-foot">For All Western Mortgage employees</p>
      </section>

      <section className="signin-panel">
        <div className="signin-box">
          <h1 className="signin-title">Sign in</h1>
          <p className="signin-lede">
            {canPasskey
              ? 'Use a passkey, or your email and password.'
              : 'Enter your email and password to continue.'}
          </p>

          <div className="signin-card-seq">
            {canPasskey && (
              <>
                <button
                  type="button"
                  className="signin-passkey"
                  onClick={() => void signInWithPasskey()}
                  disabled={busy !== null || done}
                >
                  {passkeyDone ? (
                    check
                  ) : busy === 'passkey' ? (
                    <span className="signin-spinner" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="signin-key">
                      <circle cx="9" cy="8" r="4" />
                      <path d="M9 13c-3.3 0-6 2.2-6 5v1h9" />
                      <path d="M20 11.5a2.5 2.5 0 1 0-4 2v5.5l1.5 1.5 1.5-1.5-1-1 1-1-1-1 1-1v-1.5a2.5 2.5 0 0 0 1-2z" />
                    </svg>
                  )}
                  {passkeyDone
                    ? 'Signed in'
                    : busy === 'passkey'
                      ? 'Waiting for your device…'
                      : 'Sign in with a passkey'}
                </button>

                <div className="signin-alt">
                  <span>or use your password</span>
                </div>
              </>
            )}

            <form onSubmit={(e) => void submitPassword(e)} noValidate>
              <label className="signin-field">
                <span>Email</span>
                <input
                  type="email"
                  // `webauthn` is what surfaces saved passkeys in the autofill menu.
                  autoComplete="username webauthn"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="signin-field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {error && (
                <p className="signin-error" role="alert">
                  {error}
                </p>
              )}

              <button className="signin-submit" type="submit" disabled={busy !== null || done}>
                {passwordDone ? (
                  check
                ) : (
                  busy === 'password' && <span className="signin-spinner" aria-hidden="true" />
                )}
                {passwordDone ? 'Signed in' : busy === 'password' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

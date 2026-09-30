'use client'

// Slim session strip above every app's shell. 2026-09: two quiet clusters —
// the app breadcrumb on the left (AppShell passes it in as `leading`) and ONE
// account menu on the right: avatar, name, chevron, opening a dark popover
// that holds Settings, Profile and Sign out, plus — for admins/devs — "view
// as" emulation and a link to the Users app (/users, where accounts are
// created and managed). No outlined buttons live in the bar.
//
// "View as" lives in the SAME bar, not a second banner: the strip and the
// avatar turn amber, the label reads "Viewing as <user>", and an inline Exit
// pill sits beside it. A thin fixed frame keeps the whole window visibly
// marked while the app is read-only (writes are rejected server-side).
//
// While emulating, a "Switch" pill joins that amber cluster (ViewAsList.tsx):
// hopping from one person to the next used to mean exiting, waiting for a
// reload, reopening this menu and picking again. It is gated on the ACTOR's
// role, NOT on `adminTools` — the rest of the admin block stays hidden so the
// emulated session still looks like the target's own UI, but the emulation
// chrome itself has always been actor-only, exactly like the Exit pill.
//
// The bar GETS OUT OF THE WAY on its own (2026-09-29, replacing the fold
// chevron and its awm-bar cookie): it is `position:sticky`, shown at the top
// of the page, and slides up once you scroll past it. Sliding is a TRANSFORM,
// so the bar keeps its 46px of flow space at the document's top and nothing
// below it ever reflows — `--od-top` and the apps' own sticky offsets stay
// true. It comes back when the pointer reaches the top edge of the window.
//
// Three rules keep it from vanishing mid-use, two of them in CSS so this
// component never has to know a menu is open:
//   - `.session-bar:has(.shm.open)` — a popover is hanging BELOW the bar, so
//     the pointer has left the peek zone but the bar must stay put.
//   - `:focus-within` — the same thing for keyboard users.
//   - the peek zone is 56px while the bar is out (its own height, so the
//     pointer can rest on it) and 6px while it is away (so it does not pop
//     open at the slightest drift).
// Without a hover-capable pointer there is no peek zone at all, so a touch
// screen gets the familiar rule instead: scrolling UP brings it back.
//
// Identity settings (name, username, passkeys) live on /u/<username>; the
// settings modal links there rather than duplicating them.

import { ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'

import { initialsOf } from '@/lib/users/initials'

import SettingsModal from './SettingsModal'
import ShellMenu from './ShellMenu'
import ViewAsList, { type ViewAsPerson } from './ViewAsList'

/** The picker owns the shape; AppShell still imports the name from here. */
export type SessionUserOption = ViewAsPerson

interface SessionBarProps {
  actorLabel: string
  /** Shown under the name in the account menu; omitted when it IS the label. */
  actorEmail?: string
  viewerLabel: string
  /** True for admin OR dev — identical permissions (view-as, user creation). */
  canManage: boolean
  isEmulating: boolean
  /** Emulating in WRITE mode — actions run as, and are audited to, both people. */
  isActing: boolean
  /** May the CURRENT emulated target be acted as? False for admins/developers. */
  canAct: boolean
  /** The id currently being viewed as — marks "now" in the switcher. */
  viewerId: string
  users: SessionUserOption[]
  /**
   * The actor's own profile page: `/u/<username>`, or `/u/me` when the
   * account has no username yet.
   */
  profileHref: string
  /** Optional content rendered first inside the bar (AppShell's app switcher). */
  leading?: React.ReactNode
}

/** How far down the page counts as "still at the top". */
const AT_TOP = 6
/** Pointer distance from the top edge that shows the bar / keeps it out. */
const PEEK_AWAY = 6
const PEEK_OUT = 56

async function postEmulate(
  userId: string | null,
  mode: 'view' | 'act' = 'view',
): Promise<boolean> {
  try {
    const res = await fetch('/api/emulate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, mode }),
    })
    return res.ok
  } catch {
    return false
  }
}

export default function SessionBar({
  actorLabel,
  actorEmail,
  viewerLabel,
  canManage,
  isEmulating,
  isActing,
  canAct,
  viewerId,
  users,
  profileHref,
  leading,
}: SessionBarProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Slid out of sight. The ref mirrors it so the listeners below can read the
  // current value without re-subscribing, and only re-render on a real flip.
  const [away, setAway] = useState(false)
  const awayRef = useRef(false)

  useEffect(() => {
    const hoverable = window.matchMedia('(hover:hover)').matches
    let nearTop = false
    let lastY = window.scrollY
    // Touch only: a scroll UP pins the bar until the next scroll down.
    let pinned = false
    let frame = 0

    const evaluate = (): void => {
      frame = 0
      const next = window.scrollY > AT_TOP && !nearTop && !pinned
      if (next === awayRef.current) return
      awayRef.current = next
      setAway(next)
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(evaluate)
    }

    const onScroll = (): void => {
      const y = window.scrollY
      if (!hoverable) {
        if (y < lastY - 6) pinned = true
        else if (y > lastY + 6) pinned = false
      }
      lastY = y
      schedule()
    }
    const onMove = (e: PointerEvent): void => {
      const next = e.clientY <= (awayRef.current ? PEEK_AWAY : PEEK_OUT)
      if (next === nearTop) return
      nearTop = next
      schedule()
    }

    evaluate()
    window.addEventListener('scroll', onScroll, { passive: true })
    if (hoverable) window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  const viewAs = async (userId: string, mode: 'view' | 'act' = 'view'): Promise<void> => {
    if (!userId || busy) return
    setBusy(true)
    if (await postEmulate(userId, mode)) window.location.reload()
    else setBusy(false)
  }

  /**
   * Flip the CURRENT emulated session between read-only and write-capable.
   * Deliberate and one-way-at-a-time: browsing as someone must never start
   * writing on its own, because the offers UI writes while you browse (the
   * letter regen effect and the 600ms autosave) — see lib/auth/viewer.ts.
   */
  const setMode = async (mode: 'view' | 'act'): Promise<void> => {
    if (!viewerId || busy) return
    setBusy(true)
    if (await postEmulate(viewerId, mode)) window.location.reload()
    else setBusy(false)
  }

  const exitViewAs = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    if (await postEmulate(null)) window.location.reload()
    else setBusy(false)
  }

  const signOut = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    // Clear any emulation first — the emulate route needs the auth cookie.
    if (isEmulating) await postEmulate(null)
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      /* cookie may already be gone */
    }
    window.location.href = '/login'
  }

  const showEmail = Boolean(actorEmail) && actorEmail !== actorLabel
  const adminTools = canManage && !isEmulating
  // The one admin control that survives emulation, and the one that lives in
  // the bar rather than the account menu — see the header comment.
  const canViewAs = canManage && users.length > 0
  const currentId = isEmulating ? viewerId : null

  return (
    <>
      {isEmulating && (
        <div className={isActing ? 'emu-frame emu-frame-act' : 'emu-frame'} aria-hidden="true" />
      )}
      <div
        className={[
          'session-bar',
          isEmulating ? 'emulating' : '',
          isActing ? 'acting' : '',
          away ? 'sb-away' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
      >
        {leading}
        <span className="sb-spacer" />
        {canViewAs ? (
          <ShellMenu
            align="end"
            triggerClassName="sb-viewas"
            triggerTitle={
              isEmulating ? 'View as someone else' : 'View the dashboard as someone else'
            }
            panelLabel={
              isEmulating ? 'Switch the person you are viewing as' : 'View as another user'
            }
            trigger={
              <>
                <ArrowLeftRight size={13} strokeWidth={2.5} aria-hidden="true" />
                <span className="sb-viewas-label">{isEmulating ? 'Switch' : 'View as'}</span>
              </>
            }
          >
            {(close, open) => (
              <>
                <div className="shm-head">
                  <div className="shm-name">
                    {isEmulating
                      ? `${isActing ? 'Acting as' : 'Viewing as'} ${viewerLabel}`
                      : 'View as'}
                  </div>
                  <div className="shm-sub">
                    {isEmulating
                      ? `Pick someone else — still signed in as ${actorLabel}.`
                      : 'See the dashboard as someone else. Read-only.'}
                  </div>
                </div>
                <div className="shm-sep" role="separator" />
                <ViewAsList
                  people={users}
                  currentId={currentId}
                  disabled={busy}
                  open={open}
                  autoFocus
                  onPick={(id) => {
                    close()
                    void viewAs(id)
                  }}
                />
                {isEmulating ? (
                  <>
                    <div className="shm-sep" role="separator" />
                    {/* Acting is refused for admins and developers. SAY SO
                        rather than hiding the control — a missing option reads
                        as a broken feature, which is exactly how this landed
                        the first time. */}
                    {canAct ? (
                      <button
                        type="button"
                        className="shm-item"
                        data-shm-item
                        disabled={busy}
                        onClick={() => {
                          close()
                          void setMode(isActing ? 'view' : 'act')
                        }}
                      >
                        {isActing ? 'Stop acting (back to read-only)' : `Act as ${viewerLabel}…`}
                        <span className="shm-hint">
                          {isActing
                            ? 'Changes are recorded as you, in their seat.'
                            : 'Make real changes as them. 15 minutes, fully audited.'}
                        </span>
                      </button>
                    ) : (
                      <div className="shm-item shm-item-note" role="note">
                        Acting as {viewerLabel} is not available
                        <span className="shm-hint">
                          You can only act as someone with fewer permissions than
                          you — never another admin or developer. This session is
                          read-only.
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="shm-item shm-item-quiet"
                      data-shm-item
                      disabled={busy}
                      onClick={() => {
                        close()
                        void exitViewAs()
                      }}
                    >
                      Stop viewing as
                    </button>
                  </>
                ) : null}
              </>
            )}
          </ShellMenu>
        ) : null}
        <ShellMenu
          align="end"
          triggerClassName="sb-account"
          triggerTitle={isEmulating ? 'Viewing as another user' : 'Account'}
          panelLabel="Account"
          trigger={
            isEmulating ? (
              <>
                <span className="sb-avatar sb-avatar-emu" aria-hidden="true">
                  {initialsOf(viewerLabel)}
                </span>
                <span className="sb-user">
                  <span className="sr-only">Signed in as {actorLabel}. </span>
                  <span className="sb-mode">Viewing as</span>
                  <strong>{viewerLabel}</strong>
                </span>
              </>
            ) : (
              <>
                <span className="sb-avatar" aria-hidden="true">
                  {initialsOf(actorLabel)}
                </span>
                {/* The visually hidden lead-in keeps the trigger's accessible
                    name a sentence, and the e2e suite's "Signed in as" check. */}
                <span className="sb-user">
                  <span className="sr-only">Signed in as </span>
                  <strong>{actorLabel}</strong>
                </span>
              </>
            )
          }
        >
          {(close) => (
            <>
              {isEmulating ? (
                <div className="shm-head">
                  <div className="shm-name">Viewing as {viewerLabel}</div>
                  <div className="shm-sub">Read-only. You are signed in as {actorLabel}.</div>
                </div>
              ) : (
                <div className="shm-head">
                  <div className="shm-name">{actorLabel}</div>
                  {showEmail ? <div className="shm-sub">{actorEmail}</div> : null}
                </div>
              )}
              <div className="shm-sep" role="separator" />
              <button
                type="button"
                className="shm-item"
                data-shm-item
                onClick={() => {
                  close()
                  setSettingsOpen(true)
                }}
              >
                Settings
              </button>
              {/* Crossing into the (hub) group is a full navigation, by design. */}
              <Link href={profileHref} className="shm-item" data-shm-item>
                Profile
              </Link>

              {adminTools ? (
                <>
                  <div className="shm-sep" role="separator" />
                  <Link href="/users" className="shm-item" data-shm-item>
                    Manage users
                  </Link>
                </>
              ) : null}

              <div className="shm-sep" role="separator" />
              <button
                type="button"
                className="shm-item shm-item-quiet"
                data-shm-item
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          )}
        </ShellMenu>
        {isEmulating ? (
          <button
            type="button"
            className="sb-exit"
            onClick={() => void exitViewAs()}
            disabled={busy}
          >
            Exit view-as
          </button>
        ) : null}
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profileHref={profileHref}
        actorLabel={actorLabel}
      />
    </>
  )
}

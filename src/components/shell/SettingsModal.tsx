'use client'

// Preferences for the whole dashboard, opened from the session bar in every
// app. Today that is one preference — the theme — plus a pointer to the
// profile page, which keeps owning identity and passkeys (those need real
// URLs and server checks; a modal is the wrong home for them).
//
// Theme selection applies INSTANTLY by rewriting <html data-theme> and is
// persisted in the awm-theme cookie so the server stamps the same attribute
// on the next paint (src/lib/theme.ts holds the contract). "System" removes
// the attribute and lets prefers-color-scheme decide in CSS.

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, themeDomAttr, type Theme } from '@/lib/theme'

import Modal from './Modal'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** The actor's profile page (`/u/<username>`, or `/u/me` without one). */
  profileHref: string
  actorLabel: string
}

function readCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' || attr === 'dark' ? attr : 'system'
}

function applyTheme(theme: Theme): void {
  const attr = themeDomAttr(theme)
  if (attr) document.documentElement.setAttribute('data-theme', attr)
  else document.documentElement.removeAttribute('data-theme')
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`
}

const THEMES: { value: Theme; label: string; swatch: string }[] = [
  { value: 'light', label: 'Light', swatch: 'st-sw-light' },
  { value: 'dark', label: 'Dark', swatch: 'st-sw-dark' },
  { value: 'system', label: 'System', swatch: 'st-sw-system' },
]

export default function SettingsModal({
  open,
  onClose,
  profileHref,
  actorLabel,
}: SettingsModalProps): React.JSX.Element {
  // 'system' matches SSR; the real value is read from <html> once open, so
  // this component never touches `document` during render.
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    if (open) setTheme(readCurrentTheme())
  }, [open])

  const choose = (value: Theme): void => {
    setTheme(value)
    applyTheme(value)
  }

  return (
    <Modal
      open={open}
      title="Settings"
      onBackdrop={onClose}
      foot={
        <button className="btn-light" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="st-body">
        <section>
          <h4 className="st-group-name">Theme</h4>
          <p className="st-group-sub">
            Applies to the dashboard on this browser. System follows your device’s
            appearance.
          </p>
          <div className="st-themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                className="st-theme"
                onClick={() => choose(t.value)}
              >
                <span className={`st-sw ${t.swatch}`} aria-hidden="true">
                  <span className="st-sw-bar" />
                  <span className="st-sw-tile" />
                  <span className="st-sw-tile" />
                </span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="st-note">
            The Offer Manager’s letters and forms stay light — printed letters and
            exports depend on it.
          </p>
        </section>

        <section className="st-profile">
          <span className="st-profile-main">
            <span className="st-profile-name">{actorLabel}</span>
            <span className="st-profile-sub">Name, username, and passkeys</span>
          </span>
          <Link className="st-profile-link" href={profileHref} onClick={onClose}>
            Edit profile
          </Link>
        </section>
      </div>
    </Modal>
  )
}

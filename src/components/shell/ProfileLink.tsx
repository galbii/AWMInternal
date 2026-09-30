'use client'

// The profile rail's shareable address. Settings became a PAGE instead of a
// modal precisely so the URL could be handed to someone, so the page hands it
// over in one click rather than making people select the address bar.
//
// The path is rendered on the server-safe side (it is just /u/<username>); the
// absolute URL is only ever read at click time, because `window` does not exist
// during the server render and the origin differs per deployment.

import React, { useEffect, useRef, useState } from 'react'

const HELD = 1800

export default function ProfileLink({ username }: { username: string }): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A pending "Copied" must not fire into an unmounted button.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const path = `/u/${username}`

  const copy = async (): Promise<void> => {
    const url = `${window.location.origin}${path}`
    try {
      // Absent on http origins and in older Safari — fall through to the
      // failure label rather than pretending the clipboard was written.
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), HELD)
  }

  return (
    <div className="pf-link">
      <code className="pf-link-path">{path}</code>
      <button
        type="button"
        className="pf-copy"
        onClick={() => void copy()}
        aria-label={`Copy the link to ${path}`}
      >
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy link'}
      </button>
      {/* Announced to a screen reader; the button's own label stays stable. */}
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Profile link copied to the clipboard.' : ''}
      </span>
    </div>
  )
}

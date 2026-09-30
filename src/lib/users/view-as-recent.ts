// "People I recently viewed as" — a per-browser convenience list behind the
// view-as picker (src/components/shell/ViewAsList.tsx), written from the two
// places emulation can start: the session bar's picker and the Users app's row
// menu. It is a HINT, never a permission: /api/emulate re-checks the actor's
// role and the target's emulationBlocked flag on every hop, and getViewer()
// re-checks them on every request after that.
//
// localStorage, like the offers app's own keys — it is a per-browser
// convenience, it must never reach the server, and a reader that throws
// (private windows, cleared or blocked site data) just means no recents.
// `nextRecent` is pure so the ordering rule can be tested without a browser.

export const VIEW_AS_RECENT_KEY = 'awm-viewas-recent'

/** Four fits above the full roster without pushing it off a short window. */
export const VIEW_AS_RECENT_MAX = 4

/** Most recent first, no duplicates, capped. */
export function nextRecent(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((v) => v !== id)].slice(0, VIEW_AS_RECENT_MAX)
}

export function readViewAsRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(VIEW_AS_RECENT_KEY)
    const val: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(val)) return []
    return val.filter((v): v is string => typeof v === 'string').slice(0, VIEW_AS_RECENT_MAX)
  } catch {
    return []
  }
}

export function rememberViewAs(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      VIEW_AS_RECENT_KEY,
      JSON.stringify(nextRecent(readViewAsRecent(), id)),
    )
  } catch {
    /* the list just does not persist */
  }
}

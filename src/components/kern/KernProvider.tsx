'use client'

// The app's state container. Owns the org document, the active tab, the shared
// search box, the toast and the confirm dialog — and is the only place that
// writes through the storage seam.
//
// Ported behaviour: K 8-36 (the module globals this replaces), 110-111
// (saveLocal / touch), 141-145 (toast), 198-207 (confirmDialog), 226 (a tab
// change clears the filter and any open branch).
//
// The source called `touch()` on every keystroke, which meant a full
// JSON.stringify + localStorage write per character. Here `update()` mutates a
// draft synchronously (so the UI stays responsive) and the write is debounced.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { loadState, persistState } from '@/lib/kern/storage'
import type { ConfirmState, KernApi, OrgState, TabId, ToastState } from '@/lib/kern/types'

import ConfirmDialog from './ui/ConfirmDialog'
import Toast from './ui/Toast'

const KernContext = createContext<KernApi | null>(null)

export function useKern(): KernApi {
  const ctx = useContext(KernContext)
  if (!ctx) throw new Error('useKern() must be used inside <KernProvider>')
  return ctx
}

/** How long to coalesce edits before writing. K 111 wrote on every change. */
const PERSIST_DEBOUNCE_MS = 400

const TAB_IDS: TabId[] = [
  'branches',
  'areas',
  'regions',
  'divisions',
  'titles',
  'archive',
  'employees',
  'roster',
  'data',
  'credit',
  'tenure',
  'analysis',
  'monthly',
  'highlight',
  'hierarchy',
  'builder',
]

const isTabId = (v: string | null): v is TabId => Boolean(v) && TAB_IDS.includes(v as TabId)

export function KernProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OrgState | null>(null)
  const [tab, setTabState] = useState<TabId>('branches')
  const [openBranchId, setOpenBranchId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // The live document. Every mutation goes through `update`, which writes here
  // first so back-to-back edits in one tick compose instead of clobbering.
  const stateRef = useRef<OrgState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- hydrate ------------------------------------------------------------
  useEffect(() => {
    let alive = true
    void loadState().then((s) => {
      if (!alive) return
      stateRef.current = s
      setState(s)
    })
    return () => {
      alive = false
    }
  }, [])

  // ---- the active tab lives in ?tab= so refresh and shared links work ------
  // (Deviation D5 — the source always reopened on Branches.)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (isTabId(t)) setTabState(t)
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    const s = stateRef.current
    if (!s) return
    const ok = await persistState(s)
    setDirty(!ok)
    if (!ok)
      setToastState({ msg: 'Could not save — browser storage is full or blocked.', err: true })
  }, [])

  const schedulePersist = useCallback(() => {
    setDirty(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void flush()
    }, PERSIST_DEBOUNCE_MS)
  }, [flush])

  // A pending debounce must not be lost when the tab goes away. K 2096 used
  // beforeunload only to WARN; here we actually write.
  useEffect(() => {
    const onHide = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        void flush()
      }
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      onHide()
    }
  }, [flush])

  const update = useCallback(
    (fn: (draft: OrgState) => void) => {
      const cur = stateRef.current
      if (!cur) return
      // Shallow clone + mutate: the source mutated in place, and the views read
      // deep paths, so a structural clone here would be both slow and pointless.
      const next: OrgState = { ...cur }
      fn(next)
      stateRef.current = next
      setState(next)
      schedulePersist()
    },
    [schedulePersist],
  )

  const replace = useCallback(
    (next: OrgState) => {
      stateRef.current = next
      setState(next)
      setOpenBranchId(null)
      schedulePersist()
    },
    [schedulePersist],
  )

  const setTab = useCallback((t: TabId) => {
    // K 226 — a tab change clears the search box and closes the branch editor.
    setTabState(t)
    setFilter('')
    setOpenBranchId(null)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url)
  }, [])

  const toast = useCallback((msg: string, err?: boolean) => {
    setToastState({ msg, err })
  }, [])

  const confirmDialog = useCallback(
    (title: string, msg: string, onYes: () => void, yesLabel?: string) => {
      setConfirm({ title, msg, onYes, yesLabel })
    },
    [],
  )

  const api = useMemo<KernApi | null>(() => {
    if (!state) return null
    return {
      state,
      loading: false,
      dirty,
      update,
      replace,
      tab,
      setTab,
      openBranchId,
      openBranch: setOpenBranchId,
      filter,
      setFilter,
      toast,
      confirmDialog,
    }
  }, [state, dirty, update, replace, tab, setTab, openBranchId, filter, toast, confirmDialog])

  if (!api) {
    return (
      <div className="kern">
        <main>
          <div className="empty">Loading…</div>
        </main>
      </div>
    )
  }

  return (
    <KernContext.Provider value={api}>
      {children}
      <Toast state={toastState} onDone={() => setToastState(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </KernContext.Provider>
  )
}

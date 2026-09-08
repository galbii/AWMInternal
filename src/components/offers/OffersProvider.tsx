'use client'

// The app-shell state container. Owns the record list, the current selection,
// view/sub-tab routing, the single toast and the confirm modal, and is the only
// place that writes to localStorage.
//
// Ported behaviour: S2 618–636 (commitCurrent), 670–686 (openRecord/newRecord),
// 930–944 (delete / duplicate), 881–897 (toast / modal), S3 465 (setStage).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { parseIntakeCode, submissionToRecord } from '@/lib/offers/intake'
import { applyImport } from '@/lib/offers/spreadsheet'
import { missingRequired, nowIso, uid } from '@/lib/offers/schema'
import {
  INBOX_KEY,
  importedSids,
  loadRecords,
  markImported,
  persistRecords,
  persistRecordsUpsertOnly,
  readAndClearInbox,
} from '@/lib/offers/storage'
import type {
  EditorSub,
  ImportResult,
  IntakeSubmission,
  OfferData,
  OfferRecord,
  OffersApi,
  RecordPatch,
  RecordStatus,
  Stage,
  View,
} from '@/lib/offers/types'

import Modal from '@/components/shell/Modal'

import Toast, { type ToastState } from './Toast'

interface ConfirmState {
  title: string
  msg: string
  onYes: () => void
  onCancel?: () => void
}

const OffersContext = createContext<OffersApi | null>(null)

export function useOffers(): OffersApi {
  const ctx = useContext(OffersContext)
  if (!ctx) throw new Error('useOffers() must be used inside <OffersProvider>')
  return ctx
}

function scrollTop(): void {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
}

export interface OffersProviderProps {
  children: React.ReactNode
  /** Server-fetched seed for the standalone /offers/[id] page. */
  initialRecords?: OfferRecord[]
  initialCurrentId?: string | null
  /**
   * Single-record mode (the /offers/[id] page): no server hydrate on mount, no
   * intake poller, no `#rec=` import, and UPSERT-ONLY persistence — a one-record
   * view of the world must never compute removals or list positions.
   */
  standalone?: boolean
}

export function OffersProvider({
  children,
  initialRecords,
  initialCurrentId,
  standalone,
}: OffersProviderProps) {
  const [records, setRecords] = useState<OfferRecord[]>(initialRecords ?? [])
  const [currentId, setCurrentId] = useState<string | null>(initialCurrentId ?? null)
  const [view, setView] = useState<View>(standalone ? 'editor' : 'pipeline')
  const [sub, setSub] = useState<EditorSub>('letter')
  const [toastState, setToastState] = useState<ToastState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Mirrors of the state that mutators read synchronously, so a handler never
  // works from a stale closure.
  const recordsRef = useRef<OfferRecord[]>(initialRecords ?? [])
  const currentIdRef = useRef<string | null>(initialCurrentId ?? null)
  /** The mounted form's debounced-autosave flush (S2 670 / 680 `if(dirty)commitCurrent(true)`). */
  const pendingFlushRef = useRef<(() => void) | null>(null)

  // Records hydrate here, never during SSR render. `loadRecords` is async now
  // (it fetches from Payload); anything the user created before the fetch
  // resolved is kept and the server list merged in behind it.
  useEffect(() => {
    if (standalone) return
    let cancelled = false
    void loadRecords().then((loaded) => {
      if (cancelled || !loaded.length) return
      const have = new Set(recordsRef.current.map((r) => r.id))
      const merged = [...recordsRef.current, ...loaded.filter((r) => !have.has(r.id))]
      recordsRef.current = merged
      setRecords(merged)
    })
    return () => {
      cancelled = true
    }
  }, [standalone])

  const toast = useCallback((msg: string, err?: boolean) => {
    setToastState({ msg, err: Boolean(err) })
  }, [])

  /** The single write path: optimistic state first, then the server persist. */
  const commit = useCallback(
    (next: OfferRecord[]) => {
      recordsRef.current = next
      setRecords(next)
      const persist = standalone ? persistRecordsUpsertOnly : persistRecords
      void persist(next).then((ok) => {
        if (!ok) toast('Could not save to the server — will retry on the next change.', true)
      })
    },
    [standalone, toast],
  )

  const setCurrent = useCallback((id: string | null) => {
    currentIdRef.current = id
    setCurrentId(id)
  }, [])

  const registerPendingFlush = useCallback((fn: (() => void) | null) => {
    pendingFlushRef.current = fn
  }, [])

  /**
   * Commit whatever the form has pending BEFORE the current record changes, so a
   * switch inside the 600ms autosave window still lands on the OLD record.
   */
  const flushPending = useCallback(() => {
    const fn = pendingFlushRef.current
    if (fn) fn()
  }, [])

  const showView = useCallback((v: View) => {
    setView(v)
    scrollTop()
  }, [])

  const showSub = useCallback((s: EditorSub) => {
    setSub(s)
    scrollTop()
  }, [])

  // S3 292–293 — currentLetterRecord() commits first; openLetter() refuses when
  // there is still no record to write a letter for.
  const openLetter = useCallback(() => {
    flushPending()
    if (!currentIdRef.current) {
      toast('Add the new hire details first, then generate the letter.', true)
      return
    }
    setSub('letter')
    scrollTop()
  }, [flushPending, toast])

  // S2 618–636 (commitCurrent). `manual` is the source's `!isAuto`.
  const commitForm = useCallback(
    (d: OfferData, manual: boolean): string | null => {
      const anyData = Object.values(d).some((v) => v && String(v).trim() !== '')
      const status: RecordStatus = missingRequired(d).length === 0 ? 'complete' : 'draft'
      const list = recordsRef.current
      const cur = currentIdRef.current

      if (cur) {
        const idx = list.findIndex((r) => r.id === cur)
        if (idx >= 0) {
          const next = list.slice()
          next[idx] = { ...next[idx], data: d, status, updated: nowIso() }
          commit(next)
        }
        if (manual) toast('Request saved')
        return cur
      }

      // Never create a record for an untouched new form.
      if (!anyData) return null

      const id = uid()
      const now = nowIso()
      commit([{ id, data: d, status, created: now, updated: now }, ...list])
      setCurrent(id)
      if (manual) toast('Request saved')
      return id
    },
    [commit, setCurrent, toast],
  )

  // S2 670–678. View switching stays with the caller (S3 742 does
  // showView → openRecord → showSub).
  const openRecord = useCallback(
    (id: string) => {
      if (!recordsRef.current.some((r) => r.id === id)) return
      flushPending() // S2 670
      setCurrent(id)
      scrollTop()
    },
    [flushPending, setCurrent],
  )

  // S2 679–685 plus S3 758: "+ New Request" always lands on the details sub-tab.
  const newRecord = useCallback(() => {
    flushPending() // S2 680
    setCurrent(null)
    setView('editor')
    setSub('details')
    scrollTop()
  }, [flushPending, setCurrent])

  // The two delete paths use different words — S2 936–939 says "Request deleted.",
  // S3 748 says "Deleted." — so the toast belongs to the caller, not here.
  const deleteRecord = useCallback(
    (id: string) => {
      commit(recordsRef.current.filter((r) => r.id !== id))
      if (currentIdRef.current === id) setCurrent(null)
    },
    [commit, setCurrent],
  )

  // S3 737 (bulk delete from the pipeline table). As with `deleteRecord`, the
  // caller owns the toast so the message is written in exactly one place.
  const deleteRecords = useCallback(
    (ids: string[]) => {
      commit(recordsRef.current.filter((r) => ids.indexOf(r.id) < 0))
      if (currentIdRef.current && ids.indexOf(currentIdRef.current) >= 0) setCurrent(null)
    },
    [commit, setCurrent],
  )

  // S2 940–944. The caller commits any pending edit first, then hands us the
  // form values to copy.
  const duplicateRecord = useCallback(
    (d: OfferData) => {
      const anyData = Object.values(d).some((v) => v && String(v).trim() !== '')
      if (!anyData) {
        toast('Nothing to duplicate.', true)
        return
      }
      const copy: OfferData = { ...d }
      copy.employeeName = (copy.employeeName || '') + ' (copy)'
      const id = uid()
      const now = nowIso()
      commit([
        {
          id,
          data: copy,
          status: missingRequired(copy).length ? 'draft' : 'complete',
          created: now,
          updated: now,
        },
        ...recordsRef.current,
      ])
      setCurrent(id)
      toast('Duplicated.')
    },
    [commit, setCurrent, toast],
  )

  // S3 465.
  const setStage = useCallback(
    (id: string, stage: Stage) => {
      const list = recordsRef.current
      const idx = list.findIndex((r) => r.id === id)
      if (idx < 0) return
      const next = list.slice()
      next[idx] = { ...next[idx], stage }
      commit(next)
      const lbl = stage === 'pipeline' ? 'Pipeline' : stage === 'hired' ? 'Hired' : 'Archived'
      toast('Moved to ' + lbl + '.')
    },
    [commit, toast],
  )

  const addRecords = useCallback(
    (recs: OfferRecord[]) => {
      if (!recs.length) return
      commit([...recs, ...recordsRef.current])
    },
    [commit],
  )

  /**
   * S2 946–953 — spreadsheet import. The merge runs HERE, against
   * `recordsRef.current`, rather than against a component's render snapshot: the
   * 2.5s intake poller clears the inbox as it drains it, so a submission that
   * lands while the file is being parsed exists only in `records` — a caller that
   * computed the merge from a stale snapshot and then replaced the whole list
   * would silently discard it.
   *
   * `applyImport` awaits `import('xlsx')` internally, and that first load is the
   * one place a timer callback can interleave. Warming the module registry before
   * the snapshot means the ref is read and committed without ever yielding to the
   * macrotask queue in between.
   */
  const importSpreadsheet = useCallback(
    async (fileData: ArrayBuffer): Promise<ImportResult> => {
      await import('xlsx')
      const result = await applyImport(recordsRef.current, fileData)
      commit(result.records)
      return result
    },
    [commit],
  )

  const patchRecord = useCallback(
    (id: string, patch: Partial<OfferRecord>) => {
      const list = recordsRef.current
      const idx = list.findIndex((r) => r.id === id)
      if (idx < 0) return
      const next = list.slice()
      next[idx] = { ...next[idx], ...patch, id: next[idx].id }
      commit(next)
    },
    [commit],
  )

  /**
   * Batch form of `patchRecord`. Bulk actions (S3 604–612 signatory assign) touch
   * every selected row; patching one at a time re-serialized and re-wrote the whole
   * record list per id, which is O(N²) over the selection. One commit instead.
   */
  const patchRecords = useCallback(
    (patches: RecordPatch[]) => {
      if (!patches.length) return
      const next = recordsRef.current.slice()
      let touched = false
      patches.forEach((p) => {
        const idx = next.findIndex((r) => r.id === p.id)
        if (idx < 0) return
        next[idx] = { ...next[idx], ...p.patch, id: next[idx].id }
        touched = true
      })
      if (touched) commit(next)
    },
    [commit],
  )

  // S2 895–897 (confirmModal).
  const confirmDialog = useCallback(
    (title: string, msg: string, onYes: () => void, onCancel?: () => void) => {
      setConfirm({ title, msg, onYes, onCancel })
    },
    [],
  )

  /* ===================== INTAKE SYNC (S3 763–773) ===================== */

  /** addSubmission (S3 766–769) for a batch: dedupe by sid, prepend, persist. */
  const addSubmissions = useCallback(
    (subs: IntakeSubmission[]): number => {
      const seen = importedSids()
      const fresh: OfferRecord[] = []
      subs.forEach((sub) => {
        if (!sub || !sub.data) return
        if (sub.sid && seen.indexOf(sub.sid) >= 0) return
        if (sub.sid) seen.push(sub.sid)
        fresh.push(submissionToRecord(sub))
        markImported(sub.sid)
      })
      if (!fresh.length) return 0
      // S3 767 unshifts one at a time, so the LAST submission ends up first.
      addRecords(fresh.slice().reverse())
      return fresh.length
    },
    [addRecords],
  )

  // S3 771–773 — drain the same-browser inbox on mount, every 2.5s, and whenever
  // another tab writes it. `readAndClearInbox` clears storage as it reads, so the
  // drained rows must be committed immediately — `addRecords` persists synchronously.
  useEffect(() => {
    if (standalone) return
    const drain = (): void => {
      const n = addSubmissions(readAndClearInbox())
      if (n) toast(n + ' new request' + (n !== 1 ? 's' : '') + ' synced from the intake form.')
    }
    drain()
    const timer = window.setInterval(drain, 2500)
    const onStorage = (e: StorageEvent): void => {
      if (e.key === INBOX_KEY) drain()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', onStorage)
    }
  }, [addSubmissions, standalone, toast])

  // S3 772 — a prefilled `#rec=…` link imports once, then the hash is cleaned up.
  useEffect(() => {
    if (standalone) return
    const m = (window.location.hash || '').match(/rec=([A-Za-z0-9_-]+)/)
    if (!m) return
    const sub = parseIntakeCode(m[1])
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch {
      /* nothing to clean up */
    }
    setView('pipeline')
    if (!sub) {
      toast('Could not read that code.', true)
      return
    }
    const n = addSubmissions([sub])
    toast(
      n
        ? 'Imported ' + (sub.data.employeeName || 'request') + '.'
        : 'That request was already imported.',
    )
  }, [addSubmissions, standalone, toast])

  const api = useMemo<OffersApi>(
    () => ({
      records,
      currentId,
      view,
      sub,
      commitForm,
      openRecord,
      newRecord,
      registerPendingFlush,
      deleteRecord,
      deleteRecords,
      duplicateRecord,
      setStage,
      addRecords,
      importSpreadsheet,
      patchRecord,
      patchRecords,
      toast,
      confirmDialog,
      showView,
      showSub,
      openLetter,
    }),
    [
      records,
      currentId,
      view,
      sub,
      commitForm,
      openRecord,
      newRecord,
      registerPendingFlush,
      deleteRecord,
      deleteRecords,
      duplicateRecord,
      setStage,
      addRecords,
      importSpreadsheet,
      patchRecord,
      patchRecords,
      toast,
      confirmDialog,
      showView,
      showSub,
      openLetter,
    ],
  )

  const closeConfirm = useCallback(() => setConfirm(null), [])

  return (
    <OffersContext.Provider value={api}>
      {children}
      <Toast state={toastState} />
      <Modal
        open={confirm !== null}
        title={confirm ? confirm.title : 'Notice'}
        onBackdrop={closeConfirm}
        foot={
          <>
            <button
              className="btn-light"
              onClick={() => {
                const c = confirm
                closeConfirm()
                if (c && c.onCancel) c.onCancel()
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                const c = confirm
                closeConfirm()
                if (c) c.onYes()
              }}
            >
              Continue
            </button>
          </>
        }
      >
        <p>{confirm ? confirm.msg : ''}</p>
      </Modal>
    </OffersContext.Provider>
  )
}

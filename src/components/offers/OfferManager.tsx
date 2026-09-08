'use client'

// The app shell: header toolbar (S1 305–332 minus the data-file button, banner
// and reconnect overlay), tab bar (S1 334–340) with live counts (S3 576–578),
// and the five view sections (S1 342–430, S3 616–622).
//
// Every view stays mounted and is shown/hidden by the `.view`/`.subview` classes,
// exactly as the source does — that is what keeps the form's state (and its
// pending autosave) alive across a tab switch.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { safeFileBase } from '@/lib/offers/format'
import { parseIntakeCode, submissionToRecord } from '@/lib/offers/intake'
import { offerPacketHTML } from '@/lib/offers/letter-exports'
import {
  BACKUP_FILENAME,
  backupRecordsToRecords,
  buildBackupBlob,
  downloadBlob,
  downloadTemplate,
  exportCsvAll,
  exportXlsxAll,
  parseBackup,
} from '@/lib/offers/spreadsheet'
import { importedSids, markImported } from '@/lib/offers/storage'
import type { EditorSub, OfferRecord, Stage, View } from '@/lib/offers/types'

import Modal from '@/components/shell/Modal'

import AnalysisView from './AnalysisView'
import LetterView from './LetterView'
import { useOffers } from './OffersProvider'
import RecordList from './RecordList'
import RequestForm from './RequestForm'
import StageTable from './StageTable'

const stageOf = (r: OfferRecord): Stage => r.stage || 'pipeline'

export default function OfferManager() {
  const {
    records,
    currentId,
    view,
    sub,
    addRecords,
    confirmDialog,
    newRecord,
    openLetter,
    importSpreadsheet,
    showSub,
    showView,
    toast,
  } = useOffers()

  const [menuOpen, setMenuOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeText, setCodeText] = useState('')

  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const fileImportRef = useRef<HTMLInputElement | null>(null)
  const fileRestoreRef = useRef<HTMLInputElement | null>(null)

  // S3 430 — any click outside the dropdown closes the menu.
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const el = dropdownRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [menuOpen])

  // S3 576–578.
  const counts = useMemo(() => {
    const c = { pipeline: 0, hired: 0, archived: 0 }
    records.forEach((r) => {
      c[stageOf(r)] += 1
    })
    return c
  }, [records])

  /* ---------------- toolbar handlers ---------------- */

  const onTemplate = useCallback(async () => {
    await downloadTemplate()
    toast('Template downloaded.') // S2 862
  }, [toast])

  // S2 800–808
  const onExportXlsx = useCallback(async () => {
    if (!records.length) {
      toast('Nothing to export yet.', true)
      return
    }
    await exportXlsxAll(records)
    toast('Exported ' + records.length + ' request(s).')
  }, [records, toast])

  // S2 809–815
  const onExportCsv = useCallback(async () => {
    if (!records.length) {
      toast('Nothing to export yet.', true)
      return
    }
    await exportCsvAll(records)
    toast('Exported CSV.')
  }, [records, toast])

  // S2 867–871
  const onBackup = useCallback(() => {
    downloadBlob(buildBackupBlob(records), BACKUP_FILENAME())
    toast('Backup saved.')
  }, [records, toast])

  // S3 314–350
  const onShare = useCallback(() => {
    const rec = currentId ? records.find((r) => r.id === currentId) : undefined
    if (!rec) {
      toast('Add the new hire details first, then share.', true)
      return
    }
    const { name, doc } = offerPacketHTML(rec)
    downloadBlob(
      new Blob([doc], { type: 'text/html' }),
      'Offer_Packet_' + safeFileBase(name, 'record') + '.html',
    )
    toast('Shareable offer packet exported.')
  }, [currentId, records, toast])

  // S2 946–953 — spreadsheet import.
  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target
      const file = input.files && input.files[0]
      input.value = ''
      if (!file) return
      try {
        // The provider owns the merge: it re-reads its live record list after the
        // parse, so a submission drained by the 2.5s intake poller mid-import is
        // not clobbered by a stale write-back.
        const result = await importSpreadsheet(await file.arrayBuffer())
        const parts: string[] = []
        if (result.added) parts.push(result.added + ' added')
        if (result.updated) parts.push(result.updated + ' updated')
        // S2 765–766
        toast(
          'Imported from "' +
            result.sheetName +
            '": ' +
            (parts.join(', ') || 'no new rows') +
            '.',
        )
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not read file.', true)
      }
    },
    [importSpreadsheet, toast],
  )

  // S2 872–878 / 964–968 — restore from a backup file.
  const onRestoreFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target
      const file = input.files && input.files[0]
      input.value = ''
      if (!file) return
      const text = await file.text()
      try {
        JSON.parse(text)
      } catch {
        toast('Invalid backup file.', true)
        return
      }
      const backup = parseBackup(text)
      if (!backup) {
        toast('Not a valid backup file.', true)
        return
      }
      const n = backup.records.length
      confirmDialog(
        'Restore backup',
        'This will add ' + n + ' record(s) from the backup to your current list. Continue?',
        () => {
          // S2 875 unshifts one at a time, so the backup order ends up reversed
          // at the head of the list; `addRecords` prepends the array as given.
          addRecords(backupRecordsToRecords(backup).reverse())
          toast('Restored ' + n + ' record(s).')
        },
      )
    },
    [addRecords, confirmDialog, toast],
  )

  // S3 770 / 774 — import a submission code or prefilled link.
  const onImportCode = useCallback(() => {
    const raw = codeText
    setCodeOpen(false)
    setCodeText('')
    if (!raw.trim()) {
      toast('Nothing to import.', true)
      return
    }
    const sub = parseIntakeCode(raw)
    if (!sub) {
      toast('Not a valid intake code.', true)
      return
    }
    showView('pipeline')
    if (sub.sid && importedSids().indexOf(sub.sid) >= 0) {
      toast('That request was already imported.')
      return
    }
    addRecords([submissionToRecord(sub)])
    markImported(sub.sid)
    toast('Imported ' + (sub.data.employeeName || 'request') + '.')
  }, [addRecords, codeText, showView, toast])

  const menuAction = useCallback((fn: () => void | Promise<void>) => {
    return () => {
      setMenuOpen(false) // S3 429
      void fn()
    }
  }, [])

  const viewCls = (v: View) => (view === v ? 'view active' : 'view')
  const tabCls = (v: View) => (view === v ? 'tab active' : 'tab')
  const subViewCls = (s: EditorSub) => (sub === s ? 'subview active' : 'subview')
  const subTabCls = (s: EditorSub) => (sub === s ? 'subtab active' : 'subtab')

  /* ---------------- view bodies (S1 342–430) ---------------- */

  // S3 759 — the letter sub-tab runs openLetter(), which flushes pending form
  // edits and refuses when there is no record yet; "New Hire Details" just shows.
  const editorContent = (
    <>
      <div className="subtabs" id="subtabs">
        <button type="button" className={subTabCls('letter')} onClick={openLetter}>
          Offer Letter
        </button>
        <button type="button" className={subTabCls('details')} onClick={() => showSub('details')}>
          New Hire Details
        </button>
      </div>
      <div className={subViewCls('letter')} id="sub-letter">
        <LetterView />
      </div>
      <div className={subViewCls('details')} id="sub-details">
        <div className="wrap">
          <RecordList />
          <RequestForm />
        </div>
      </div>
    </>
  )

  return (
    <>
      <header className="app">
        <h1>Offer &amp; New Hire Request Manager</h1>
        <span className="ver">v1.6 · build 0820-1921</span>
        <div className="spacer"></div>
        <div className="toolbar">
          <button className="btn-ghost" onClick={() => newRecord()}>
            + New Request
          </button>
          <button className="btn-ghost" onClick={() => fileImportRef.current?.click()}>
            Import Spreadsheet
          </button>
          <button className="btn-ghost" onClick={() => void onTemplate()}>
            Download Template
          </button>
          <div className="dropdown" ref={dropdownRef}>
            <button className="btn-ghost" onClick={() => setMenuOpen((o) => !o)}>
              Export / Backup <span className="caret">▾</span>
            </button>
            <div className={menuOpen ? 'menu open' : 'menu'}>
              <button onClick={menuAction(onExportXlsx)}>Export All (.xlsx)</button>
              <button onClick={menuAction(onExportCsv)}>Export (.csv)</button>
              <button onClick={menuAction(onShare)}>Share Current</button>
              <div className="menu-sep"></div>
              <button onClick={menuAction(onBackup)}>Backup (.json)</button>
              <button onClick={menuAction(() => fileRestoreRef.current?.click())}>Restore</button>
              <div className="menu-sep"></div>
              <button onClick={menuAction(() => setCodeOpen(true))}>Import from Code / Link</button>
            </div>
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          ref={fileImportRef}
          onChange={(e) => void onImportFile(e)}
        />
        <input
          type="file"
          accept=".json"
          ref={fileRestoreRef}
          onChange={(e) => void onRestoreFile(e)}
        />
      </header>

      <nav className="tabbar">
        <button className={tabCls('pipeline')} onClick={() => showView('pipeline')}>
          Pipeline ({counts.pipeline})
        </button>
        <button className={tabCls('hired')} onClick={() => showView('hired')}>
          Hired ({counts.hired})
        </button>
        <button className={tabCls('archived')} onClick={() => showView('archived')}>
          Archived ({counts.archived})
        </button>
        <button className={tabCls('analysis')} onClick={() => showView('analysis')}>
          Analysis
        </button>
        <button
          className={tabCls('editor')}
          style={{ display: view === 'editor' ? undefined : 'none' }}
          onClick={() => showView('editor')}
        >
          Editor
        </button>
      </nav>

      {/* StageTable renders its own BulkToolbar for the pipeline stage. */}
      <section className={viewCls('pipeline')}>
        <StageTable stage="pipeline" />
      </section>
      <section className={viewCls('hired')}>
        <StageTable stage="hired" />
      </section>
      <section className={viewCls('archived')}>
        <StageTable stage="archived" />
      </section>
      <section className={viewCls('analysis')}>
        <AnalysisView />
      </section>
      <section className={viewCls('editor')}>{editorContent}</section>

      {/* S3 774 — Import from Code / Link */}
      <Modal
        open={codeOpen}
        title="Import from Code / Link"
        onBackdrop={() => setCodeOpen(false)}
        foot={
          <>
            <button className="btn-light" onClick={() => setCodeOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onImportCode}>
              Import
            </button>
          </>
        }
      >
        <p style={{ margin: '0 0 8px' }}>
          Paste a submission <b>code</b> or a prefilled <b>link</b> from an intake form:
        </p>
        <textarea
          rows={4}
          value={codeText}
          onChange={(e) => setCodeText(e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid var(--line)',
            borderRadius: 7,
            fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
            fontSize: 12,
          }}
        />
      </Modal>
    </>
  )
}

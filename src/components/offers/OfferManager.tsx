'use client'

// The app shell. Ported from S1 305–430 / S3 576–622, restructured 2026-09:
//
//  - The header + tab strip became a LEFT SIDEBAR (`.om-side`). `header.app`
//    is now the sidebar's masthead and `nav.tabbar` its vertical view list —
//    both class names kept on purpose (the e2e suite and the print rules
//    address them by name). Pipeline / Hired / Archived / All / Analysis, with
//    Editor appearing only while a request is open, exactly as the tab did.
//  - The toolbar's "+ New Request" and "More ▾" moved to the corner action hub
//    (`ActionHub`), which unfolds on hover or tap.
//  - "All" is a new cross-stage table (StageTable with stage="all").
//
// Every view stays mounted and is shown/hidden by the `.view`/`.subview`
// classes, exactly as the source does — that is what keeps the form's state
// (and its pending autosave) alive across a view switch.

import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  DatabaseBackup,
  FileDown,
  FilePen,
  FileSpreadsheet,
  FileText,
  Kanban,
  LayoutList,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Share2,
  Sheet,
  UserCheck,
  Users,
} from 'lucide-react'
import Image from 'next/image'
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

import ActionHub, { type HubGroup } from './ActionHub'
import AppMembers from '@/components/shell/AppMembers'

import AnalysisView from './AnalysisView'
import LetterView from './LetterView'
import { useOffers } from './OffersProvider'
import RecordList from './RecordList'
import RequestForm from './RequestForm'
import StageTable from './StageTable'

const stageOf = (r: OfferRecord): Stage => r.stage || 'pipeline'

/** localStorage key for the collapsed-rail preference (a new key; the frozen `onhr_*` set is untouched). */
const SIDEBAR_KEY = 'onhr_sidebar_collapsed'

type TableView = Exclude<View, 'analysis' | 'users' | 'editor'>

interface NavItem {
  view: TableView
  label: string
  icon: LucideIcon
}

/** The funnel, in funnel order, then the cross-stage total. */
const STAGE_NAV: NavItem[] = [
  { view: 'pipeline', label: 'Pipeline', icon: Kanban },
  { view: 'hired', label: 'Hired', icon: UserCheck },
  { view: 'archived', label: 'Archived', icon: Archive },
  { view: 'all', label: 'All', icon: LayoutList },
]

/** The title row above each view's content, now that the header no longer names the page. */
const VIEW_HEAD: Record<Exclude<View, 'editor'>, { title: string; blurb: string }> = {
  pipeline: { title: 'Pipeline', blurb: 'Offers out and awaiting a decision.' },
  hired: { title: 'Hired', blurb: 'Accepted offers, ready for onboarding.' },
  archived: { title: 'Archived', blurb: 'Declined, withdrawn or expired requests.' },
  all: { title: 'All requests', blurb: 'Every request, across every stage.' },
  analysis: { title: 'Analysis', blurb: 'Acceptance rates and monthly volume.' },
  users: { title: 'Users', blurb: 'Who can open the Offer & New Hire Manager.' },
}

function ViewHead({ view }: { view: Exclude<View, 'editor'> }) {
  const h = VIEW_HEAD[view]
  return (
    <div className="om-view-head">
      <h2>{h.title}</h2>
      <p className="om-view-blurb">{h.blurb}</p>
    </div>
  )
}

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

  const [codeOpen, setCodeOpen] = useState(false)
  const [codeText, setCodeText] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const fileImportRef = useRef<HTMLInputElement | null>(null)
  const fileRestoreRef = useRef<HTMLInputElement | null>(null)

  // The rail preference is read after mount so the server and first client
  // render agree (expanded); a collapsed user sees one frame of the full rail.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_KEY) === '1') setCollapsed(true)
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      } catch {
        /* preference simply does not persist */
      }
      return next
    })
  }, [])

  // S3 576–578, plus the cross-stage total for "All".
  const counts = useMemo(() => {
    const c: Record<TableView, number> = { pipeline: 0, hired: 0, archived: 0, all: records.length }
    records.forEach((r) => {
      c[stageOf(r)] += 1
    })
    return c
  }, [records])

  const currentName = useMemo(() => {
    const rec = currentId ? records.find((r) => r.id === currentId) : undefined
    const d = rec ? rec.data : {}
    return (d.employeeName || '').trim() || (d.preferredName || '').trim() || 'New Request'
  }, [currentId, records])

  /* ---------------- action handlers (formerly the header toolbar) ---------------- */

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

  /* ---------------- the corner hub's contents ---------------- */

  const hubGroups: HubGroup[] = useMemo(
    () => [
      {
        label: 'Import',
        actions: [
          {
            id: 'import-xlsx',
            label: 'Import spreadsheet',
            hint: '.xlsx, .xls or .csv',
            icon: FileSpreadsheet,
            run: () => fileImportRef.current?.click(),
          },
          {
            id: 'import-code',
            label: 'Import from code or link',
            hint: 'Paste an intake submission',
            icon: Link2,
            run: () => setCodeOpen(true),
          },
          {
            id: 'template',
            label: 'Download template',
            hint: 'Blank .xlsx to fill in',
            icon: FileDown,
            run: onTemplate,
          },
        ],
      },
      {
        label: 'Export',
        actions: [
          {
            id: 'export-xlsx',
            label: 'Export all to Excel',
            hint: 'One .xlsx workbook',
            icon: Sheet,
            run: onExportXlsx,
          },
          {
            id: 'export-csv',
            label: 'Export all to CSV',
            icon: FileText,
            run: onExportCsv,
          },
          {
            id: 'share',
            label: 'Share current request',
            hint: 'Offer packet as .html',
            icon: Share2,
            run: onShare,
          },
        ],
      },
      {
        label: 'Backup',
        actions: [
          {
            id: 'backup',
            label: 'Back up all requests',
            hint: 'Saves a .json file',
            icon: DatabaseBackup,
            run: onBackup,
          },
          {
            id: 'restore',
            label: 'Restore from backup',
            hint: 'Adds records, never replaces',
            icon: ArchiveRestore,
            run: () => fileRestoreRef.current?.click(),
          },
        ],
      },
    ],
    [onBackup, onExportCsv, onExportXlsx, onShare, onTemplate],
  )

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
      <div className={collapsed ? 'om-shell om-collapsed' : 'om-shell'}>
        {/* A <div>, not <aside>: offers.css hides every <aside> (the ported
            saved-request rail), and this sidebar must not inherit that. */}
        <div className="om-side">
          <div className="om-side-inner">
            <header className="app">
              <Image
                className="om-brand"
                src="/brand/awm-logo.png"
                alt=""
                width={34}
                height={34}
                priority
              />
              <button
                type="button"
                className="om-collapse"
                onClick={toggleCollapsed}
                aria-pressed={collapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? (
                  <PanelLeftOpen size={17} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <PanelLeftClose size={17} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
              <h1>Offer &amp; New Hire Request Manager</h1>
            </header>

            <nav className="tabbar" aria-label="Views">
              {STAGE_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.view}
                    type="button"
                    className={tabCls(item.view)}
                    aria-current={view === item.view ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={() => showView(item.view)}
                  >
                    <Icon className="om-tab-icon" size={17} strokeWidth={1.75} aria-hidden="true" />
                    <span className="om-tab-text">{item.label}</span>
                    <span className="tab-count">{counts[item.view]}</span>
                  </button>
                )
              })}

              <div className="om-nav-sep" role="separator" />

              <button
                type="button"
                className={tabCls('analysis')}
                aria-current={view === 'analysis' ? 'page' : undefined}
                title={collapsed ? 'Analysis' : undefined}
                onClick={() => showView('analysis')}
              >
                <BarChart3
                  className="om-tab-icon"
                  size={17}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="om-tab-text">Analysis</span>
              </button>

              {/* Per-app membership (2026-09): who can open this app, managed
                  here rather than only in the /users directory. */}
              <button
                type="button"
                className={tabCls('users')}
                aria-current={view === 'users' ? 'page' : undefined}
                title={collapsed ? 'Users' : undefined}
                onClick={() => showView('users')}
              >
                <Users className="om-tab-icon" size={17} strokeWidth={1.75} aria-hidden="true" />
                <span className="om-tab-text">Users</span>
              </button>

              {/* S1 340: the Editor tab exists only while a request is open. */}
              {view === 'editor' ? (
                <>
                  <div className="om-nav-sep" role="separator" />
                  <button
                    type="button"
                    className={tabCls('editor')}
                    aria-current="page"
                    title={collapsed ? 'Editor: ' + currentName : undefined}
                    onClick={() => showView('editor')}
                  >
                    <FilePen
                      className="om-tab-icon"
                      size={17}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="om-tab-text">
                      Editor
                      <span className="om-tab-sub">{currentName}</span>
                    </span>
                  </button>
                </>
              ) : null}
            </nav>
          </div>
        </div>

        <div className="om-content">
          {/* StageTable renders its own BulkToolbar for the pipeline stage. */}
          <section className={viewCls('pipeline')}>
            <ViewHead view="pipeline" />
            <StageTable stage="pipeline" />
          </section>
          <section className={viewCls('hired')}>
            <ViewHead view="hired" />
            <StageTable stage="hired" />
          </section>
          <section className={viewCls('archived')}>
            <ViewHead view="archived" />
            <StageTable stage="archived" />
          </section>
          <section className={viewCls('all')}>
            <ViewHead view="all" />
            <StageTable stage="all" />
          </section>
          <section className={viewCls('analysis')}>
            <ViewHead view="analysis" />
            <AnalysisView />
          </section>
          {/* No ViewHead: the shared panel carries its own title and blurb. */}
          <section className={viewCls('users')}>
            <AppMembers appId="offers" />
          </section>
          <section className={viewCls('editor')}>{editorContent}</section>
        </div>
      </div>

      <ActionHub
        primary={{
          id: 'new',
          label: 'New Request',
          hint: 'Start a new hire request',
          icon: Plus,
          run: () => newRecord(),
        }}
        groups={hubGroups}
      />

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

'use client'

// Pipeline / Hired / Archived table.
// Markup ← S1 342–393.  Logic ← S3 463–507, 555–580, 738–754.
//
// 2026-09 restructure: one `.stage-controls` slot sits between the tabs and
// the table. It holds the FILTERS by default and swaps to the selection bar
// (BulkToolbar) while pipeline rows are checked — bulk actions only exist
// once there is a selection to act on. Row actions follow one rule: funnel
// moves stay inline, file ops and Delete live behind the row's ⋯ menu, and
// the candidate's NAME is the way in (the /offers/[id] workspace holds the
// letter, the details form and every export).
//
// `stage="all"` (2026-09, with the sidebar) renders every record in one table
// with a Stage column; row moves then follow each ROW's own stage. Bulk
// selection stays a pipeline-only affair.
//
// ASSIGNMENTS (2026-09): an "Assigned" column shows each offer's people as an
// avatar stack (AssignmentsProvider, beside the frozen record shape). For
// admin/dev the stack is a button that opens AssignPopover for that row; the
// selection bar's Assign button opens the same picker for every checked row.
// "Assigned to me" in the filter row narrows to the viewer's own offers.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { fmtShort } from '@/lib/offers/format'
import { exportOneXlsx } from '@/lib/offers/spreadsheet'
import type { OfferRecord, Stage } from '@/lib/offers/types'
import { initialsOf } from '@/lib/users/initials'

import { useAssignments } from './AssignmentsProvider'
import AssignPopover, { type AssignState, type AssignTarget } from './AssignPopover'
import BulkToolbar from './BulkToolbar'
import { useOffers } from './OffersProvider'

// S3 464
export function stageOf(r: OfferRecord): Stage {
  return r.stage || 'pipeline'
}

// S3 466
export function offerDateISO(r: OfferRecord): string {
  return (r.letter && r.letter.date) || (r.created || '').slice(0, 10) || ''
}

// S3 467
export function monthKeyOf(r: OfferRecord): string {
  const m = String(offerDateISO(r)).match(/^(\d{4})-(\d{2})/)
  return m ? m[1] + '-' + m[2] : ''
}

interface Filters {
  nm: string
  br: string
  ti: string
}

interface RowMenuPos {
  top?: number
  bottom?: number
  right: number
}

/** Generous height of the ⋯ menu (two items + a rule), for the flip decision. */
const ROW_MENU_HEIGHT = 112
const ROW_MENU_GAP = 6

/** Where to pin a fixed menu for the button at `r`: below it, or above when below would overflow. */
function rowMenuPosition(r: DOMRect): RowMenuPos {
  const right = window.innerWidth - r.right
  const fitsBelow = r.bottom + ROW_MENU_GAP + ROW_MENU_HEIGHT <= window.innerHeight
  return fitsBelow
    ? { top: r.bottom + ROW_MENU_GAP, right }
    : { bottom: window.innerHeight - r.top + ROW_MENU_GAP, right }
}

const EMPTY_FILTERS: Filters = { nm: '', br: '', ti: '' }

/** A stage table shows one stage, or every stage at once. */
export type TableScope = Stage | 'all'

const STAGE_LABEL: Record<Stage, string> = {
  pipeline: 'Pipeline',
  hired: 'Hired',
  archived: 'Archived',
}

export interface StageTableProps {
  stage: TableScope
}

export default function StageTable({ stage }: StageTableProps) {
  const api = useOffers()
  const asg = useAssignments()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  /** "Assigned to me" — narrows to offers naming the viewer. */
  const [mine, setMine] = useState(false)
  /** The assign picker's target (a row, or the whole selection), or closed. */
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  /** Which row's ⋯ menu is open — at most one at a time. */
  const [menuId, setMenuId] = useState<string | null>(null)
  /**
   * Viewport coordinates for the open menu. The table clips overflow (rounded
   * corners) and its wrapper scrolls sideways, so an absolutely positioned
   * menu on the last rows was cut off at the table's edge. Fixed positioning
   * escapes both clippers; the menu flips upward when it would not fit below.
   */
  const [menuPos, setMenuPos] = useState<RowMenuPos | null>(null)

  // Any click outside a row menu closes it (the ⋯ button stops propagation),
  // and so does any scroll or resize — a fixed menu cannot follow its row.
  useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menuId])

  const stageRecords = useMemo(
    () => (stage === 'all' ? api.records : api.records.filter((r) => stageOf(r) === stage)),
    [api.records, stage],
  )

  // S3 476 — distinct filter values come from the whole stage, not the filtered rows.
  const distinct = (key: string): string[] => {
    const set: Record<string, 1> = {}
    stageRecords.forEach((r) => {
      const v = (r.data[key] || '').trim()
      if (v) set[v] = 1
    })
    return Object.keys(set).sort()
  }

  const hasFilter = Boolean(filters.nm || filters.br || filters.ti || mine)

  // S3 473–475, plus the "assigned to me" narrowing.
  const rows = useMemo(() => {
    const nm = filters.nm.toLowerCase().trim()
    const me = asg.me
    return stageRecords.filter((r) => {
      const d = r.data
      if (nm && !(d.employeeName || d.preferredName || '').toLowerCase().includes(nm)) return false
      if (filters.br && (d.branchName || '') !== filters.br) return false
      if (filters.ti && (d.position || '') !== filters.ti) return false
      if (mine && !(me && (asg.byOffer[r.id] ?? []).some((a) => a.user === me))) return false
      return true
    })
  }, [stageRecords, filters, mine, asg.me, asg.byOffer])

  const visibleIds = rows.map((r) => r.id)
  const selectedIds = visibleIds.filter((id) => selected[id])
  const allChecked = visibleIds.length > 0 && selectedIds.length === visibleIds.length

  function toggleRow(id: string, on: boolean) {
    setSelected((prev) => ({ ...prev, [id]: on }))
  }

  // S3 752 — check-all only touches the rows currently rendered.
  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      visibleIds.forEach((id) => {
        next[id] = on
      })
      return next
    })
  }

  // S3 495–507
  async function exportExcel(id: string) {
    const r = api.records.find((x) => x.id === id)
    if (!r) {
      api.toast('Record not found.', true)
      return
    }
    try {
      await exportOneXlsx(r)
      const base =
        ((r.data && r.data.employeeName) || 'New Hire')
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '') || 'record'
      api.toast('Exported ' + base + '.xlsx')
    } catch (e) {
      api.toast('Could not export: ' + (e instanceof Error ? e.message : String(e)), true)
    }
  }

  // Was S3 533–539 (a mailto:/OWA deeplink). Both tables and the letter now
  // open the same in-app composer, so an offer is sent — and audited — from
  // one place.
  function openEmailFor(id: string) {
    if (api.records.some((r) => r.id === id)) api.composeEmail(id)
  }

  // S3 748
  function deleteRow(id: string) {
    const r = api.records.find((x) => x.id === id)
    api.confirmDialog(
      'Delete permanently',
      'Permanently delete ' + ((r && r.data.employeeName) || 'this record') + '? This cannot be undone.',
      () => {
        api.deleteRecord(id)
        api.toast('Deleted.')
      },
    )
  }

  /** Inline pills: the funnel moves for THIS ROW's stage, nothing else. */
  function stageMoves(r: OfferRecord) {
    const id = r.id
    const from = stageOf(r)
    if (from === 'pipeline')
      return [
        <button
          key="hire"
          className="mini ok"
          type="button"
          onClick={() => api.setStage(id, 'hired')}
        >
          Hired
        </button>,
        <button
          key="archive"
          className="mini warn"
          type="button"
          onClick={() => api.setStage(id, 'archived')}
        >
          Archive
        </button>,
      ]
    if (from === 'hired')
      return [
        <button
          key="unstage"
          className="mini"
          type="button"
          onClick={() => api.setStage(id, 'pipeline')}
        >
          To Pipeline
        </button>,
        <button
          key="archive"
          className="mini warn"
          type="button"
          onClick={() => api.setStage(id, 'archived')}
        >
          Archive
        </button>,
      ]
    return [
      <button
        key="unstage"
        className="mini"
        type="button"
        onClick={() => api.setStage(id, 'pipeline')}
      >
        Restore
      </button>,
    ]
  }

  /** The ⋯ menu: file export + Delete, closed by any outside click. */
  function rowMenu(id: string) {
    const open = menuId === id
    return (
      <span className="dropdown rowmenu" key="menu">
        <button
          className="mini"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More actions"
          title="More actions"
          onClick={(e) => {
            e.stopPropagation()
            if (open) {
              setMenuId(null)
              return
            }
            setMenuPos(rowMenuPosition(e.currentTarget.getBoundingClientRect()))
            setMenuId(id)
          }}
        >
          ⋯
        </button>
        <div
          className={open ? 'menu open' : 'menu'}
          role="menu"
          style={
            open && menuPos
              ? {
                  position: 'fixed',
                  left: 'auto',
                  right: menuPos.right,
                  top: menuPos.top ?? 'auto',
                  bottom: menuPos.bottom ?? 'auto',
                }
              : undefined
          }
        >
          <button
            type="button"
            onClick={() => {
              setMenuId(null)
              void exportExcel(id)
            }}
          >
            Export Excel (.xlsx)
          </button>
          <div className="menu-sep"></div>
          <button
            type="button"
            className="menu-danger"
            onClick={() => {
              setMenuId(null)
              deleteRow(id)
            }}
          >
            Delete…
          </button>
        </div>
      </span>
    )
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setMine(false)
  }

  /** The Assigned cell: an avatar stack; for admin/dev, the button that opens the picker. */
  function assigneeCell(r: OfferRecord) {
    const list = asg.byOffer[r.id] ?? []
    const shown = list.slice(0, 3)
    const extra = list.length - shown.length
    const names = list
      .map((a) => a.label + (a.roleOther || a.role ? ' (' + (a.roleOther || a.role) + ')' : ''))
      .join(', ')
    const stack = (
      <>
        {shown.map((a) => (
          <span key={a.user} className="asg-av" aria-hidden="true">
            {initialsOf(a.label)}
          </span>
        ))}
        {extra > 0 ? <span className="asg-more">+{extra}</span> : null}
      </>
    )
    if (!asg.canAssign) {
      return (
        <span className="asg-stack" title={names}>
          {list.length ? stack : <span className="asg-none">—</span>}
          <span className="sr-only">{names ? 'Assigned: ' + names : 'Nobody assigned'}</span>
        </span>
      )
    }
    return (
      <button
        type="button"
        className="asg-stack asg-btn"
        title={names || 'Assign someone'}
        aria-label={names ? 'Assigned: ' + names + '. Change assignment' : 'Assign someone'}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation()
          setAssignTarget({
            ids: [r.id],
            rect: e.currentTarget.getBoundingClientRect(),
            title: r.data.employeeName || r.data.preferredName || 'this request',
          })
        }}
      >
        {stack}
        <span className="asg-add" aria-hidden="true">
          +
        </span>
        {list.length ? null : <span className="asg-label">Assign</span>}
      </button>
    )
  }

  /** all / some / none of the picker's target offers name this user. */
  function assignStateFor(target: AssignTarget, userId: string): AssignState {
    const n = target.ids.filter((id) => (asg.byOffer[id] ?? []).some((a) => a.user === userId)).length
    return n === 0 ? 'none' : n === target.ids.length ? 'all' : 'some'
  }

  async function toggleAssignee(target: AssignTarget, userId: string, on: boolean) {
    const ok = await asg.assign(target.ids, on ? { add: [userId] } : { remove: [userId] })
    if (!ok) {
      api.toast('Could not update assignments.', true)
      return
    }
    if (target.ids.length > 1) {
      const who = asg.users.find((u) => u.id === userId)?.label || 'that person'
      const n = target.ids.length
      api.toast((on ? 'Assigned ' : 'Unassigned ') + who + (on ? ' to ' : ' from ') + n + ' requests.')
    }
  }

  const showBulk = stage === 'pipeline' && selectedIds.length > 0
  const countLabel = hasFilter
    ? rows.length + ' of ' + stageRecords.length + ' shown'
    : stageRecords.length + ' request' + (stageRecords.length === 1 ? '' : 's')

  return (
    <>
      <div className="stage-controls">
        {showBulk ? (
          <BulkToolbar
            selectedIds={selectedIds}
            onClearSelection={() => setSelected({})}
            onAssign={
              asg.canAssign
                ? (rect) =>
                    setAssignTarget({
                      ids: selectedIds,
                      rect,
                      title: selectedIds.length + ' selected',
                    })
                : undefined
            }
          />
        ) : (
          <div className="stage-filters">
            <input
              className="f-name"
              placeholder="Filter name…"
              value={filters.nm}
              onChange={(e) => setFilters((f) => ({ ...f, nm: e.target.value }))}
            />
            <select
              className="f-branch"
              value={filters.br}
              onChange={(e) => setFilters((f) => ({ ...f, br: e.target.value }))}
            >
              <option value="">All branches</option>
              {distinct('branchName').map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className="f-title"
              value={filters.ti}
              onChange={(e) => setFilters((f) => ({ ...f, ti: e.target.value }))}
            >
              <option value="">All titles</option>
              {distinct('position').map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {asg.me ? (
              <button
                type="button"
                className="f-mine"
                aria-pressed={mine}
                onClick={() => setMine((m) => !m)}
              >
                Assigned to me
              </button>
            ) : null}
            {hasFilter ? (
              <button className="btn-light f-clear" type="button" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
            <span className="flt-spacer" />
            <span className="flt-count">{countLabel}</span>
          </div>
        )}
      </div>

      <div className="stage-table-wrap">
        <table className={stage === 'all' ? 'stage-table all-stages' : 'stage-table'}>
          <thead>
            <tr>
              <th className="c-chk">
                {stage === 'pipeline' ? (
                  <input
                    type="checkbox"
                    id="chkAllPipeline"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                ) : null}
              </th>
              <th>Name</th>
              {stage === 'all' ? <th className="c-stage">Stage</th> : null}
              <th>Branch</th>
              <th>Title</th>
              <th className="c-assign">Assigned</th>
              <th>Email</th>
              <th>Offer date</th>
              <th className="c-act">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.data
              return (
                <tr key={r.id} data-id={r.id}>
                  <td className="c-chk">
                    {stage === 'pipeline' ? (
                      <input
                        type="checkbox"
                        className="rowchk"
                        checked={Boolean(selected[r.id])}
                        onChange={(e) => toggleRow(r.id, e.target.checked)}
                      />
                    ) : null}
                  </td>
                  <td>
                    <Link
                      className="rowname"
                      href={'/offers/' + r.id}
                      title="Open this offer — letter, details, assigned users and history"
                    >
                      {d.employeeName || d.preferredName || '(no name)'}
                    </Link>
                  </td>
                  {stage === 'all' ? (
                    <td className="c-stage">
                      <span className={'stage-pill stage-pill-' + stageOf(r)}>
                        {STAGE_LABEL[stageOf(r)]}
                      </span>
                    </td>
                  ) : null}
                  <td>{d.branchName || ''}</td>
                  <td>{d.position || ''}</td>
                  <td className="c-assign">{assigneeCell(r)}</td>
                  <td className="c-email">
                    {d.email ? (
                      <button
                        type="button"
                        className="email-link"
                        title={'Email ' + d.email}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEmailFor(r.id)
                        }}
                      >
                        {d.email}
                      </button>
                    ) : null}
                  </td>
                  <td>{fmtShort(offerDateISO(r))}</td>
                  <td className="c-act">
                    {stageMoves(r)}
                    {rowMenu(r.id)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length ? null : (
          <div className="stage-empty">
            {hasFilter
              ? 'No matches for these filters.'
              : stage === 'all'
                ? 'No requests yet. Start one from the + button in the corner.'
                : 'No one here yet.'}
          </div>
        )}
      </div>

      {assignTarget ? (
        <AssignPopover
          target={assignTarget}
          users={asg.users}
          stateFor={(uid) => assignStateFor(assignTarget, uid)}
          onToggle={(uid, on) => toggleAssignee(assignTarget, uid, on)}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}
    </>
  )
}

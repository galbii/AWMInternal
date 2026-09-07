'use client'

// Pipeline / Hired / Archived table.
// Markup ← S1 342–393.  Logic ← S3 463–507, 555–580, 738–754.

import { useMemo, useState } from 'react'

import { fmtShort } from '@/lib/offers/format'
import {
  mailtoUrl,
  offerEmailBody,
  offerEmailSubject,
  owaComposeUrl,
} from '@/lib/offers/letter-exports'
import { exportOneXlsx } from '@/lib/offers/spreadsheet'
import { getEmailPref } from '@/lib/offers/storage'
import type { OfferRecord, Stage } from '@/lib/offers/types'

import AssignModal from './AssignModal'
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

const EMPTY_FILTERS: Filters = { nm: '', br: '', ti: '' }

// S3 526–532 — open a pre-addressed message in whichever client the user picked.
function openEmailCompose(
  email: string,
  subject: string,
  body: string,
  toast: (msg: string, err?: boolean) => void,
) {
  if (getEmailPref() === 'web') {
    window.open(owaComposeUrl(email, subject, body), '_blank', 'noopener')
    toast('Opening Outlook on the web — attach the saved PDF, then send.')
  } else {
    window.location.href = mailtoUrl(email, subject, body)
    toast('Opening your desktop mail app — attach the saved PDF, then send.')
  }
}

export interface StageTableProps {
  stage: Stage
}

export default function StageTable({ stage }: StageTableProps) {
  const api = useOffers()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  /** Record whose assignment modal is open (row "Edit" button); null = closed. */
  const [assignId, setAssignId] = useState<string | null>(null)

  const stageRecords = useMemo(
    () => api.records.filter((r) => stageOf(r) === stage),
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

  const hasFilter = Boolean(filters.nm || filters.br || filters.ti)

  // S3 473–475
  const rows = useMemo(() => {
    const nm = filters.nm.toLowerCase().trim()
    return stageRecords.filter((r) => {
      const d = r.data
      if (nm && !(d.employeeName || d.preferredName || '').toLowerCase().includes(nm)) return false
      if (filters.br && (d.branchName || '') !== filters.br) return false
      if (filters.ti && (d.position || '') !== filters.ti) return false
      return true
    })
  }, [stageRecords, filters])

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

  function openDetails(id: string) {
    api.openRecord(id)
    api.showView('editor')
    api.showSub('details')
  }

  function openLetter(id: string) {
    api.openRecord(id)
    api.showView('editor')
    api.showSub('letter')
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

  // S3 533–539
  function openEmailFor(id: string) {
    const rec = api.records.find((r) => r.id === id)
    if (!rec) return
    const email = (rec.data.email || '').trim()
    if (!email) {
      api.toast('No email on this record.', true)
      return
    }
    openEmailCompose(email, offerEmailSubject(rec), offerEmailBody(rec), api.toast)
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

  // S3 487–493
  function rowActions(id: string) {
    const edit = (
      <button
        key="edit"
        className="mini"
        type="button"
        title="Edit assigned users (and jump to details)"
        onClick={() => setAssignId(id)}
      >
        Edit
      </button>
    )
    const letter = (
      <button
        key="letter"
        className="mini"
        type="button"
        title="Open the offer letter"
        onClick={() => openLetter(id)}
      >
        Letter
      </button>
    )
    const xls = (
      <button
        key="excel"
        className="mini"
        type="button"
        title="Export this person's details to Excel (.xlsx)"
        onClick={() => void exportExcel(id)}
      >
        Excel
      </button>
    )
    // Additive (not in the source app): the shareable per-offer page with
    // assignments + change history.
    const pageLink = (
      <a key="page" className="mini row-page" href={'/offers/' + id} title="Open the offer page">
        Page
      </a>
    )
    const del = (
      <button key="delete" className="mini del" type="button" title="Delete" onClick={() => deleteRow(id)}>
        Delete
      </button>
    )
    if (stage === 'pipeline')
      return [
        edit,
        letter,
        pageLink,
        xls,
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
        del,
      ]
    if (stage === 'hired')
      return [
        edit,
        letter,
        pageLink,
        xls,
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
        del,
      ]
    return [
      edit,
      letter,
      pageLink,
      xls,
      <button
        key="unstage"
        className="mini"
        type="button"
        onClick={() => api.setStage(id, 'pipeline')}
      >
        Restore
      </button>,
      del,
    ]
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  return (
    <>
      {stage === 'pipeline' ? (
        <BulkToolbar
          selectedIds={selectedIds}
          visibleIds={visibleIds}
          onClearSelection={() => setSelected({})}
        />
      ) : null}

      <div className="stage-filters">
        <span className="ff-chk" />
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
        <span className="ff-rest" />
        <button className="btn-light f-clear" type="button" onClick={clearFilters}>
          Clear
        </button>
      </div>

      <div className="stage-table-wrap">
        <table className="stage-table">
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
              <th>Branch</th>
              <th>Title</th>
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
                    <span className="rowname" onClick={() => openLetter(r.id)}>
                      {d.employeeName || d.preferredName || '(no name)'}
                    </span>
                  </td>
                  <td>{d.branchName || ''}</td>
                  <td>{d.position || ''}</td>
                  <td className="c-email">
                    {d.email ? (
                      <a
                        href={mailtoUrl(d.email, offerEmailSubject(r), offerEmailBody(r))}
                        className="email-link"
                        title={'Email ' + d.email}
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          openEmailFor(r.id)
                        }}
                      >
                        {d.email}
                      </a>
                    ) : null}
                  </td>
                  <td>{fmtShort(offerDateISO(r))}</td>
                  <td className="c-act">{rowActions(r.id)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length ? null : (
          <div className="stage-empty">
            {hasFilter ? 'No matches for these filters.' : 'No one here yet.'}
          </div>
        )}
      </div>

      <AssignModal
        recordId={assignId}
        name={(() => {
          const r = assignId ? api.records.find((x) => x.id === assignId) : null
          return r ? r.data.employeeName || r.data.preferredName || '' : ''
        })()}
        onClose={() => setAssignId(null)}
        onEditDetails={() => {
          const id = assignId
          setAssignId(null)
          if (id) openDetails(id)
        }}
      />
    </>
  )
}

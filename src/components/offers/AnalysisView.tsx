'use client'

// Analysis view — stat cards, recent activity, monthly bar chart, monthly
// breakdown table. ← S3 623–646. The numbers are derived in render; only the
// activity feed (RecentActivity, not in the source) fetches.

import { fmtMonthKey } from '@/lib/offers/format'
import type { OfferRecord, Stage } from '@/lib/offers/types'

import { monthKeyOf, stageOf } from './StageTable'
import { useOffers } from './OffersProvider'
import RecentActivity from './RecentActivity'

interface MonthBucket {
  total: number
  hired: number
  archived: number
  pipeline: number
}

// S3 622
function StatCard({
  label,
  n,
  sub,
  cls,
}: {
  label: string
  n: number
  sub?: string | null
  cls?: string
}) {
  return (
    <div className={'stat' + (cls ? ' ' + cls : '')}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
      {sub != null ? <div className="stat-s">{sub}</div> : null}
    </div>
  )
}

export default function AnalysisView() {
  const api = useOffers()
  const records: OfferRecord[] = api.records

  const total = records.length
  const hired = records.filter((r) => stageOf(r) === 'hired').length
  const archived = records.filter((r) => stageOf(r) === 'archived').length
  const pending = records.filter((r) => stageOf(r) === 'pipeline').length
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  const months: Record<string, MonthBucket> = {}
  records.forEach((r) => {
    const k = monthKeyOf(r) || ''
    const M = months[k] || (months[k] = { total: 0, hired: 0, archived: 0, pipeline: 0 })
    M.total++
    const s: Stage = stageOf(r)
    M[s]++
  })
  const keys = Object.keys(months)
    .filter((k) => k)
    .sort()
  const maxT = Math.max(1, ...keys.map((k) => (months[k] as MonthBucket).total))

  return (
    <div className="analysis">
      <div className="stat-row">
        <StatCard label="Total offers" n={total} sub={null} />
        <StatCard label="Accepted (Hired)" n={hired} sub={pct(hired) + '% of offers'} cls="ok" />
        <StatCard
          label="Not accepted (Archived)"
          n={archived}
          sub={pct(archived) + '% of offers'}
          cls="warn"
        />
        <StatCard label="Pending" n={pending} sub={pct(pending) + '% of offers'} cls="muted" />
      </div>

      {/* Not in the source: the cross-offer audit feed (2026-09), so the
          numbers above sit next to what actually happened. */}
      <RecentActivity />

      <h3 className="an-h">Offers by month</h3>
      <div className="barchart">
        {keys.length ? (
          keys.map((k) => {
            const m = months[k] as MonthBucket
            const h = Math.max(3, Math.round((m.total / maxT) * 100))
            return (
              <div className="bar" key={k}>
                <div className="bar-fill" style={{ height: h + '%' }}>
                  <span>{m.total}</span>
                </div>
                <div className="bar-lbl">{fmtMonthKey(k)}</div>
              </div>
            )
          })
        ) : (
          <p className="muted">No offers yet.</p>
        )}
      </div>

      <h3 className="an-h">Monthly breakdown</h3>
      {keys.length ? (
        <table className="an-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Offers</th>
              <th>Accepted</th>
              <th>Not accepted</th>
              <th>Pending</th>
              <th>Accept % (of decided)</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const m = months[k] as MonthBucket
              const dec = m.hired + m.archived
              const ap = dec ? Math.round((m.hired / dec) * 100) : 0
              return (
                <tr key={k}>
                  <td>{fmtMonthKey(k)}</td>
                  <td>{m.total}</td>
                  <td>{m.hired}</td>
                  <td>{m.archived}</td>
                  <td>{m.pipeline}</td>
                  <td>{ap + '%'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">No dated offers yet.</p>
      )}
    </div>
  )
}

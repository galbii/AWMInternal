'use client'

// K 880-965 — credit-report and verification invoice costs.
//
// The operator table is the point of the tab: it flags line items pulled by
// someone whose home branch is NOT the one being billed.

import React, { useEffect, useMemo, useState } from 'react'

import { downloadCSV } from '@/lib/kern/csv'
import {
  creditLoanRows,
  creditOperatorRows,
  creditOrgName,
  creditOrgRows,
  creditTotals,
  fetchCreditData,
} from '@/lib/kern/credit'
import { fmtCents, fmtUSD } from '@/lib/kern/format'
import type { CreditData } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

export default function CreditView() {
  const { state, filter, setFilter, toast } = useKern()
  const [data, setData] = useState<CreditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void fetchCreditData().then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])

  const rows = useMemo(() => (data ? creditOrgRows(state, data) : []), [state, data])
  const cur = sel && data?.orgs[sel] ? sel : rows[0]?.o
  const T = creditTotals(rows)

  const loans = useMemo(() => (data && cur ? creditLoanRows(data, cur) : []), [data, cur])
  const ops = useMemo(
    () => (data && cur ? creditOperatorRows(state, data, cur) : []),
    [state, data, cur],
  )

  if (loading) return <div className="empty">Loading credit data…</div>

  if (!data) {
    return (
      <div className="empty">
        <p>
          <b>Credit dataset not loaded.</b>
        </p>
        <p className="muted">
          This tab reads <code>public/kern/credit.json</code>, which is not committed to the repo —
          it carries per-loan billing detail. Generate it with:
        </p>
        <p className="muted">
          <code>bun run scripts/kern-extract-data.ts &lt;kern-org-manager.html&gt;</code>
        </p>
      </div>
    )
  }

  const shown = filter
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(filter) || r.o.toLowerCase().includes(filter),
      )
    : rows

  const exportCSV = (): void => {
    const out: unknown[][] = [
      ['Branch', 'ORG ID', 'Loan', 'Date', 'Description', 'Charge', 'Credit', 'Operator'],
    ]
    Object.keys(data.orgs).forEach((o) =>
      creditLoanRows(data, o).forEach((l) =>
        l.items.forEach((it) =>
          out.push([
            creditOrgName(state, o),
            o,
            l.ref,
            it[0],
            data.descs[it[1]] || '',
            it[2],
            it[3],
            data.ops[it[4]] || '',
          ]),
        ),
      ),
    )
    downloadCSV(out, 'kern-credit.csv')
    toast('Exported credit CSV')
  }

  const curName = cur ? creditOrgName(state, cur) : ''
  let ch = 0
  let cr = 0
  let ni = 0
  loans.forEach((l) => {
    ch += l.ch
    cr += l.cr
    ni += l.items.length
  })

  const tile = (lab: string, val: string, sub?: string): React.ReactNode => (
    <div className="kpi" key={lab}>
      <div className="k-val">{val}</div>
      <div className="k-lab">{lab}</div>
      {sub ? <div className="k-sub">{sub}</div> : null}
    </div>
  )

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search branch…"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
        />
        <div className="grow" />
        <button className="ghost" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div className="kpis">
        {tile('Total charges', fmtUSD(T.ch), fmtCents(T.ch))}
        {tile('Credits / refunds', fmtUSD(T.cr))}
        {tile('Net cost', fmtUSD(T.ch + T.cr))}
        {tile('Loans', T.nl.toLocaleString())}
        {tile('Line items', T.ni.toLocaleString())}
        {tile('Avg / loan', fmtUSD(T.nl ? (T.ch + T.cr) / T.nl : 0), 'net')}
      </div>

      <div className="hint">
        Credit-report &amp; verification invoice costs. Pick a branch (left, ordered by spend) to
        see every loan and each line-item cost. Click a loan to expand its charges.
      </div>

      <div className="tn-split">
        <div className="tn-list">
          {shown.map((r, i) => (
            <div
              key={r.o}
              className={`tn-li${r.o === cur ? ' sel' : ''}`}
              onClick={() => setSel(r.o)}
            >
              <span className="tn-li-rank">{i + 1}</span>
              <span className="tn-li-main">
                <span className="tn-li-name">
                  {r.name} <span className="tn-li-org">ORG {r.o}</span>
                </span>
                <span className="tn-li-meta">
                  {r.nl} loans · {r.ni} items · <b className="cr-amt">{fmtUSD(r.ch)}</b>
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="tn-detail">
          <div className="tn-dhead">
            <span className="tn-dname">{curName}</span>
            <span className="tn-dmeta">
              ORG {cur} · {loans.length} loans · {ni} line items · charges {fmtUSD(ch)} · credits{' '}
              {fmtUSD(cr)} · net {fmtUSD(ch + cr)}
            </span>
          </div>

          <div className="cr-ops">
            <div className="cr-ops-h">
              Operators on this invoice <span className="muted">({ops.length})</span>
            </div>
            <table className="cr-optbl">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Items</th>
                  <th>Charges</th>
                  <th>Net</th>
                  <th>Home branch</th>
                </tr>
              </thead>
              <tbody>
                {ops.map((r) => (
                  <tr key={r.code} className={r.unknown ? 'unknown' : r.foreign ? 'foreign' : ''}>
                    <td className="cr-op">{r.code}</td>
                    <td>{r.items}</td>
                    <td>{fmtUSD(r.ch)}</td>
                    <td>{fmtUSD(r.net)}</td>
                    <td>
                      {r.home ? (
                        <>
                          {r.home} <span className="muted">({r.homeOrg})</span>
                          {r.foreign && <span className="cr-tag foreign">not this branch</span>}
                        </>
                      ) : (
                        <span className="cr-tag unknown">unrecognized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cr-bar">
            <button
              className="ghost sm"
              onClick={() => setOpen(Object.fromEntries(loans.map((l) => [l.ref, true])))}
            >
              Expand all
            </button>
            <button className="ghost sm" onClick={() => setOpen({})}>
              Collapse all
            </button>
          </div>

          <div className="cr-loans">
            {loans.map((l) => (
              <div key={l.ref} className={`cr-loan${open[l.ref] ? ' open' : ''}`}>
                <div
                  className="cr-lhead"
                  onClick={() => setOpen((o) => ({ ...o, [l.ref]: !o[l.ref] }))}
                >
                  <span className="cr-tw">▸</span>
                  <span className="cr-ref">{l.ref}</span>
                  {/* Borrower name is stripped from the dataset — see D2. */}
                  <span className="cr-bor">{l.b || '—'}</span>
                  <span className="cr-cnt">{l.items.length} items</span>
                  <span className="cr-ch">{fmtCents(l.ch)}</span>
                  <span className="cr-crd">{l.cr ? fmtCents(l.cr) : ''}</span>
                  <span className="cr-net">{fmtCents(l.net)}</span>
                </div>
                <div className="cr-lbody">
                  <table className="cr-items">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Charge</th>
                        <th>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...l.items]
                        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
                        .map((it, i) => (
                          <tr key={i}>
                            <td className="cr-dt">{it[0]}</td>
                            <td className="cr-desc">{data.descs[it[1]] || ''}</td>
                            <td className="cr-ch">{fmtCents(it[2])}</td>
                            <td className="cr-crd">{it[3] ? fmtCents(it[3]) : ''}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

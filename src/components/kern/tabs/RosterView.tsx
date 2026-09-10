'use client'

// K 1048-1112 — staffing needs per branch, with the live Support P&L alongside.

import React, { useEffect, useMemo, useState } from 'react'

import { downloadCSV, rosterCSV } from '@/lib/kern/csv'
import { fmtShort } from '@/lib/kern/format'
import { knownSupport, rosterBasis } from '@/lib/kern/pnl'
import type { Branch } from '@/lib/kern/types'

import { useKern } from '../KernProvider'
import PnlPanel from '../ui/PnlPanel'
import SegToggle from '../ui/SegToggle'

type RosterFilter = 'all' | 'needs'

export default function RosterView() {
  const { state, update, filter, setFilter, setTab, openBranch, toast } = useKern()
  const [mode, setMode] = useState<RosterFilter>('all')
  const [partialMonth, setPartialMonth] = useState<string | null>(null)

  useEffect(() => {
    void import('@/lib/kern/data/production').then((m) => setPartialMonth(m.PROD_RUNRATE.month))
  }, [])

  const procs = useMemo(() => knownSupport(state.branches, 'proc'), [state.branches])
  const loas = useMemo(() => knownSupport(state.branches, 'loa'), [state.branches])
  const basis = useMemo(
    () => rosterBasis(state.production, partialMonth),
    [state.production, partialMonth],
  )

  const live = state.branches.filter((b) => !b.archived)
  const needP = live.filter((b) => b.needProcessor).length
  const needL = live.filter((b) => b.needLO).length

  let branches = live
  if (mode === 'needs') branches = branches.filter((b) => b.needProcessor || b.needLO)
  if (filter) branches = branches.filter((b) => (b.name || '').toLowerCase().includes(filter))
  branches = [...branches].sort((a, b) =>
    (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()),
  )

  // K 1085-1087 — the basis the P&L runs on, summed over the SHOWN branches.
  let unitSum = 0
  let volSum = 0
  const effUnits = new Map<string, { avg: number | null; eff: number }>()
  branches.forEach((b) => {
    const avg = basis.monthlyUnits(b)
    const eff =
      b.monthlyUnits != null && b.monthlyUnits !== ''
        ? Number(b.monthlyUnits) || 0
        : avg != null
          ? Math.round(avg)
          : 0
    effUnits.set(b.id, { avg, eff })
    unitSum += eff
    volSum += eff * basis.avgLoan(b)
  })

  const patch = (id: string, p: Partial<Branch>): void =>
    update((d) => {
      d.branches = d.branches.map((x) => (x.id === id ? { ...x, ...p } : x))
    })

  const numField = (
    b: Branch,
    key: 'monthlyUnits' | 'procAlloc' | 'loaAlloc',
    placeholder: string,
    title?: string,
  ): React.ReactNode => (
    <input
      className="ralloc"
      type="number"
      min={0}
      step="any"
      placeholder={placeholder}
      title={title}
      defaultValue={b[key] != null && b[key] !== '' ? String(b[key]) : ''}
      key={`${b.id}-${key}-${String(b[key])}`}
      onBlur={(e) => {
        const val = e.target.value.trim()
        patch(b.id, { [key]: val === '' ? '' : parseFloat(val) || 0 })
      }}
    />
  )

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search branches…"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
        />
        <SegToggle
          options={[
            { v: 'all' as RosterFilter, label: 'All' },
            { v: 'needs' as RosterFilter, label: 'Needs only' },
          ]}
          current={mode}
          onPick={setMode}
        />
        <span
          className="units-badge"
          title={`Across the ${branches.length} branch${branches.length === 1 ? '' : 'es'} shown · est. volume = monthly units × avg loan size (${fmtShort(basis.globalAvgLoan)} overall)`}
        >
          Σ {unitSum.toLocaleString()} units/mo{' '}
          <span className="units-vol">· est. {fmtShort(volSum)}/mo</span>
        </span>
        <div className="grow" />
        <button
          className="ghost"
          onClick={() => {
            downloadCSV(rosterCSV(state), 'kern-branch-roster.csv')
            toast('Exported branch roster')
          }}
        >
          Export CSV
        </button>
      </div>

      <div className="hint">
        Staffing needs per branch. Tick <b>Need Processor</b> / <b>Need LOA</b>, and assign a{' '}
        <b>Processor</b> or <b>LOA</b> from your known support (pulled from branch rosters). {needP}{' '}
        need a processor · {needL} need an LOA. Use <b>Needs only</b> to show just branches with a
        need checked.
      </div>

      {!branches.length ? (
        <div className="card">
          <div className="empty">
            No branches
            {mode === 'needs'
              ? ` have a need checked${filter ? ' matching your search' : ''}`
              : filter
                ? ' match'
                : ''}
            .
          </div>
        </div>
      ) : (
        <div className="rost-layout">
          <div className="rost-tblwrap">
            <div className="card">
              <table className="tbl-center rost">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Branch</th>
                    <th style={{ width: 100 }}>Need Processor</th>
                    <th style={{ width: 90 }}>Need LOA</th>
                    <th style={{ width: 100 }}>Monthly Units</th>
                    <th style={{ width: 186 }}>Processor Name</th>
                    <th style={{ width: 110 }}>Processor Allocation</th>
                    <th style={{ width: 186 }}>LOA Name</th>
                    <th style={{ width: 110 }}>LOA Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => {
                    const { avg } = effUnits.get(b.id) ?? { avg: null }
                    return (
                      <tr key={b.id}>
                        <td>
                          <button
                            className="link"
                            onClick={() => {
                              setTab('branches')
                              openBranch(b.id)
                              window.scrollTo(0, 0)
                            }}
                          >
                            {b.name || '(unnamed)'}
                          </button>
                        </td>
                        <td className={b.needProcessor ? 'need' : ''}>
                          <input
                            type="checkbox"
                            className="rchk"
                            checked={Boolean(b.needProcessor)}
                            onChange={(e) => patch(b.id, { needProcessor: e.target.checked })}
                          />
                        </td>
                        <td className={b.needLO ? 'need' : ''}>
                          <input
                            type="checkbox"
                            className="rchk"
                            checked={Boolean(b.needLO)}
                            onChange={(e) => patch(b.id, { needLO: e.target.checked })}
                          />
                        </td>
                        <td>
                          {numField(
                            b,
                            'monthlyUnits',
                            avg != null ? `~${Math.round(avg)}` : '—',
                            avg != null
                              ? `Funded avg: ${Math.round(avg * 10) / 10} units/mo`
                              : 'no funded data',
                          )}
                        </td>
                        <td>
                          <SupportSelect
                            list={procs}
                            value={b.processorName || ''}
                            onChange={(v) => patch(b.id, { processorName: v })}
                          />
                        </td>
                        <td>{numField(b, 'procAlloc', '—')}</td>
                        <td>
                          <SupportSelect
                            list={loas}
                            value={b.loaName || ''}
                            onChange={(v) => patch(b.id, { loaName: v })}
                          />
                        </td>
                        <td>{numField(b, 'loaAlloc', '—')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rost-pnl">
            <PnlPanel rosterUnits={unitSum} rosterVol={volSum} />
          </div>
        </div>
      )}
    </>
  )
}

/** K 980-986 — a name not in the known pool is appended so it isn't lost. */
function SupportSelect({
  list,
  value,
  onChange,
}: {
  list: string[]
  value: string
  onChange: (v: string) => void
}) {
  const inList = list.some((n) => n === value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— none —</option>
      {list.map((n) => (
        <option key={n}>{n}</option>
      ))}
      {value && !inList && <option value={value}>{value}</option>}
    </select>
  )
}

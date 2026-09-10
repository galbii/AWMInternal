'use client'

// K 1113-1152 — the editable production pivot. Editing a cell feeds every
// analytics tab; the "In analysis" tick is the shared include/exclude switch.

import React, { useState } from 'react'

import { downloadCSV } from '@/lib/kern/csv'
import { fmtShort } from '@/lib/kern/format'
import { isIncluded, prodGroups, prodMonths } from '@/lib/kern/production'
import type { MetricKey } from '@/lib/kern/types'

import { useKern } from '../KernProvider'
import SegToggle from '../ui/SegToggle'

export default function DataView() {
  const { state, update, toast } = useKern()
  const [metric, setMetric] = useState<MetricKey>('dollars')
  const isD = metric === 'dollars'

  const months = prodMonths(state)
  const groups = prodGroups(state, true)
  const excl = Object.keys(state.prodExcluded || {}).filter((o) => state.prodExcluded[o]).length

  const colTot: Record<string, number> = {}
  let grand = 0
  const rowTotals = groups.map((g) => {
    let rowTot = 0
    months.forEach((m) => {
      const rec = state.production[g.org][m]
      const val = rec ? (isD ? rec[0] : rec[1]) : 0
      rowTot += val
      colTot[m] = (colTot[m] || 0) + val
    })
    grand += rowTot
    return rowTot
  })

  // K 1147-1151 — a cell that empties to 0/0 drops out of the map entirely, so
  // prodMonths() stops reporting a month nobody has numbers for.
  const setCell = (org: string, m: string, raw: string): void => {
    let val = parseFloat(raw) || 0
    if (val < 0) val = 0
    update((d) => {
      const production = { ...d.production }
      const mm = { ...(production[org] || {}) }
      const cur = mm[m] ? ([...mm[m]] as [number, number]) : ([0, 0] as [number, number])
      if (isD) cur[0] = val
      else cur[1] = Math.round(val)
      if (!cur[0] && !cur[1]) delete mm[m]
      else mm[m] = cur
      production[org] = mm
      d.production = production
    })
  }

  const exportCSV = (): void => {
    const rows: unknown[][] = [['Branch', 'ORG ID', 'Month', 'Dollars', 'Units']]
    prodGroups(state, false).forEach((g) =>
      months.forEach((m) => {
        const rec = state.production[g.org][m]
        if (rec) rows.push([g.name, g.org, m, rec[0], rec[1]])
      }),
    )
    downloadCSV(rows, 'kern-production.csv')
    toast('Exported production CSV')
  }

  return (
    <>
      <div className="toolbar">
        <SegToggle
          options={[
            { v: 'dollars' as MetricKey, label: 'Dollars' },
            { v: 'units' as MetricKey, label: 'Units' },
          ]}
          current={metric}
          onPick={setMetric}
        />
        <div className="grow" />
        <button className="ghost" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div className="hint">
        Funded production by branch (matched to ORG ID; unknown ORG IDs combined into <b>Other</b>).
        Editing cells updates the Analysis charts. Untick <b>In analysis</b> to exclude a branch
        from the Analysis &amp; Highlight tabs{excl ? ` (${excl} excluded)` : ''}.
      </div>

      <div className="pivot-wrap">
        <div className="card">
          <table className="pivot">
            <thead>
              <tr>
                <th className="stick s-inc">In analysis</th>
                <th className="stick s0">Branch</th>
                <th className="stick s1">ORG ID</th>
                {months.map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th className="tot">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const inc = isIncluded(state, g.org)
                return (
                  <tr key={g.org} className={inc ? '' : 'excluded'}>
                    <td className="stick s-inc">
                      <input
                        type="checkbox"
                        className="incchk"
                        checked={inc}
                        onChange={(e) =>
                          update((d) => {
                            const next = { ...d.prodExcluded }
                            if (e.target.checked) delete next[g.org]
                            else next[g.org] = true
                            d.prodExcluded = next
                          })
                        }
                      />
                    </td>
                    <td className="stick s0 bname">{g.name}</td>
                    <td className="stick s1 muted">{g.org}</td>
                    {months.map((m) => {
                      const rec = state.production[g.org][m]
                      const val = rec ? (isD ? rec[0] : rec[1]) : 0
                      return (
                        <td key={m}>
                          <input
                            className="cell"
                            type="number"
                            defaultValue={val ? (isD ? Math.round(val) : val) : ''}
                            key={`${g.org}-${m}-${metric}-${val}`}
                            onBlur={(e) => setCell(g.org, m, e.target.value)}
                          />
                        </td>
                      )
                    })}
                    <td className="tot">{isD ? fmtShort(rowTotals[gi]) : rowTotals[gi]}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="stick s-inc" />
                <td className="stick s0">Total</td>
                <td className="stick s1" />
                {months.map((m) => (
                  <td className="tot" key={m}>
                    {isD ? fmtShort(colTot[m] || 0) : colTot[m] || 0}
                  </td>
                ))}
                <td className="tot">{isD ? fmtShort(grand) : grand}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

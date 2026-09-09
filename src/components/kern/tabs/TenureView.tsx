'use client'

// K 1154-1286 — every funding branch ordered by tenure, as a master/detail
// chart view or a dense pivot table.
//
// Product mix is hand-entered: the production data carries no loan-program
// field, so the counts live in state.productMix and are edited right here.

import React, { useMemo, useState } from 'react'

import { BASE, categoryAxis, legendStyle, valueAxis } from '@/lib/kern/charts'
import { downloadCSV } from '@/lib/kern/csv'
import { divColor, fmtShort, fmtUSD } from '@/lib/kern/format'
import { groupKeyForOrg, prodGroups, prodMonths } from '@/lib/kern/production'
import { PRODUCT_TYPES, tenureRows, type TenureRow } from '@/lib/kern/tenure'
import type { ProductionPair } from '@/lib/kern/types'

import Chart from '../Chart'
import { useKern } from '../KernProvider'
import SegToggle from '../ui/SegToggle'

type View = 'charts' | 'table'
type Metric = 'both' | 'dollars' | 'units'

export default function TenureView() {
  const { state, update, toast } = useKern()
  const [view, setView] = useState<View>('charts')
  const [metric, setMetric] = useState<Metric>('both')
  const [sel, setSel] = useState<string | null>(null)

  const months = prodMonths(state)
  const rows = useMemo(() => tenureRows(state, months), [state, months])

  const exportCSV = (): void => {
    const out: unknown[][] = [['Branch', 'ORG ID', 'Month', 'Dollars', 'Units']]
    prodGroups(state, false).forEach((g) =>
      months.forEach((m) => {
        const rec = state.production[g.org][m]
        if (rec) out.push([g.name, g.org, m, rec[0], rec[1]])
      }),
    )
    downloadCSV(out, 'kern-production.csv')
    toast('Exported production CSV')
  }

  const isCharts = view === 'charts'

  return (
    <>
      <div className="toolbar">
        <SegToggle
          options={[
            { v: 'charts' as View, label: 'Charts' },
            { v: 'table' as View, label: 'Table' },
          ]}
          current={view}
          onPick={setView}
        />
        {!isCharts && (
          <SegToggle
            options={[
              { v: 'both' as Metric, label: 'Both' },
              { v: 'dollars' as Metric, label: 'Dollars' },
              { v: 'units' as Metric, label: 'Units' },
            ]}
            current={metric}
            onPick={setMetric}
          />
        )}
        <div className="grow" />
        <button className="ghost" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      <div className="hint">
        {isCharts ? (
          <>
            Pick a branch on the left (ordered longest tenure → most recent) to see its monthly{' '}
            <b>volume</b> and <b>units</b> charts. The first active month is highlighted.
          </>
        ) : (
          <>
            Every branch / ORG ID with monthly funded production — <b>volume</b> and <b>units</b>.
            Ordered by tenure: earliest first funded month first → most recently onboarded last.
          </>
        )}
      </div>

      {!months.length || !rows.length ? (
        <div className="empty">No production data.</div>
      ) : isCharts ? (
        <TenureCharts
          rows={rows}
          months={months}
          sel={sel && rows.some((r) => r.org === sel) ? sel : rows[0].org}
          onSelect={setSel}
          groupKey={(org) => groupKeyForOrg(state, org, 'subdivision')}
          mix={state.productMix}
          onMix={(org, pt, val) =>
            update((d) => {
              const prev = d.productMix[org] ?? { conv: 0, fha: 0, va: 0, nonqm: 0 }
              d.productMix = { ...d.productMix, [org]: { ...prev, [pt]: val } }
            })
          }
        />
      ) : (
        <TenureTable rows={rows} months={months} metric={metric} />
      )}
    </>
  )
}

// K 1210-1285
function TenureCharts({
  rows,
  months,
  sel,
  onSelect,
  groupKey,
  mix,
  onMix,
}: {
  rows: TenureRow[]
  months: string[]
  sel: string
  onSelect: (org: string) => void
  groupKey: (org: string) => string
  mix: Record<string, { conv: number; fha: number; va: number; nonqm: number }>
  onMix: (org: string, pt: 'conv' | 'fha' | 'va' | 'nonqm', val: number) => void
}) {
  const r = rows.find((x) => x.org === sel) as TenureRow
  const sub = groupKey(r.org)
  const base = divColor(sub)

  // K 1258-1270 — the first active month is drawn light with a coloured border.
  const bars = (isD: boolean, color: string) => ({
    ...BASE,
    grid: { left: 64, right: 18, top: 16, bottom: 52 },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      valueFormatter: (val: number) => (isD ? fmtUSD(val) : `${val} units`),
    },
    xAxis: {
      ...categoryAxis(months),
      axisLabel: { color: '#8fb8cf', fontSize: 11, rotate: 45, interval: 0 },
      axisTick: { show: false },
    },
    yAxis: valueAxis((v: number) => (isD ? fmtShort(v) : String(v))),
    series: [
      {
        type: 'bar' as const,
        barWidth: '58%',
        label: {
          show: true,
          position: 'top' as const,
          color: '#9fc4d8',
          fontSize: 9,
          formatter: (p: { value: number }) =>
            p.value ? (isD ? fmtShort(p.value) : String(p.value)) : '',
        },
        emphasis: { focus: 'series' as const },
        data: months.map((m) => {
          const rec = r.mm[m]
          const val = rec ? (isD ? rec[0] || 0 : rec[1] || 0) : 0
          const isFirst = m === r.first
          return {
            value: isD ? Math.round(val) : val,
            itemStyle: {
              color: isFirst ? '#eaf7ff' : color,
              borderColor: isFirst ? color : 'transparent',
              borderWidth: isFirst ? 2 : 0,
            },
          }
        }),
      },
    ],
  })

  const mx = mix[r.org] || { conv: 0, fha: 0, va: 0, nonqm: 0 }
  const mtot = PRODUCT_TYPES.reduce((s, p) => s + (Number(mx[p[0]]) || 0), 0)
  const pieData = PRODUCT_TYPES.map((p) => ({
    name: p[1],
    value: Number(mx[p[0]]) || 0,
    itemStyle: { color: p[2] },
  })).filter((x) => x.value > 0)

  const pieOption = {
    ...BASE,
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}: ${p.value} (${p.percent}%)`,
    },
    legend: { bottom: 0, ...legendStyle, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '70%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#0a1420', borderWidth: 2 },
        label: { color: '#dce9f2', formatter: '{b}\n{d}%', fontSize: 11 },
        data: pieData,
      },
    ],
  }

  return (
    <div className="tn-split">
      <div className="tn-list">
        {rows.map((row, i) => (
          <div
            key={row.org}
            className={`tn-li${row.org === sel ? ' sel' : ''}`}
            onClick={() => onSelect(row.org)}
          >
            <span className="tn-li-rank">{i + 1}</span>
            <span className="tn-li-dot" style={{ background: divColor(groupKey(row.org)) }} />
            <span className="tn-li-main">
              <span className="tn-li-name">
                {row.name} <span className="tn-li-org">ORG {row.org}</span>
              </span>
              <span className="tn-li-meta">
                <span className="tn-li-first">First: {row.first}</span> · {row.active} mo ·{' '}
                {fmtShort(row.d)} · {row.u.toLocaleString()} u
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="tn-detail">
        <div className="tn-dhead">
          <span className="tn-dot" style={{ background: base }} />
          <span className="tn-dname">{r.name}</span>
          <span className="tn-dmeta">
            ORG {r.org} · {sub} · since {r.first} · {r.active} active months
          </span>
        </div>

        <div className="tn-dcard vol">
          <div className="tn-dctitle">
            Monthly Volume ($) <span className="tn-dcsum">{fmtShort(r.d)} total</span>
          </div>
          <Chart className="tn-dccanvas" option={bars(true, base)} />
        </div>

        <div className="tn-dcard unit">
          <div className="tn-dctitle">
            Monthly Units <span className="tn-dcsum">{r.u.toLocaleString()} loans total</span>
          </div>
          <Chart className="tn-dccanvas" option={bars(false, '#b06bff')} />
        </div>

        <div className="tn-dcard mix">
          <div className="tn-dctitle">
            Product Mix{' '}
            <span className="tn-dcsum">{mtot ? `${mtot} loans entered` : 'enter counts →'}</span>
          </div>
          <div className="tn-mixwrap">
            <div className="tn-mixpie">
              {pieData.length ? (
                <Chart height="100%" option={pieOption} />
              ) : (
                <div className="tn-mixempty">
                  No product mix entered yet.
                  <br />
                  Enter loan counts on the right.
                </div>
              )}
            </div>
            <div className="tn-mixform">
              {PRODUCT_TYPES.map((p) => {
                const val = Number(mx[p[0]]) || 0
                const pct = mtot ? (val / mtot) * 100 : 0
                return (
                  <label className="tn-mixrow" key={p[0]}>
                    <span className="tn-mixdot" style={{ background: p[2] }} />
                    <span className="tn-mixlab">{p[1]}</span>
                    <input
                      className="tn-mixinp"
                      type="number"
                      min={0}
                      placeholder="0"
                      defaultValue={val || ''}
                      key={`${r.org}-${p[0]}-${val}`}
                      onBlur={(e) => {
                        let v = parseInt(e.target.value) || 0
                        if (v < 0) v = 0
                        onMix(r.org, p[0], v)
                      }}
                    />
                    <span className="tn-mixpct">{mtot ? `${pct.toFixed(0)}%` : '—'}</span>
                  </label>
                )
              })}
              <div className="tn-mixhint">
                Counts by loan program for this branch. Saved in the app.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// K 1177-1208
function TenureTable({
  rows,
  months,
  metric,
}: {
  rows: TenureRow[]
  months: string[]
  metric: Metric
}) {
  const showD = metric !== 'units'
  const showU = metric !== 'dollars'
  const both = metric === 'both'

  const colD: Record<string, number> = {}
  const colU: Record<string, number> = {}
  let gD = 0
  let gU = 0
  rows.forEach((r) => {
    months.forEach((m) => {
      const rec = r.mm[m]
      if (rec) {
        colD[m] = (colD[m] || 0) + (rec[0] || 0)
        colU[m] = (colU[m] || 0) + (rec[1] || 0)
      }
    })
    gD += r.d
    gU += r.u
  })

  const pair = (d: number, u: number): React.ReactNode => (
    <>
      {showD && <div className="t-d">{fmtShort(d)}</div>}
      {showU && (
        <div className="t-u">
          {u.toLocaleString()}
          {both ? '' : ' u'}
        </div>
      )}
    </>
  )

  const cell = (rec: ProductionPair | undefined): React.ReactNode => {
    const has = rec && ((rec[0] || 0) > 0 || (rec[1] || 0) > 0)
    if (!has) return <span className="muted">·</span>
    return pair(rec[0] || 0, rec[1] || 0)
  }

  return (
    <div className="pivot-wrap">
      <div className="card">
        <table className="pivot tn">
          <thead>
            <tr>
              <th className="stick tn-r">#</th>
              <th className="stick tn0">Branch</th>
              <th className="stick tn1">ORG ID</th>
              <th>Since</th>
              <th>Mo</th>
              {months.map((m) => (
                <th key={m}>{m}</th>
              ))}
              <th className="tot">Total{both ? ' ($ / u)' : showD ? ' $' : ' u'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.org}>
                <td className="stick tn-r muted">{i + 1}</td>
                <td className="stick tn0 bname">{r.name}</td>
                <td className="stick tn1 muted">{r.org}</td>
                <td className="t-since">{r.first}</td>
                <td className="muted">{r.active}</td>
                {months.map((m) => (
                  <td key={m} className={m === r.first ? 't-first' : ''}>
                    {cell(r.mm[m])}
                  </td>
                ))}
                <td className="tot">{pair(r.d, r.u)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick tn-r" />
              <td className="stick tn0">Total</td>
              <td className="stick tn1" />
              <td />
              <td />
              {months.map((m) => (
                <td key={m}>{pair(colD[m] || 0, colU[m] || 0)}</td>
              ))}
              <td className="tot">{pair(gD, gU)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

'use client'

// K 1288-1388 — the main analytics view: KPI tiles, a stacked bar by month
// with the in-progress month's run-rate cap, a dual-axis trend line, and the
// top-N groups over time.

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  BASE,
  PALETTE,
  PROJ_GRADIENT,
  categoryAxis,
  legendStyle,
  valueAxis,
} from '@/lib/kern/charts'
import { fmtShort, fmtUSD } from '@/lib/kern/format'
import { groupMonthly, prodMonths } from '@/lib/kern/production'
import type { DimensionKey, MetricKey, ProductionPair, RunRate } from '@/lib/kern/types'

import Chart from '../Chart'
import { useKern } from '../KernProvider'
import OtherToggle from '../ui/OtherToggle'
import SegToggle from '../ui/SegToggle'

/** K 1289 — [key, select label, singular, plural]. */
const DIMS: [DimensionKey, string, string, string][] = [
  ['branch', 'By Branch', 'Branch', 'Branches'],
  ['area', 'By Area', 'Area', 'Areas'],
  ['region', 'By Region', 'Region', 'Regions'],
  ['subdivision', 'By Sub-division', 'Sub-division', 'Sub-divisions'],
  ['division', 'By Division', 'Division', 'Divisions'],
]

export default function AnalysisView() {
  const { state, setTab } = useKern()
  const [dim, setDim] = useState<DimensionKey>('division')
  const [metric, setMetric] = useState<MetricKey>('dollars')
  const [topN, setTopN] = useState(10)
  const [runrate, setRunrate] = useState<RunRate | null>(null)

  // The run-rate block is only needed to annotate the last bar; load it lazily
  // so the ~90KB production module stays off the critical path.
  useEffect(() => {
    void import('@/lib/kern/data/production').then((m) => setRunrate(m.PROD_RUNRATE))
  }, [])

  const isD = metric === 'dollars'
  const dcur = DIMS.find((d) => d[0] === dim) || DIMS[0]
  const months = prodMonths(state)
  const gm = useMemo(() => groupMonthly(state, dim), [state, dim])

  const groups = useMemo(
    () =>
      Object.keys(gm)
        .map((name) => {
          const mm = gm[name]
          let d = 0
          let u = 0
          Object.values(mm).forEach((vv) => {
            d += vv[0] || 0
            u += vv[1] || 0
          })
          return { name, mm, d, u }
        })
        .sort((a, b) => b.d - a.d),
    [gm],
  )

  // K 1298-1301 — grand totals and the per-month company total.
  const { totalD, totalU, mTot } = useMemo(() => {
    let totalD = 0
    let totalU = 0
    const mTot: Record<string, ProductionPair> = {}
    Object.values(gm).forEach((mm) =>
      Object.keys(mm).forEach((m) => {
        const d = mm[m][0] || 0
        const u = mm[m][1] || 0
        totalD += d
        totalU += u
        mTot[m] ||= [0, 0]
        mTot[m][0] += d
        mTot[m][1] += u
      }),
    )
    return { totalD, totalU, mTot }
  }, [gm])
  const avg = totalU ? totalD / totalU : 0
  let peak = months[0]
  months.forEach((m) => {
    if ((mTot[m] || [0, 0])[0] > (mTot[peak] || [0, 0])[0]) peak = m
  })

  const mv = useCallback(
    (mm: Record<string, ProductionPair>, m: string): number => {
      const rec = mm[m]
      return rec ? (isD ? rec[0] : rec[1]) : 0
    },
    [isD],
  )

  const top = groups.slice(0, topN)

  // K 1307-1309 — the last month is partial when the run-rate block names it.
  const lastM = months[months.length - 1]
  const monthPartial = Boolean(runrate && runrate.month === lastM)
  const mProj = monthPartial && runrate ? (isD ? runrate.factorD : runrate.factorU) : 1

  const barOption = useMemo(
    () => ({
      ...BASE,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (val: number) => (isD ? fmtUSD(val) : `${val} units`),
        order: 'valueDesc' as const,
      },
      legend: {
        type: 'scroll' as const,
        top: 0,
        ...legendStyle,
        data: top.map((g) => g.name).concat(monthPartial ? ['run-rate'] : []),
      },
      grid: { left: 72, right: 24, top: 44, bottom: 70 },
      xAxis: categoryAxis(months),
      yAxis: valueAxis((v: number) => (isD ? fmtShort(v) : String(v))),
      series: [
        ...top.map((g, i) => ({
          name: g.name,
          type: 'bar' as const,
          stack: 'prod',
          emphasis: { focus: 'series' as const },
          itemStyle: { color: PALETTE[i % PALETTE.length] },
          data: months.map((m) => {
            const val = mv(g.mm, m)
            return isD ? Math.round(val) : val
          }),
        })),
        // The cap sits ON TOP of the same stack, showing the gap between what
        // has funded so far and where the month is pacing to land.
        ...(monthPartial
          ? [
              {
                name: 'run-rate',
                type: 'bar' as const,
                stack: 'prod',
                itemStyle: {
                  color: PROJ_GRADIENT,
                  borderColor: 'rgba(255,255,255,0.35)',
                  borderWidth: 1,
                  borderType: 'dashed' as const,
                },
                data: months.map((m) =>
                  m === lastM
                    ? Math.round(top.reduce((s, g) => s + mv(g.mm, m), 0) * (mProj - 1))
                    : 0,
                ),
              },
            ]
          : []),
      ],
    }),
    [top, months, isD, monthPartial, mProj, lastM, mv],
  )

  const trendOption = useMemo(
    () => ({
      ...BASE,
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['Dollars', 'Units'], ...legendStyle },
      grid: { left: 70, right: 64, top: 44, bottom: 70 },
      xAxis: categoryAxis(months),
      yAxis: [
        {
          type: 'value' as const,
          name: '$',
          nameTextStyle: { color: '#9fd6ea' },
          axisLabel: { color: '#8fb8cf', formatter: (v: number) => fmtShort(v) },
          splitLine: { lineStyle: { color: '#122c42' } },
        },
        {
          type: 'value' as const,
          name: 'Units',
          nameTextStyle: { color: '#9fd6ea' },
          axisLabel: { color: '#8fb8cf' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Dollars',
          type: 'line' as const,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: { color: 'rgba(37,224,255,.15)' },
          lineStyle: { width: 3, color: '#25e0ff' },
          itemStyle: { color: '#25e0ff' },
          data: months.map((m) => Math.round((mTot[m] || [0, 0])[0])),
        },
        {
          name: 'Units',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2, color: '#ff3b52' },
          itemStyle: { color: '#ff3b52' },
          data: months.map((m) => (mTot[m] || [0, 0])[1]),
        },
      ],
    }),
    [months, mTot],
  )

  const topOption = useMemo(
    () => ({
      ...BASE,
      tooltip: { trigger: 'axis' as const },
      legend: { type: 'scroll' as const, top: 0, ...legendStyle },
      grid: { left: 70, right: 24, top: 44, bottom: 70 },
      xAxis: categoryAxis(months),
      yAxis: valueAxis((v: number) => (isD ? fmtShort(v) : String(v))),
      series: top.map((g, i) => ({
        name: g.name,
        type: 'line' as const,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: PALETTE[i % PALETTE.length] },
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        data: months.map((m) => {
          const val = mv(g.mm, m)
          return isD ? Math.round(val) : val
        }),
      })),
    }),
    [top, months, isD, mv],
  )

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
        <select
          className="search"
          style={{ minWidth: 150 }}
          value={dim}
          onChange={(e) => setDim(e.target.value as DimensionKey)}
        >
          {DIMS.map((d) => (
            <option key={d[0]} value={d[0]}>
              {d[1]}
            </option>
          ))}
        </select>
        <SegToggle
          options={[
            { v: 'dollars' as MetricKey, label: 'Dollars' },
            { v: 'units' as MetricKey, label: 'Units' },
          ]}
          current={metric}
          onPick={setMetric}
        />
        <span className="muted" style={{ marginLeft: 6 }}>
          Top:
        </span>
        <select
          className="search"
          style={{ minWidth: 80 }}
          value={topN}
          onChange={(e) => setTopN(Number(e.target.value))}
        >
          {[5, 10, 15, 20, 999].map((n) => (
            <option key={n} value={n}>
              {n >= 999 ? 'All' : n}
            </option>
          ))}
        </select>
        <OtherToggle />
        <div className="grow" />
        <button className="ghost" onClick={() => setTab('data')}>
          Edit numbers →
        </button>
      </div>

      {!months.length ? (
        <div className="empty">No production data.</div>
      ) : (
        <>
          <div className="kpis">
            {tile('Total funded', fmtShort(totalD), fmtUSD(totalD))}
            {tile('Units', totalU.toLocaleString(), 'loans')}
            {tile('Avg loan size', fmtShort(avg))}
            {tile(
              dcur[3],
              String(groups.length),
              dim === 'branch' ? 'incl. Other' : 'incl. Unassigned',
            )}
            {tile(
              'Months',
              String(months.length),
              `${months[0] || ''} – ${months[months.length - 1] || ''}`,
            )}
            {tile('Peak month', peak || '—', fmtShort((mTot[peak] || [0, 0])[0]))}
          </div>

          <div className="card chart-box tall">
            <div className="chart-title">
              Production by {dcur[2]} × Month — {isD ? 'Dollars' : 'Units'}
              {monthPartial && runrate
                ? ` · ${lastM} @ BD${runrate.bday} — purple→red top = run-rate (${runrate.confidence} conf.)`
                : ''}
            </div>
            <Chart option={barOption} />
          </div>

          <div className="card chart-box">
            <div className="chart-title">Monthly production trend — Dollars &amp; Units</div>
            <Chart option={trendOption} />
          </div>

          <div className="card chart-box">
            <div className="chart-title">
              Top {dcur[3].toLowerCase()} over time — {isD ? 'Dollars' : 'Units'}
            </div>
            <Chart option={topOption} />
          </div>
        </>
      )}
    </>
  )
}

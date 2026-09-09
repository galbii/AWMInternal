'use client'

// K 1551-1663 — YoY / quarter / custom-quarter comparison cards, plus yearly
// and quarterly grouped bars.
//
// "Latest complete quarter" is the comparison anchor: comparing a quarter that
// is one month old against a full one would read as a collapse. The partial
// quarter is still charted, with the in-progress month's run-rate as a faded
// cap.

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { BASE, PALETTE, categoryAxis, legendStyle, valueAxis } from '@/lib/kern/charts'
import { divColor, fmtShort, fmtUSD, monthsByQuarter, pctChange } from '@/lib/kern/format'
import { groupMonthly, prodMonths } from '@/lib/kern/production'
import type { DimensionKey, MetricKey, ProductionPair, RunRate } from '@/lib/kern/types'

import Chart from '../Chart'
import { useKern } from '../KernProvider'
import OtherToggle from '../ui/OtherToggle'
import SegToggle from '../ui/SegToggle'

const DIMS: [DimensionKey, string][] = [
  ['division', 'By Division'],
  ['subdivision', 'By Sub-division'],
  ['region', 'By Region'],
  ['area', 'By Area'],
  ['branch', 'By Branch'],
]

const parseQ = (q: string): [number, number] => {
  const a = q.split('-Q')
  return [parseInt(a[0], 10), parseInt(a[1], 10)]
}
const qLabel = (q: string): string => {
  const p = parseQ(q)
  return `Q${p[1]} ${p[0]}`
}

export default function HighlightView() {
  const { state } = useKern()
  const [dim, setDim] = useState<DimensionKey>('division')
  const [metric, setMetric] = useState<MetricKey>('dollars')
  const [qA, setQA] = useState<string | null>(null)
  const [qB, setQB] = useState<string | null>(null)
  const [runrate, setRunrate] = useState<RunRate | null>(null)

  useEffect(() => {
    void import('@/lib/kern/data/production').then((m) => setRunrate(m.PROD_RUNRATE))
  }, [])

  const isD = metric === 'dollars'
  const mi: 0 | 1 = isD ? 0 : 1
  const months = prodMonths(state)
  const gm = useMemo(() => groupMonthly(state, dim), [state, dim])

  const years = [...new Set(months.map((m) => m.split('-')[0]))].sort()
  const latestYear = years[years.length - 1]
  const prevYear = years[years.length - 2]
  const ytdNums = useMemo(
    () => [...new Set(months.filter((m) => m.startsWith(latestYear)).map((m) => m.split('-')[1]))],
    [months, latestYear],
  )
  const qmap = useMemo(() => monthsByQuarter(months), [months])
  const quarters = useMemo(() => Object.keys(qmap).sort(), [qmap])

  const sumM = useCallback(
    (mm: Record<string, ProductionPair>, list?: string[]): number =>
      (list || []).reduce((s, m) => s + ((mm[m] || [0, 0])[mi] || 0), 0),
    [mi],
  )
  const fmtV = (n: number): string => (isD ? fmtShort(n) : Math.round(n).toLocaleString())
  const colorFor = useCallback(
    (name: string, i: number): string =>
      dim === 'subdivision' ? divColor(name) : PALETTE[i % PALETTE.length],
    [dim],
  )

  // K 1573-1577 — a quarter counts as complete once its last month exists.
  const latestMonthNum = months.length ? parseInt(months[months.length - 1].split('-')[1], 10) : 0
  const completeQ = quarters.filter((q) => {
    const p = parseQ(q)
    return (
      p[0] < parseInt(latestYear, 10) ||
      (p[0] === parseInt(latestYear, 10) && p[1] * 3 <= latestMonthNum)
    )
  })
  const cmpQ = completeQ[completeQ.length - 1] || quarters[quarters.length - 1]
  const cp = cmpQ ? parseQ(cmpQ) : [0, 0]
  const priorSameQ = `${cp[0] - 1}-Q${cp[1]}`
  // Prefer the same quarter a year earlier; fall back to the previous quarter.
  const cmpPrevQ = qmap[priorSameQ] ? priorSameQ : quarters[quarters.indexOf(cmpQ) - 1] || null
  const latestPartial = cmpQ !== quarters[quarters.length - 1]

  const selA =
    qA && quarters.includes(qA) ? qA : cmpPrevQ || quarters[Math.max(0, quarters.length - 2)]
  const selB = qB && quarters.includes(qB) ? qB : cmpQ || quarters[quarters.length - 1]

  const groups = useMemo(
    () =>
      Object.keys(gm)
        // K 1594 — "Unassigned" is noise on a comparison card.
        .filter((n) => n !== 'Unassigned')
        .map((name) => {
          const mm = gm[name]
          const curYTD = ytdNums.reduce(
            (s, mo) => s + ((mm[`${latestYear}-${mo}`] || [0, 0])[mi] || 0),
            0,
          )
          const priorYTD = prevYear
            ? ytdNums.reduce((s, mo) => s + ((mm[`${prevYear}-${mo}`] || [0, 0])[mi] || 0), 0)
            : 0
          return {
            name,
            mm,
            curYTD,
            priorYTD,
            curQ: sumM(mm, qmap[cmpQ]),
            prvQ: cmpPrevQ ? sumM(mm, qmap[cmpPrevQ]) : 0,
            cA: sumM(mm, qmap[selA]),
            cB: sumM(mm, qmap[selB]),
          }
        })
        .sort((a, b) => b.curYTD - a.curYTD),
    [gm, ytdNums, latestYear, prevYear, mi, cmpQ, cmpPrevQ, selA, selB, qmap, sumM],
  )

  const cardGroups = groups.slice(0, 12)
  const chartGroups = groups.slice(0, 10)

  const lq = quarters[quarters.length - 1]
  const pMonth = months[months.length - 1]
  const monthFactor =
    runrate && runrate.month === pMonth ? (isD ? runrate.factorD : runrate.factorU) : 1

  const yearOption = useMemo(
    () => ({
      ...BASE,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (val: number) => (isD ? fmtUSD(val) : String(val)),
      },
      legend: { type: 'scroll' as const, top: 0, ...legendStyle },
      grid: { left: 70, right: 20, top: 40, bottom: 40 },
      xAxis: categoryAxis(years, 0),
      yAxis: valueAxis((v: number) => (isD ? fmtShort(v) : String(v))),
      series: chartGroups.map((g, i) => ({
        name: g.name,
        type: 'bar' as const,
        itemStyle: { color: colorFor(g.name, i) },
        data: years.map((y) =>
          Math.round(
            sumM(
              g.mm,
              months.filter((m) => m.startsWith(y)),
            ),
          ),
        ),
      })),
    }),
    [chartGroups, years, months, isD, colorFor, sumM],
  )

  const quarterOption = useMemo(() => {
    const series: Record<string, unknown>[] = []
    chartGroups.forEach((g, i) => {
      const col = colorFor(g.name, i)
      series.push({
        name: g.name,
        type: 'bar',
        // One stack PER GROUP, so the run-rate cap sits on its own group's bar.
        stack: `q_${g.name}`,
        emphasis: { focus: 'series' },
        itemStyle: { color: col },
        data: quarters.map((q) => Math.round(sumM(g.mm, qmap[q]))),
      })
      if (latestPartial) {
        const pv = g.mm[pMonth] ? (isD ? g.mm[pMonth][0] : g.mm[pMonth][1]) : 0
        series.push({
          name: `${g.name} · run-rate`,
          type: 'bar',
          stack: `q_${g.name}`,
          itemStyle: {
            color: col,
            opacity: 0.28,
            borderColor: col,
            borderWidth: 1,
            borderType: 'dashed',
          },
          data: quarters.map((q) => (q === lq ? Math.round(pv * (monthFactor - 1)) : 0)),
        })
      }
    })
    return {
      ...BASE,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (val: number) => (isD ? fmtUSD(val) : String(val)),
      },
      legend: {
        type: 'scroll' as const,
        top: 0,
        ...legendStyle,
        data: chartGroups.map((g) => g.name),
      },
      grid: { left: 70, right: 20, top: 40, bottom: 55 },
      xAxis: categoryAxis(quarters),
      yAxis: valueAxis((v: number) => (isD ? fmtShort(v) : String(v))),
      series,
    }
  }, [chartGroups, quarters, qmap, latestPartial, pMonth, monthFactor, isD, lq, colorFor, sumM])

  const delta = (cur: number, prev: number): React.ReactNode => {
    const p = pctChange(cur, prev)
    if (p === null) return <span className="hl-delta flat">— new</span>
    const up = p >= 0
    return (
      <span className={`hl-delta ${up ? 'up' : 'down'}`}>
        {up ? '▲' : '▼'} {p >= 0 ? '+' : ''}
        {p.toFixed(1)}%
      </span>
    )
  }

  const stat = (
    lab: string,
    prevLab: string,
    prevVal: number,
    curLab: string,
    curVal: number,
  ): React.ReactNode => (
    <div className="hl-stat" key={lab}>
      <div className="hl-lab">{lab}</div>
      <div className="hl-cmp">
        <span className="hl-yr">{prevLab}</span>
        <span className="hl-amt">{fmtV(prevVal)}</span>
      </div>
      <div className="hl-cmp cur">
        <span className="hl-yr">{curLab}</span>
        <span className="hl-amt">{fmtV(curVal)}</span>
      </div>
      {delta(curVal, prevVal)}
    </div>
  )

  const qSelect = (val: string, onChange: (v: string) => void): React.ReactNode => (
    <select
      className="search"
      style={{ minWidth: 96 }}
      value={val || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {quarters.map((q) => (
        <option key={q} value={q}>
          {qLabel(q)}
        </option>
      ))}
    </select>
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
          {DIMS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
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
        {months.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Compare
            </span>
            {qSelect(selA, setQA)}
            <span className="muted" style={{ fontSize: 12 }}>
              vs
            </span>
            {qSelect(selB, setQB)}
          </span>
        )}
        <OtherToggle />
        <div className="grow" />
      </div>

      {!months.length ? (
        <div className="empty">No production data.</div>
      ) : (
        <>
          <div className="hint">
            Year-over-year compares {latestYear} vs {prevYear || '—'} YTD ({ytdNums[0] || ''}–
            {ytdNums[ytdNums.length - 1] || ''}). Quarter = latest complete quarter (
            <b>
              {qLabel(cmpQ)} vs {cmpPrevQ ? qLabel(cmpPrevQ) : '—'}
            </b>
            ). Custom = the two quarters you pick above. Excludes branches unticked on the Data tab.
          </div>

          <div className="hl-grid">
            {cardGroups.map((g, i) => {
              const col = colorFor(g.name, i)
              return (
                <div
                  className="hl-card"
                  key={g.name}
                  style={{ borderColor: `${col}66`, boxShadow: `0 0 18px ${col}22` }}
                >
                  <div className="hl-name" style={{ color: col }}>
                    {g.name}
                  </div>
                  <div className="hl-row">
                    {stat('Year over Year', prevYear || '—', g.priorYTD, latestYear, g.curYTD)}
                    {stat(
                      'Quarter',
                      cmpPrevQ ? qLabel(cmpPrevQ) : '—',
                      g.prvQ,
                      qLabel(cmpQ),
                      g.curQ,
                    )}
                    {stat('Custom', qLabel(selA), g.cA, qLabel(selB), g.cB)}
                  </div>
                </div>
              )
            })}
          </div>

          {groups.length > cardGroups.length && (
            <div className="hint">
              Showing top {cardGroups.length} of {groups.length} by {latestYear} YTD. Charts below
              include the top 10.
            </div>
          )}

          <div className="card chart-box">
            <div className="chart-title">Year over year — {isD ? 'Dollars' : 'Units'}</div>
            <Chart option={yearOption} />
          </div>

          <div className="card chart-box">
            <div className="chart-title">
              Quarterly production — {isD ? 'Dollars' : 'Units'}
              {latestPartial ? ` · ${qLabel(lq)} — faded top = ${pMonth} run-rate` : ''}
            </div>
            <Chart option={quarterOption} />
          </div>
        </>
      )}
    </>
  )
}

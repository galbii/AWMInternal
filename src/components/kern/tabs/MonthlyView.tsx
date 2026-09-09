'use client'

// K 1390-1549 — intra-month pacing by BUSINESS DAY, so months of different
// lengths line up fairly.
//
// Two modes. "Merged" sums the selected branches and, when the in-progress
// month is selected, projects it: a median pace line, a confidence band, and
// KPI tiles. "Separate" draws one line per branch. The projection is refit for
// whatever branches and months are selected — it does not just read
// PROD_RUNRATE, which is a whole-company figure (see src/lib/kern/runrate.ts).

import React, { useEffect, useMemo, useState } from 'react'

import { BASE, PALETTE, legendStyle } from '@/lib/kern/charts'
import { fmtShort, fmtUSD } from '@/lib/kern/format'
import { prodName } from '@/lib/kern/production'
import { fitRunRate, paceCurve, type MonthPoint } from '@/lib/kern/runrate'
import type { DailySeriesByBranch, MetricKey, RunRate } from '@/lib/kern/types'

import Chart, { type ChartOption } from '../Chart'
import { useKern } from '../KernProvider'
import SegToggle from '../ui/SegToggle'

type ViewMode = 'merged' | 'separate'
type Mode = 'cumulative' | 'daily'

interface DailyData {
  PROD_MBDAYS: Record<string, number>
  PROD_DAILY_BR: DailySeriesByBranch
  PROD_RUNRATE: RunRate
}

export default function MonthlyView() {
  const { state } = useKern()
  const [data, setData] = useState<DailyData | null>(null)
  const [view, setView] = useState<ViewMode>('merged')
  const [metric, setMetric] = useState<MetricKey>('dollars')
  const [mode, setMode] = useState<Mode>('cumulative')
  const [conf, setConf] = useState(0.75)
  const [monthSel, setMonthSel] = useState<Record<string, boolean> | null>(null)
  const [brSel, setBrSel] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    void import('@/lib/kern/data/production').then((m) =>
      setData({
        PROD_MBDAYS: m.PROD_MBDAYS,
        PROD_DAILY_BR: m.PROD_DAILY_BR,
        PROD_RUNRATE: m.PROD_RUNRATE,
      }),
    )
  }, [])

  const allMonths = useMemo(() => (data ? Object.keys(data.PROD_MBDAYS).sort() : []), [data])
  const branchKeys = useMemo(() => (data ? Object.keys(data.PROD_DAILY_BR) : []), [data])

  // K 1406-1409 — default selection: the last 4 months plus the same month a
  // year earlier, which is the comparison people actually want.
  useEffect(() => {
    if (!data || !allMonths.length || monthSel) return
    const last = allMonths[allMonths.length - 1]
    const pick = new Set([last])
    for (let i = 1; i <= 3; i++) {
      const idx = allMonths.length - 1 - i
      if (idx >= 0) pick.add(allMonths[idx])
    }
    const parts = last.split('-')
    const yoy = `${parseInt(parts[0], 10) - 1}-${parts[1]}`
    if (data.PROD_MBDAYS[yoy]) pick.add(yoy)
    setMonthSel(Object.fromEntries([...pick].map((m) => [m, true])))
  }, [data, allMonths, monthSel])

  useEffect(() => {
    if (!data || !branchKeys.length || brSel) return
    setBrSel(Object.fromEntries(branchKeys.map((k) => [k, true])))
  }, [data, branchKeys, brSel])

  const isD = metric === 'dollars'
  const mkey: 'd' | 'u' = isD ? 'd' : 'u'

  const selMonths = useMemo(() => allMonths.filter((m) => monthSel?.[m]), [allMonths, monthSel])
  const selBr = useMemo(() => branchKeys.filter((k) => brSel?.[k]), [branchKeys, brSel])

  // K 1437-1438 — cumulative array for a month, summed over selected branches.
  const subArr = useMemo(() => {
    if (!data) return () => [] as number[]
    const cache: Record<string, number[]> = {}
    return (mo: string): number[] => {
      const ck = `${mo}|${mkey}|${selBr.join(',')}`
      if (cache[ck]) return cache[ck]
      const N = data.PROD_MBDAYS[mo]
      const a = new Array<number>(N).fill(0)
      selBr.forEach((k) => {
        const bm = data.PROD_DAILY_BR[k]?.[mo]
        if (bm) {
          const src = bm[mkey]
          for (let i = 0; i < N; i++) a[i] += src[i] || 0
        }
      })
      cache[ck] = a
      return a
    }
  }, [data, mkey, selBr])

  const BD = data?.PROD_RUNRATE.bday ?? 5
  const PM = data?.PROD_RUNRATE.month ?? allMonths[allMonths.length - 1]

  const at = useMemo(
    () =>
      (mo: string): MonthPoint => {
        const a = subArr(mo)
        const n = Math.min(BD, a.length)
        return { cum: a[n - 1] || 0, tot: a[a.length - 1] || 0, bdays: a.length, arr: a }
      },
    [subArr, BD],
  )

  // K 1440-1441 — prefer the user's own month selection as the reference set,
  // but fall back to all history when they picked fewer than three with data.
  const fit = useMemo(() => {
    if (!data || !selMonths.length) return null
    const compSel = selMonths.filter((m) => m !== PM)
    const patMonths =
      compSel.filter((m) => at(m).tot > 0).length >= 3 ? compSel : allMonths.filter((m) => m !== PM)
    return fitRunRate({
      patMonths,
      pm: PM,
      at,
      gf: isD ? data.PROD_RUNRATE.gfD : data.PROD_RUNRATE.gfU,
    })
  }, [data, selMonths, allMonths, PM, at, isD])

  const fV = (n: number): string => (isD ? fmtShort(n) : Math.round(n).toLocaleString())

  const maxN = useMemo(
    () => (data ? Math.max(1, ...selMonths.map((m) => data.PROD_MBDAYS[m])) : 1),
    [data, selMonths],
  )

  const option = useMemo<ChartOption | null>(() => {
    if (!data || !selMonths.length) return null
    const xcats = Array.from({ length: maxN }, (_, i) => i + 1)
    const series: Record<string, unknown>[] = []
    let legendData: string[] = []

    // K 1489-1490 — a branch's curve carries its last value forward so a short
    // month doesn't dive to zero when summed across months of different length.
    const brCurve = (k: string): number[] => {
      const arr = new Array<number>(maxN).fill(0)
      selMonths.forEach((mo) => {
        const bm = data.PROD_DAILY_BR[k]?.[mo]
        if (bm) {
          const src = bm[mkey]
          const N = src.length
          for (let j = 0; j < maxN; j++) arr[j] += j < N ? src[j] : src[N - 1] || 0
        }
      })
      return arr
    }

    if (view === 'separate') {
      selBr.forEach((k, i) => {
        const arr = brCurve(k)
        const d =
          mode === 'cumulative'
            ? arr.slice()
            : arr.map((val, j) => (j === 0 ? val : Math.max(0, val - arr[j - 1])))
        series.push({
          name: prodName(state, k),
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: PALETTE[i % PALETTE.length] },
          itemStyle: { color: PALETTE[i % PALETTE.length] },
          emphasis: { focus: 'series' },
          data: d,
        })
        legendData.push(prodName(state, k))
      })
    } else if (fit && monthSel?.[PM]) {
      const { medShape, curve, endN, mBD } = paceCurve(fit, maxN, BD, subArr)

      if (mode === 'cumulative') {
        // The band is drawn as two stacked invisible lines: a transparent base
        // at the low edge, then the delta up to the high edge carrying the fill.
        const bandFill = (
          loArr: (number | null)[],
          hiArr: (number | null)[],
          op: number,
          st: string,
        ): void => {
          const base = new Array<number | null>(maxN).fill(null)
          const delta = new Array<number | null>(maxN).fill(null)
          for (let k = BD; k <= endN; k++) {
            base[k - 1] = loArr[k - 1]
            delta[k - 1] = (hiArr[k - 1] ?? 0) - (loArr[k - 1] ?? 0)
          }
          const grad = {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `rgba(255,59,82,${op * 1.08})` },
              { offset: 1, color: `rgba(176,107,255,${op})` },
            ],
          }
          series.push({
            name: `${st}b`,
            type: 'line',
            stack: st,
            symbol: 'none',
            lineStyle: { opacity: 0 },
            areaStyle: { opacity: 0 },
            data: base,
            silent: true,
          })
          series.push({
            name: `${st}f`,
            type: 'line',
            stack: st,
            symbol: 'none',
            lineStyle: { opacity: 0 },
            areaStyle: { color: grad },
            data: delta,
            silent: true,
          })
        }
        bandFill(curve(fit.bq((1 + conf) / 2)), curve(fit.bq((1 - conf) / 2)), 0.12, 'oB')
        bandFill(curve(fit.bq(0.75)), curve(fit.bq(0.25)), 0.3, 'iB')

        const med = new Array<number | null>(maxN).fill(null)
        const c50 = curve(fit.frac)
        for (let k = 1; k <= BD; k++) med[k - 1] = Math.round((fit.actual * medShape[k - 1]) / mBD)
        for (let k = BD; k <= endN; k++) med[k - 1] = c50[k - 1]
        series.push({
          name: 'Typical pace',
          type: 'line',
          connectNulls: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#9fb6cf', type: 'dashed' },
          itemStyle: { color: '#9fb6cf' },
          data: med,
        })

        const a = subArr(PM)
        const act = new Array<number | null>(maxN).fill(null)
        for (let k = 1; k <= Math.min(BD, a.length); k++) act[k - 1] = a[k - 1]
        series.push({
          name: `${PM} actual`,
          type: 'line',
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { width: 3.5, color: '#25e0ff' },
          itemStyle: { color: '#25e0ff' },
          data: act,
        })
        legendData = [`${PM} actual`, 'Typical pace']
      } else {
        const a = subArr(PM)
        const bars = new Array<number | null>(maxN).fill(null)
        for (let k = 1; k <= Math.min(BD, a.length); k++) {
          bars[k - 1] = k === 1 ? a[0] : a[k - 1] - a[k - 2]
        }
        series.push({
          name: `${PM} actual`,
          type: 'bar',
          itemStyle: { color: '#25e0ff' },
          data: bars,
        })

        const med = new Array<number | null>(maxN).fill(null)
        for (let k = 1; k <= BD; k++) med[k - 1] = Math.round((fit.actual * medShape[k - 1]) / mBD)
        const c50 = curve(fit.frac)
        for (let k = BD; k <= endN; k++) med[k - 1] = c50[k - 1]
        // Differentiate the cumulative median into a per-day line.
        const td = new Array<number | null>(maxN).fill(null)
        for (let k = 1; k <= endN; k++) {
          const prev = k > 1 ? med[k - 2] : 0
          if (med[k - 1] != null && prev != null) td[k - 1] = Math.max(0, (med[k - 1] ?? 0) - prev)
        }
        series.push({
          name: 'Typical daily',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#9fb6cf', type: 'dashed' },
          itemStyle: { color: '#9fb6cf' },
          data: td,
        })
        legendData = [`${PM} actual`, 'Typical daily']
      }
    } else {
      // K 1531-1535 — no in-progress month selected: plain comparison lines.
      selMonths.forEach((m, i) => {
        const arr = subArr(m)
        const d =
          mode === 'cumulative'
            ? arr.slice()
            : arr.map((val, k) => (k === 0 ? val : val - arr[k - 1]))
        series.push({
          name: m,
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: PALETTE[i % PALETTE.length] },
          itemStyle: { color: PALETTE[i % PALETTE.length] },
          data: d,
        })
        legendData.push(m)
      })
    }

    return {
      ...BASE,
      tooltip: {
        trigger: 'axis',
        valueFormatter: (val: number | null) => (val == null ? '—' : isD ? fmtUSD(val) : val),
      },
      legend: { type: 'scroll', top: 0, ...legendStyle, data: legendData },
      grid: { left: 72, right: 24, top: 44, bottom: 52 },
      xAxis: {
        type: 'category',
        data: xcats,
        name: 'Business day of month',
        nameLocation: 'middle',
        nameGap: 32,
        nameTextStyle: { color: '#9fd6ea' },
        axisLabel: { color: '#8fb8cf' },
        axisLine: { lineStyle: { color: '#2a4c6a' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#8fb8cf', formatter: (v: number) => (isD ? fmtShort(v) : String(v)) },
        splitLine: { lineStyle: { color: '#122c42' } },
      },
      series,
    }
  }, [
    data,
    selMonths,
    selBr,
    maxN,
    view,
    mode,
    fit,
    monthSel,
    PM,
    BD,
    conf,
    isD,
    mkey,
    subArr,
    state,
  ])

  if (!data) return <div className="empty">Loading daily data…</div>
  if (!allMonths.length) return <div className="empty">No daily data.</div>

  // K 1414 — branch chips ordered by lifetime volume, biggest first.
  const brOrder = [...branchKeys]
    .map((k) => {
      let t = 0
      Object.values(data.PROD_DAILY_BR[k]).forEach((mm) => (t += mm.d[mm.d.length - 1] || 0))
      return { k, t }
    })
    .sort((a, b) => b.t - a.t)
    .map((x) => x.k)

  const tile = (lab: string, val: string, sub?: string, col?: string): React.ReactNode => (
    <div className="kpi" key={lab}>
      <div className="k-val" style={col ? { color: col } : undefined}>
        {val}
      </div>
      <div className="k-lab">{lab}</div>
      {sub ? <div className="k-sub">{sub}</div> : null}
    </div>
  )

  const pc = Math.round(conf * 100)
  const scope =
    selBr.length === branchKeys.length
      ? 'all branches'
      : `${selBr.length} branch${selBr.length > 1 ? 'es' : ''}`

  return (
    <>
      <div className="toolbar">
        <SegToggle
          options={[
            { v: 'merged' as ViewMode, label: 'Merged' },
            { v: 'separate' as ViewMode, label: 'Separate' },
          ]}
          current={view}
          onPick={setView}
        />
        <SegToggle
          options={[
            { v: 'dollars' as MetricKey, label: 'Dollars' },
            { v: 'units' as MetricKey, label: 'Units' },
          ]}
          current={metric}
          onPick={setMetric}
        />
        <SegToggle
          options={[
            { v: 'cumulative' as Mode, label: 'Cumulative' },
            { v: 'daily' as Mode, label: 'Daily' },
          ]}
          current={mode}
          onPick={setMode}
        />
        <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
          Interval
        </span>
        <SegToggle
          options={[
            { v: 0.5, label: '50%' },
            { v: 0.75, label: '75%' },
            { v: 0.9, label: '90%' },
          ]}
          current={conf}
          onPick={setConf}
        />
        <div className="grow" />
      </div>

      <div className="toolbar" style={{ marginTop: 0 }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          Branches
        </span>
        <button
          className="sm ghost"
          onClick={() => setBrSel(Object.fromEntries(branchKeys.map((k) => [k, true])))}
        >
          All
        </button>
        <button className="sm ghost" onClick={() => setBrSel({})}>
          Clear
        </button>
        <div className="mchips">
          {brOrder.map((k) => (
            <button
              key={k}
              className={`mchip${brSel?.[k] ? ' on' : ''}`}
              onClick={() =>
                setBrSel((s) => {
                  const next = { ...(s || {}) }
                  if (next[k]) delete next[k]
                  else next[k] = true
                  return next
                })
              }
            >
              {prodName(state, k)}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 0 }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          Months
        </span>
        <button
          className="sm ghost"
          onClick={() => setMonthSel(Object.fromEntries(allMonths.map((m) => [m, true])))}
        >
          All
        </button>
        <button className="sm ghost" onClick={() => setMonthSel({})}>
          Clear
        </button>
        <div className="mchips">
          {allMonths.map((m) => (
            <button
              key={m}
              className={`mchip${monthSel?.[m] ? ' on' : ''}`}
              onClick={() =>
                setMonthSel((s) => {
                  const next = { ...(s || {}) }
                  if (next[m]) delete next[m]
                  else next[m] = true
                  return next
                })
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {fit && monthSel?.[PM] && view === 'merged' && (
        <div className="kpis">
          {tile(`${PM} so far`, fV(fit.actual), `${scope} · through BD${BD}`)}
          {tile(
            `${PM} projected`,
            fV(fit.actual / fit.frac),
            `run-rate ×${(1 / fit.frac).toFixed(2)} · median pace`,
          )}
          {tile(
            `${pc}% range`,
            `${fV(fit.actual / fit.bq((1 + conf) / 2))} – ${fV(fit.actual / fit.bq((1 - conf) / 2))}`,
            `~${pc}% chance the month lands in here`,
          )}
          {tile(
            `Reliability @ BD${BD}`,
            fit.conf,
            `back-test ±${fit.mape.toFixed(0)}% over ${fit.n} mo`,
            fit.conf === 'High' ? '#4ade80' : fit.conf === 'Moderate' ? '#ffd166' : '#ff8fa0',
          )}
        </div>
      )}

      <div className="card chart-box tall">
        <div className="chart-title">
          {view === 'separate' ? 'Per-branch ' : ''}
          {mode === 'cumulative' ? 'Cumulative' : 'Daily'} production by business day —{' '}
          {isD ? 'Dollars' : 'Units'}
        </div>
        {option ? <Chart option={option} /> : <div className="empty">Select a month.</div>}
      </div>

      <div className="hint">
        <b>Merged</b> sums the selected branches and projects {PM} —{' '}
        <span style={{ color: '#c9a3ff' }}>purple</span> near the current pace fading to{' '}
        <span style={{ color: '#ff8fa0' }}>red</span> at the top (p10–p90), with a typical-pace
        reference. <b>Separate</b> draws one line per selected branch (summed over the selected
        months). X-axis is <b>business-day-of-month</b> so months line up fairly. Projection tiles
        &amp; confidence recompute for the branches/months you select. Based on source funding
        dates.
      </div>
    </>
  )
}

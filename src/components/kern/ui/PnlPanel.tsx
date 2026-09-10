'use client'

// K 995-1047 — the Support P&L side panel. The arithmetic lives in
// src/lib/kern/pnl.ts; this is only the form and the read-out.

import React from 'react'

import { fmtShort } from '@/lib/kern/format'
import { computePnl } from '@/lib/kern/pnl'
import type { PnlSettings } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

const money = (n: number): string =>
  `${n < 0 ? '-$' : '$'}${Math.abs(Math.round(n)).toLocaleString()}`

export default function PnlPanel({
  rosterUnits,
  rosterVol,
}: {
  rosterUnits: number
  rosterVol: number
}) {
  const { state, update } = useKern()
  const P = state.pnl
  const r = computePnl(P, rosterUnits, rosterVol)

  const setNum = (k: keyof PnlSettings, raw: string): void => {
    const val = raw.trim()
    update((d) => {
      // '' is meaningful: it means "no override", distinct from 0.
      d.pnl = { ...d.pnl, [k]: val === '' ? '' : parseFloat(val) || 0 }
    })
  }
  const setBool = (k: keyof PnlSettings, v: boolean): void =>
    update((d) => {
      d.pnl = { ...d.pnl, [k]: v }
    })

  const num = (
    lab: string,
    key: keyof PnlSettings,
    step: string,
    suf?: string,
    dis?: boolean,
  ): React.ReactNode => {
    const raw = P[key]
    return (
      <label className={`pl-f${dis ? ' dim' : ''}`} key={key}>
        <span>{lab}</span>
        <input
          type="number"
          step={step}
          disabled={dis}
          value={raw === '' || raw == null ? '' : String(raw)}
          onChange={(e) => setNum(key, e.target.value)}
        />
        {suf ? <em>{suf}</em> : null}
      </label>
    )
  }

  return (
    <>
      <div className="pl-head">
        Support P&amp;L <span className="pl-sub">monthly</span>
      </div>

      <div className="pl-grid">
        <label className="pl-chk">
          <input
            type="checkbox"
            checked={P.useRoster}
            onChange={(e) => setBool('useRoster', e.target.checked)}
          />{' '}
          Use roster totals
        </label>
        {num('Units', 'units', '1', '', P.useRoster)}
        {num('Volume $', 'vol', '1', '', P.useRoster)}
        {num('Processing $/loan', 'procFee', '5', '$/loan')}
        {num('LOA charge', 'loaBps', '1', 'bps')}
        {num('# support people', 'people', '1')}
        {num('Avg salary', 'salary', '100', '$/mo')}
        {num('High-cost tier', 'hiBps', '1', 'bps')}
        {num('Low-cost tier', 'loBps', '1', 'bps')}
        {num('Processing % @ high', 'procHiPct', '1', '%')}
        {num('LOA % @ high', 'loaHiPct', '1', '%')}
        <label className="pl-chk">
          <input
            type="checkbox"
            checked={P.onTop}
            onChange={(e) => setBool('onTop', e.target.checked)}
          />{' '}
          Comp on top of salary
        </label>
      </div>

      <div className="pl-basis">
        {r.units.toLocaleString()} units · {fmtShort(r.vol)} · avg loan {fmtShort(r.avgLoan)}
      </div>

      <div className="pl-rows">
        <div className="pl-r">
          <span>Revenue</span>
          <b>{money(r.revenue)}</b>
        </div>
        <div className="pl-r">
          <span>
            Comp — blended ({r.procBps.toFixed(2)} / {r.loaBps.toFixed(2)} bps)
          </span>
          <b className="neg">-${Math.round(r.compBlend).toLocaleString()}</b>
        </div>
        {P.onTop && (
          <div className="pl-r">
            <span>
              Team salary ({P.people} × {fmtShort(Number(P.salary))})
            </span>
            <b className="neg">-${Math.round(r.team).toLocaleString()}</b>
          </div>
        )}
        <div className={`pl-r tot ${r.netBlend >= 0 ? 'pos' : 'negT'}`}>
          <span>Net — blended mix</span>
          <b>{money(r.netBlend)}</b>
        </div>
      </div>

      <div className="pl-alt">
        <div className="pl-r">
          <span>If all files → low-cost tier</span>
          <b className={r.netLow >= 0 ? 'pos' : 'negT'}>{money(r.netLow)}</b>
        </div>
        <div className="pl-note">
          Comp saving vs blended: {money(r.compSaving)}
          {r.breakEvenUnits != null ? ` · break-even ≈ ${Math.ceil(r.breakEvenUnits)} units` : ''}
        </div>
      </div>
    </>
  )
}

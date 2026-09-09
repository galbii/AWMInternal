'use client'

// The ECharts wrapper. K 848-849 (mkChart / disposeCharts) — the source kept a
// module-global instance array and disposed the lot at the top of every render;
// here each chart owns its own lifecycle.
//
// ECharts is imported dynamically so it stays out of the server graph and out
// of the initial bundle: it is ~1MB, and eight of the sixteen tabs never touch
// a chart.

import React, { useEffect, useRef } from 'react'

/**
 * An ECharts option object.
 *
 * Deliberately NOT `echarts.EChartsOption`. That type is a huge discriminated
 * union, and options assembled conditionally — a series array built by .map()
 * with an optional extra entry, a formatter closure — fail to narrow against it
 * even when they are perfectly valid at runtime. Typing the seam loosely here
 * keeps a single documented boundary instead of an `as` cast at all nine call
 * sites. The option builders themselves live in src/lib/kern/charts.ts and are
 * typed where it pays.
 */
export type ChartOption = Record<string, unknown>

export interface ChartProps {
  option: ChartOption
  className?: string
  /** Inline height; the port's CSS sets one on .chart-canvas for most uses. */
  height?: number | string
  /** Called with the chart instance's click payload, when a tab needs it. */
  onSelect?: (name: string) => void
}

export default function Chart({ option, className, height, onSelect }: ChartProps) {
  const elRef = useRef<HTMLDivElement>(null)
  // Not React state: the instance is imperative and must never trigger renders.
  const chartRef = useRef<{
    setOption: (o: ChartOption, notMerge?: boolean) => void
    resize: () => void
    dispose: () => void
  } | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let disposed = false
    let instance: { resize: () => void; dispose: () => void } | null = null

    void import('echarts').then((echarts) => {
      if (disposed || !elRef.current) return
      const c = echarts.init(elRef.current, null, { renderer: 'canvas' })
      c.setOption(optionRef.current)
      c.on('click', (p: unknown) => {
        const name = (p as { name?: string })?.name
        if (name && onSelectRef.current) onSelectRef.current(name)
      })
      chartRef.current = c as unknown as typeof chartRef.current
      instance = c
    })

    const onResize = (): void => instance?.resize()
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      instance?.dispose()
      chartRef.current = null
    }
  }, [])

  // `notMerge` so a series list that SHRANK (fewer branches selected) actually
  // loses the old series instead of keeping them around.
  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return (
    <div
      ref={elRef}
      className={className ?? 'chart-canvas'}
      style={height !== undefined ? { height } : undefined}
    />
  )
}

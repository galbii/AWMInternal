// Shared chart styling. The source repeated these literals in every option
// object; they are pulled out so the eight chart-bearing tabs stay consistent
// and the option builders can be unit-tested.
// K 1288-1388, 1390-1549, 1551-1663, 1210-1286.

/** K 1306 — the categorical series palette, in order. */
export const PALETTE = [
  '#25e0ff',
  '#ff3b52',
  '#7cf6ff',
  '#b06bff',
  '#38f2b0',
  '#ffd166',
  '#ff7ab0',
  '#5aa9ff',
  '#f472b6',
  '#a3e635',
  '#22d3ee',
  '#fb923c',
  '#e879f9',
  '#4ade80',
  '#60a5fa',
  '#f87171',
  '#c084fc',
  '#2dd4bf',
  '#facc15',
  '#fb7185',
]

export const AXIS_LABEL = '#8fb8cf'
export const AXIS_LINE = '#2a4c6a'
export const SPLIT_LINE = '#122c42'
export const LEGEND_TEXT = '#bfe6f5'

export const legendStyle = { textStyle: { color: LEGEND_TEXT } }

export const categoryAxis = (data: (string | number)[], rotate = 45) => ({
  type: 'category' as const,
  data,
  axisLabel: { color: AXIS_LABEL, rotate },
  axisLine: { lineStyle: { color: AXIS_LINE } },
})

export const valueAxis = (formatter?: (v: number) => string) => ({
  type: 'value' as const,
  axisLabel: { color: AXIS_LABEL, ...(formatter ? { formatter } : {}) },
  splitLine: { lineStyle: { color: SPLIT_LINE } },
})

/** Every chart in the app sits on the card background, not its own. */
export const BASE = { backgroundColor: 'transparent' as const }

/** K 1310 — the run-rate cap's gradient, red at the top fading to purple. */
export const PROJ_GRADIENT = {
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: 'rgba(255,59,82,0.65)' },
    { offset: 1, color: 'rgba(176,107,255,0.58)' },
  ],
}

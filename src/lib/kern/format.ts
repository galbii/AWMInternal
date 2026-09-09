// Display helpers. K 121, 844–847.

/** K 121 */
export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** K 846 */
export function fmtUSD(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

/** K 847 — compact dollars for axis labels and dense cells. */
export function fmtShort(n: number): string {
  if (!isFinite(n)) return '$—'
  n = n || 0
  const a = Math.abs(n)
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

/** Signed dollars-and-cents, the Credit tab's format. K 882 */
export function fmtCents(n: number): string {
  return `${n < 0 ? '-$' : '$'}${Math.abs(n).toFixed(2)}`
}

/**
 * K 844 — the division colours. Matched on the NAME, not an id, because the
 * source lets a division be renamed without losing its colour.
 */
export function divColor(name?: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('red')) return '#ff3b52'
  if (n.includes('blue')) return '#25e0ff'
  return '#8aa0b8'
}

/** K 845 — null when there is no prior period to compare against. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}

/** K 843 — "2026-04" -> "2026-Q2". */
export function quarterOf(month: string): string {
  const [y, mo] = month.split('-').map(Number)
  return `${y}-Q${Math.ceil((mo || 1) / 3)}`
}

/** K 843 — group a month list into quarter buckets, preserving order. */
export function monthsByQuarter(list: string[]): Record<string, string[]> {
  const q: Record<string, string[]> = {}
  list.forEach((m) => {
    const k = quarterOf(m)
    ;(q[k] ||= []).push(m)
  })
  return q
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "2026-04" -> "Apr 2026". */
export function monthLabel(month: string): string {
  const [y, mo] = month.split('-')
  const idx = Number(mo) - 1
  return `${MONTH_LABELS[idx] ?? mo} ${y}`
}

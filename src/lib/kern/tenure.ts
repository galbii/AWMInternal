// Tenure rows: one per production org, ordered by how long it has been funding.
// K 1167-1175.

import { prodName } from '@/lib/kern/production'
import type { OrgState, ProductionPair } from '@/lib/kern/types'

export interface TenureRow {
  org: string
  name: string
  mm: Record<string, ProductionPair>
  /** First month with any funded volume or units. */
  first: string
  /** Months with any activity — not the span, the count. */
  active: number
  d: number
  u: number
}

/**
 * K 1167-1175. Orgs that never funded anything are dropped (the source marks
 * them '9999-99' and filters).
 *
 * Order is "longest tenure first": earliest first month, then the most active
 * months, then the biggest volume — so a branch that started early AND kept
 * producing outranks one that funded once in 2019 and stopped.
 */
export function tenureRows(s: OrgState, months: string[]): TenureRow[] {
  return Object.keys(s.production)
    .map((org) => {
      const mm = s.production[org]
      let first: string | null = null
      let d = 0
      let u = 0
      let active = 0
      months.forEach((m) => {
        const rec = mm[m]
        if (rec && ((rec[0] || 0) > 0 || (rec[1] || 0) > 0)) {
          if (!first) first = m
          d += rec[0] || 0
          u += rec[1] || 0
          active++
        }
      })
      return { org, name: prodName(s, org), mm, first: first || '9999-99', active, d, u }
    })
    .filter((r) => r.first !== '9999-99')
    .sort((a, b) => a.first.localeCompare(b.first) || b.active - a.active || b.d - a.d)
}

/** K 1243 — the product-mix programs, in display order. */
export const PRODUCT_TYPES: [key: 'conv' | 'fha' | 'va' | 'nonqm', label: string, color: string][] =
  [
    ['conv', 'Conventional', '#25e0ff'],
    ['fha', 'FHA', '#b06bff'],
    ['va', 'VA', '#38f2b0'],
    ['nonqm', 'Non-QM', '#ffd166'],
  ]

// CSV parsing, exports, and the employee import template.
// K 180-192 (branches), 686-692 (employees), 693-704 (parseCSV),
// 705-715 (template), 716-744 (import), 987-994 (roster), 864-869 (production),
// 872-879 (credit).

import { emp } from '@/lib/kern/normalize'
import { branchArea, branchDivision, branchRegion } from '@/lib/kern/org'
import type { Employee, OrgState } from '@/lib/kern/types'

/** K 693-704 — a full RFC-4180-ish reader: quotes, doubled quotes, CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let i = 0
  let f = ''
  let row: string[] = []
  let q = false
  const t = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  while (i < t.length) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          f += '"'
          i += 2
          continue
        }
        q = false
        i++
        continue
      }
      f += c
      i++
      continue
    }
    if (c === '"') {
      q = true
      i++
      continue
    }
    if (c === ',') {
      row.push(f)
      f = ''
      i++
      continue
    }
    if (c === '\n') {
      row.push(f)
      rows.push(row)
      row = []
      f = ''
      i++
      continue
    }
    f += c
    i++
  }
  if (f.length || row.length) {
    row.push(f)
    rows.push(row)
  }
  return rows
}

/** Quote a cell only when it needs it — the source's rule. */
const cell = (c: unknown): string => {
  const s = String(c == null ? '' : c)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCSV = (rows: unknown[][]): string =>
  rows.map((r) => r.map(cell).join(',')).join('\n')

/** Trigger a browser download. Client-only. */
export function downloadCSV(rows: unknown[][], filename: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** K 180-192 */
export function branchesCSV(s: OrgState): unknown[][] {
  const rows: unknown[][] = [
    [
      'ORGID',
      'Branch',
      'Status',
      'Sub-division',
      'Region',
      'Area',
      'Branch Manager',
      'Area Manager',
      'Regional Manager',
      'Divisional Manager',
      'Serviced By',
      'Roster',
    ],
  ]
  s.branches
    .filter((b) => !b.archived)
    .forEach((b) => {
      const r = branchRegion(s, b)
      const div = branchDivision(s, b)
      const ar = branchArea(s, b)
      rows.push([
        b.orgid,
        b.name,
        b.status,
        div ? div.name : '',
        r ? r.name : '',
        ar ? ar.name : '',
        b.manager || '',
        ar ? ar.manager : '',
        r ? r.manager : '',
        div ? div.manager : '',
        (b.servicedBy || []).join('; '),
        (b.roster || []).map((e) => e.name + (e.title ? ` (${e.title})` : '')).join('; '),
      ])
    })
  return rows
}

/** K 686-692 */
export function employeesCSV(s: OrgState): unknown[][] {
  const rows: unknown[][] = [['Name', 'Title', 'Branch', 'Email', 'Phone']]
  s.branches
    .filter((b) => !b.archived)
    .forEach((b) =>
      (b.roster || []).forEach((e) =>
        rows.push([e.name, e.title, b.name, e.email || '', e.phone || '']),
      ),
    )
  return rows
}

/** K 705-715 — a two-row example using real branch names when there are any. */
export function employeeTemplateCSV(s: OrgState): unknown[][] {
  const names = s.branches
    .filter((b) => !b.archived)
    .map((b) => b.name || b.orgid)
    .filter(Boolean)
  const s1 = names[0] || 'Branch Name'
  const s2 = names[1] || s1
  return [
    ['Branch', 'Name', 'Title', 'Email', 'Phone'],
    [s1, 'Jane Smith', 'Loan Officer', 'jane@example.com', '555-100-2000'],
    [s2, 'John Doe', 'Processor', 'john@example.com', '555-100-3000'],
  ]
}

export interface EmployeeImportResult {
  /** Mutated copies to write back. */
  branches: OrgState['branches']
  /** Titles seen in the file that were not already known. */
  titles: string[]
  added: number
  /** Branch names in the file that matched nothing. */
  unmatched: string[]
}

/**
 * K 716-744 — merge an employee CSV into the roster.
 *
 * Pure: returns new arrays for the caller to commit. Matches a branch by NAME
 * or ORGID, case-insensitively. A header row is detected by looking for
 * "branch" and "name"; without one the columns are taken positionally, which is
 * what lets a hand-made file work. Rows that match no branch are skipped and
 * reported rather than silently dropped.
 */
export function applyEmployeeImport(s: OrgState, rows: string[][]): EmployeeImportResult {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (!nonEmpty.length) return { branches: s.branches, titles: [], added: 0, unmatched: [] }

  let start = 0
  const h = nonEmpty[0].map((c) => c.trim().toLowerCase())
  const idx = {
    branch: h.indexOf('branch'),
    name: h.indexOf('name'),
    title: h.indexOf('title'),
    email: h.indexOf('email'),
    phone: h.indexOf('phone'),
  }
  if (idx.branch >= 0 && idx.name >= 0) start = 1
  else {
    idx.branch = 0
    idx.name = 1
    idx.title = 2
    idx.email = 3
    idx.phone = 4
  }

  const bmap: Record<string, string> = {}
  s.branches.forEach((b) => {
    if (b.name) bmap[b.name.trim().toLowerCase()] = b.id
    if (b.orgid) bmap[String(b.orgid).trim().toLowerCase()] = b.id
  })

  const additions: Record<string, Employee[]> = {}
  const titles: string[] = []
  const unmatched = new Set<string>()
  let added = 0

  for (let i = start; i < nonEmpty.length; i++) {
    const r = nonEmpty[i]
    const bkey = (r[idx.branch] || '').trim().toLowerCase()
    const nm = (r[idx.name] || '').trim()
    if (!bkey || !nm) continue
    const bid = bmap[bkey]
    if (!bid) {
      unmatched.add((r[idx.branch] || '').trim())
      continue
    }

    const e = emp(nm, (idx.title >= 0 ? r[idx.title] || '' : '').trim())
    e.email = (idx.email >= 0 ? r[idx.email] || '' : '').trim()
    e.phone = (idx.phone >= 0 ? r[idx.phone] || '' : '').trim()
    if (
      e.title &&
      !s.titles.some((t) => t.toLowerCase() === e.title.toLowerCase()) &&
      !titles.some((t) => t.toLowerCase() === e.title.toLowerCase())
    ) {
      titles.push(e.title)
    }
    ;(additions[bid] ||= []).push(e)
    added++
  }

  const branches = s.branches.map((b) =>
    additions[b.id] ? { ...b, roster: [...(b.roster || []), ...additions[b.id]] } : b,
  )
  return { branches, titles, added, unmatched: [...unmatched] }
}

/** K 987-994 */
export function rosterCSV(s: OrgState): unknown[][] {
  const rows: unknown[][] = [
    [
      'Branch',
      'Need Processor',
      'Need LOA',
      'Monthly Units',
      'Processor Name',
      'Processor Allocation',
      'LOA Name',
      'LOA Allocation',
    ],
  ]
  s.branches
    .filter((b) => !b.archived)
    .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()))
    .forEach((b) =>
      rows.push([
        b.name || '',
        b.needProcessor ? 'Yes' : '',
        b.needLO ? 'Yes' : '',
        b.monthlyUnits ?? '',
        b.processorName || '',
        b.procAlloc ?? '',
        b.loaName || '',
        b.loaAlloc ?? '',
      ]),
    )
  return rows
}

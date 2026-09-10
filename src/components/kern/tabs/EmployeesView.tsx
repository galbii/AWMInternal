'use client'

// K 745-804 — everyone across every live branch roster, with per-column
// filters, inline editing, and the CSV template round trip.

import React, { useRef, useState } from 'react'

import {
  applyEmployeeImport,
  downloadCSV,
  employeeTemplateCSV,
  employeesCSV,
  parseCSV,
} from '@/lib/kern/csv'
import type { Branch, Employee } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

interface ColFilters {
  name: string
  title: string
  branch: string
  email: string
  phone: string
}

const EMPTY: ColFilters = { name: '', title: '', branch: '', email: '', phone: '' }

export default function EmployeesView() {
  const { state, update, filter, setFilter, setTab, openBranch, toast } = useKern()
  const [F, setF] = useState<ColFilters>(EMPTY)
  const fileRef = useRef<HTMLInputElement>(null)

  const all: { b: Branch; e: Employee }[] = []
  state.branches
    .filter((b) => !b.archived)
    .forEach((b) => (b.roster || []).forEach((e) => all.push({ b, e })))

  const sortNames = (a: string, b: string): number => a.toLowerCase().localeCompare(b.toLowerCase())
  const titleSet = [...new Set(all.map((x) => x.e.title).filter(Boolean))].sort(sortNames)
  const branchSet = [...new Set(all.map((x) => x.b.name).filter(Boolean))].sort(sortNames)

  const inc = (val: string | undefined, f: string): boolean =>
    !f ||
    String(val || '')
      .toLowerCase()
      .includes(f.toLowerCase())

  let rows = all
  if (filter) {
    rows = rows.filter(({ b, e }) =>
      [e.name, e.title, e.email, e.phone, b.name].join(' ').toLowerCase().includes(filter),
    )
  }
  rows = rows.filter(
    ({ b, e }) =>
      inc(e.name, F.name) &&
      (!F.title || (e.title || '') === F.title) &&
      (!F.branch || (b.name || '') === F.branch) &&
      inc(e.email, F.email) &&
      inc(e.phone, F.phone),
  )
  rows = [...rows].sort((x, y) => sortNames(x.e.name || '', y.e.name || ''))

  const anyF = Boolean(F.name || F.title || F.branch || F.email || F.phone || filter)

  const patchEmp = (bid: string, eid: string, p: Partial<Employee>): void =>
    update((d) => {
      d.branches = d.branches.map((x) =>
        x.id === bid
          ? { ...x, roster: x.roster.map((e) => (e.id === eid ? { ...e, ...p } : e)) }
          : x,
      )
    })

  const removeEmp = (bid: string, eid: string): void =>
    update((d) => {
      d.branches = d.branches.map((x) =>
        x.id === bid ? { ...x, roster: x.roster.filter((e) => e.id !== eid) } : x,
      )
    })

  // K 716-744
  const onImport = async (file: File): Promise<void> => {
    try {
      const res = applyEmployeeImport(state, parseCSV(await file.text()))
      if (!res.added && !res.unmatched.length) {
        toast('That file looks empty', true)
        return
      }
      update((d) => {
        d.branches = res.branches
        d.titles = [...d.titles, ...res.titles]
      })
      let msg = `Imported ${res.added} employee${res.added === 1 ? '' : 's'}`
      if (res.unmatched.length) {
        const n = res.unmatched.length
        msg += ` · skipped ${n} unmatched branch${n === 1 ? '' : 'es'}: ${res.unmatched
          .slice(0, 3)
          .join(', ')}${n > 3 ? '…' : ''}`
      }
      toast(msg, res.added === 0)
    } catch (err) {
      toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search employees…"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
        />
        <div className="grow" />
        <button
          className="ghost"
          onClick={() => {
            downloadCSV(employeeTemplateCSV(state), 'kern-employee-import-template.csv')
            toast('Template downloaded — columns: Branch, Name, Title, Email, Phone')
          }}
        >
          ⬇ Export Template
        </button>
        <button className="primary" onClick={() => fileRef.current?.click()}>
          ⬆ Import Template
        </button>
        <button
          className="ghost"
          onClick={() => {
            downloadCSV(employeesCSV(state), 'kern-employees.csv')
            toast('Exported employees CSV')
          }}
        >
          Export CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImport(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="hint">
        Everyone across all branch rosters —{' '}
        <b>
          showing {rows.length} of {all.length}
        </b>
        . Filter any column with the row under the headers; change a Title from the dropdown; click
        a Branch to open it.
      </div>

      <div className="card">
        <table className="tbl-center emp">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 210 }}>Title</th>
              <th>Branch</th>
              <th>Email</th>
              <th style={{ width: 150 }}>Phone</th>
              <th style={{ width: 60 }} />
            </tr>
            <tr className="filt-row">
              <th>
                <input
                  className="colf"
                  value={F.name}
                  placeholder="Filter name…"
                  onChange={(e) => setF({ ...F, name: e.target.value })}
                />
              </th>
              <th>
                <select
                  className="colf"
                  value={F.title}
                  onChange={(e) => setF({ ...F, title: e.target.value })}
                >
                  <option value="">All</option>
                  {titleSet.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </th>
              <th>
                <select
                  className="colf"
                  value={F.branch}
                  onChange={(e) => setF({ ...F, branch: e.target.value })}
                >
                  <option value="">All</option>
                  {branchSet.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </th>
              <th>
                <input
                  className="colf"
                  value={F.email}
                  placeholder="Filter email…"
                  onChange={(e) => setF({ ...F, email: e.target.value })}
                />
              </th>
              <th>
                <input
                  className="colf"
                  value={F.phone}
                  placeholder="Filter…"
                  onChange={(e) => setF({ ...F, phone: e.target.value })}
                />
              </th>
              <th>
                {anyF && (
                  <button
                    className="sm ghost"
                    title="Clear all filters"
                    onClick={() => {
                      setF(EMPTY)
                      setFilter('')
                    }}
                  >
                    ✕
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={6} className="empty">
                  No employees match these filters.
                </td>
              </tr>
            )}
            {rows.map(({ b, e }) => (
              <tr key={e.id}>
                <td>
                  <input
                    value={e.name}
                    placeholder="Full name"
                    onChange={(ev) => patchEmp(b.id, e.id, { name: ev.target.value })}
                  />
                </td>
                <td>
                  <TitleSelect
                    titles={state.titles}
                    value={e.title}
                    onChange={(v) => patchEmp(b.id, e.id, { title: v })}
                  />
                </td>
                <td>
                  <button
                    className="link"
                    onClick={() => {
                      setTab('branches')
                      openBranch(b.id)
                      window.scrollTo(0, 0)
                    }}
                  >
                    {b.name || '(unnamed)'}
                  </button>
                </td>
                <td>
                  <input
                    value={e.email || ''}
                    placeholder="email@…"
                    onChange={(ev) => patchEmp(b.id, e.id, { email: ev.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={e.phone || ''}
                    onChange={(ev) => patchEmp(b.id, e.id, { phone: ev.target.value })}
                  />
                </td>
                <td className="actions">
                  <button className="sm danger" onClick={() => removeEmp(b.id, e.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * K 679-685 — the title dropdown. A title the list doesn't know (imported, or
 * typed on the branch detail page) is appended so it survives being seen here.
 */
function TitleSelect({
  titles,
  value,
  onChange,
}: {
  titles: string[]
  value: string
  onChange: (v: string) => void
}) {
  const inList = titles.some((t) => t === value)
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">— none —</option>
      {titles.map((t) => (
        <option key={t}>{t}</option>
      ))}
      {value && !inList && <option value={value}>{value}</option>}
    </select>
  )
}

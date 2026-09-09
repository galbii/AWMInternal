'use client'

// K 287-351 — the branch list: sortable, searchable, with open/archive/delete.

import React, { useState } from 'react'

import { newBranch } from '@/lib/kern/normalize'
import { branchArea, branchDivision, branchRegion } from '@/lib/kern/org'
import type { Branch } from '@/lib/kern/types'

import { useKern } from '../KernProvider'
import Toolbar from '../ui/Toolbar'

interface Col {
  key: string
  label: string
  num?: boolean
  get: (b: Branch) => string | number
}

export default function BranchesView() {
  const { state, update, filter, openBranch, toast, confirmDialog } = useKern()
  // K 14 — sort is view state, not part of the document.
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: 'name', dir: 1 })

  const cols: Col[] = [
    { key: 'orgid', label: 'ORGID', num: true, get: (b) => b.orgid },
    { key: 'name', label: 'Branch', get: (b) => b.name },
    { key: 'manager', label: 'Branch Manager', get: (b) => b.manager },
    { key: 'area', label: 'Area', get: (b) => branchArea(state, b)?.name ?? '' },
    { key: 'region', label: 'Region', get: (b) => branchRegion(state, b)?.name ?? '' },
    { key: 'division', label: 'Sub-division', get: (b) => branchDivision(state, b)?.name ?? '' },
    { key: 'roster', label: 'Roster', num: true, get: (b) => (b.roster || []).length },
  ]

  const inactive = state.branches.filter(
    (b) => !b.archived && (b.status || '').toLowerCase() === 'inactive',
  )

  // K 292-295
  const archiveInactive = (): void => {
    if (!inactive.length) {
      toast('No inactive branches to archive', true)
      return
    }
    const n = inactive.length
    confirmDialog(
      'Archive inactive branches?',
      `${n} branch${n > 1 ? 'es' : ''} marked Inactive will move to the Archive tab.`,
      () => {
        update((d) => {
          d.branches = d.branches.map((b) =>
            !b.archived && (b.status || '').toLowerCase() === 'inactive'
              ? { ...b, archived: true }
              : b,
          )
        })
        toast(`Archived ${n} inactive branch${n > 1 ? 'es' : ''}`)
      },
      'Archive',
    )
  }

  let list = state.branches.filter((b) => !b.archived)
  if (filter) {
    list = list.filter((b) =>
      [b.orgid, b.name, b.manager, b.status, b.regionPending]
        .join(' ')
        .toLowerCase()
        .includes(filter),
    )
  }

  // K 306-312
  const sc = cols.find((c) => c.key === sort.key) || cols[1]
  list = [...list].sort((a, b) => {
    if (sc.num) {
      return (
        ((parseFloat(String(sc.get(a))) || 0) - (parseFloat(String(sc.get(b))) || 0)) * sort.dir
      )
    }
    const va = String(sc.get(a) || '').toLowerCase()
    const vb = String(sc.get(b) || '').toLowerCase()
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
  })

  const clickSort = (k: string): void =>
    setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }))

  const open = (id: string): void => {
    openBranch(id)
    window.scrollTo(0, 0)
  }

  const archive = (b: Branch): void => {
    update((d) => {
      d.branches = d.branches.map((x) => (x.id === b.id ? { ...x, archived: true } : x))
    })
    toast('Branch archived')
  }

  const remove = (b: Branch): void =>
    confirmDialog('Delete branch?', `“${b.name || b.orgid}” will be removed.`, () => {
      update((d) => {
        d.branches = d.branches.filter((x) => x.id !== b.id)
      })
    })

  return (
    <>
      <Toolbar
        addLabel="Add branch"
        showSearch
        onAdd={() => {
          const nb = newBranch()
          update((d) => {
            d.branches = [nb, ...d.branches]
          })
          openBranch(nb.id)
        }}
      >
        <button
          className="sm"
          disabled={!inactive.length}
          title="Move all Inactive branches to the Archive tab"
          onClick={archiveInactive}
        >
          Archive inactive{inactive.length ? ` (${inactive.length})` : ''}
        </button>
      </Toolbar>

      <div className="hint">
        Click <b>Open</b> to edit a single branch — placement, managers, serviced-by, and full
        roster. Use <b>Archive</b> to move a branch to the Archive tab.
      </div>

      <div className="card">
        {!list.length ? (
          <div className="empty">No branches match.</div>
        ) : (
          <table className="tbl-center">
            <thead>
              <tr>
                {cols.map((c) => {
                  const on = sort.key === c.key
                  return (
                    <th key={c.key} className="sortable" onClick={() => clickSort(c.key)}>
                      {c.label}
                      <span className={`sort-arrow${on ? ' on' : ''}`}>
                        {on ? (sort.dir > 0 ? '▲' : '▼') : '▲'}
                      </span>
                    </th>
                  )
                })}
                <th style={{ width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td className="muted">{b.orgid || '—'}</td>
                  <td>
                    <button className="link" onClick={() => open(b.id)}>
                      {b.name || '(unnamed)'}
                    </button>
                  </td>
                  <td>{b.manager || '—'}</td>
                  <td className="muted">{branchArea(state, b)?.name || '—'}</td>
                  <td className="muted">{branchRegion(state, b)?.name || '—'}</td>
                  <td className="muted">{branchDivision(state, b)?.name || '—'}</td>
                  <td className="num">{(b.roster || []).length}</td>
                  <td className="actions">
                    <button className="sm" onClick={() => open(b.id)}>
                      Open
                    </button>{' '}
                    <button className="sm" onClick={() => archive(b)}>
                      Archive
                    </button>{' '}
                    <button className="sm danger" onClick={() => remove(b)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

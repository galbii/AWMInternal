'use client'

// K 364-392 — archived branches, with restore and permanent delete.

import React from 'react'

import { branchTagLabel, statusPill } from '@/lib/kern/org'
import type { Branch } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

export default function ArchiveView() {
  const { state, update, toast, confirmDialog } = useKern()
  const archived = state.branches.filter((b) => b.archived)

  const restore = (b: Branch): void => {
    update((d) => {
      d.branches = d.branches.map((x) => (x.id === b.id ? { ...x, archived: false } : x))
    })
    toast('Branch restored')
  }

  const remove = (b: Branch): void =>
    confirmDialog('Delete permanently?', `“${b.name || b.orgid}” will be removed for good.`, () => {
      update((d) => {
        d.branches = d.branches.filter((x) => x.id !== b.id)
      })
    })

  return (
    <>
      <div className="toolbar">
        <div style={{ fontWeight: 600 }}>Archived branches</div>
        <div className="grow" />
      </div>

      <div className="hint">
        Retired or inactive branches live here, out of the active lists. <b>Restore</b> sends one
        back to Branches with its placement intact.
      </div>

      <div className="card">
        {!archived.length ? (
          <div className="empty">
            Nothing archived yet. Use “Archive inactive” or a branch’s Archive button on the
            Branches tab.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>ORGID</th>
                <th>Branch</th>
                <th>Manager</th>
                <th style={{ width: 100 }}>Status</th>
                <th>Last placement</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {archived.map((b) => {
                const pill = statusPill(b.status)
                return (
                  <tr key={b.id}>
                    <td className="muted">{b.orgid || '—'}</td>
                    <td>{b.name || '(unnamed)'}</td>
                    <td className="muted">{b.manager || '—'}</td>
                    <td>
                      <span className={pill.cls}>{pill.label}</span>
                    </td>
                    <td className="muted">{branchTagLabel(state, b) || '—'}</td>
                    <td className="actions">
                      <button className="sm primary" onClick={() => restore(b)}>
                        Restore
                      </button>{' '}
                      <button className="sm danger" onClick={() => remove(b)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

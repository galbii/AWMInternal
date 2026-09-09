'use client'

// K 415-513 — the single-branch editor: info, placement tags, managers,
// serviced-by, and the full roster.

import React from 'react'

import { emp } from '@/lib/kern/normalize'
import { branchArea, branchDivision, branchRegion, byId } from '@/lib/kern/org'
import type { Branch, Employee } from '@/lib/kern/types'

import { useKern } from '../KernProvider'
import ChipsEditor from '../ui/ChipsEditor'
import { EntitySelectField, Field, ManagerField, SelectField } from '../ui/Field'

export default function BranchDetail({ id }: { id: string }) {
  const { state, update, openBranch, toast } = useKern()
  const b = byId(state.branches, id)

  // K 417 — a branch deleted from under us falls back to the list.
  if (!b) {
    openBranch(null)
    return null
  }

  const activeList = state.branches.filter((x) => !x.archived)
  const aIdx = activeList.findIndex((x) => x.id === b.id)
  const area = branchArea(state, b)
  const region = branchRegion(state, b)
  const division = branchDivision(state, b)

  /** Merge a patch into this branch. */
  const patch = (p: Partial<Branch>): void =>
    update((d) => {
      d.branches = d.branches.map((x) => (x.id === b.id ? { ...x, ...p } : x))
    })

  const patchRoster = (eid: string, p: Partial<Employee>): void =>
    update((d) => {
      d.branches = d.branches.map((x) =>
        x.id === b.id
          ? { ...x, roster: x.roster.map((e) => (e.id === eid ? { ...e, ...p } : e)) }
          : x,
      )
    })

  const go = (i: number): void => {
    openBranch(activeList[i].id)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <div className="detail-head">
        <button className="ghost" onClick={() => openBranch(null)}>
          ← Branches
        </button>
        <h2>{b.name || '(unnamed branch)'}</h2>
        <span className="muted">{b.orgid ? `ORGID ${b.orgid}` : ''}</span>
        <div className="grow" />
        <button className="sm" disabled={aIdx <= 0} onClick={() => go(aIdx - 1)}>
          ‹ Prev
        </button>
        <button
          className="sm"
          disabled={aIdx < 0 || aIdx >= activeList.length - 1}
          onClick={() => go(aIdx + 1)}
        >
          Next ›
        </button>
        <button
          className="sm"
          title="Move to Archive"
          onClick={() => {
            patch({ archived: true })
            openBranch(null)
            toast('Branch archived')
          }}
        >
          Archive
        </button>
      </div>

      <div className="detail">
        <div className="section">
          <h3>Branch</h3>
          <div className="grid">
            <Field label="Branch name" value={b.name} onInput={(v) => patch({ name: v })} />
            <Field label="ORGID" value={b.orgid} onInput={(v) => patch({ orgid: v })} />
            <SelectField
              label="Status"
              options={['Active', 'Inactive', 'Pending', '']}
              value={b.status}
              onChange={(v) => patch({ status: v })}
            />
          </div>
        </div>

        <div className="section">
          <h3>Placement</h3>
          <div className="grid">
            <EntitySelectField
              label="Sub-division tag"
              list={state.divisions}
              value={b.divisionId}
              onChange={(v) => patch({ divisionId: v })}
            />
            <EntitySelectField
              label="Region tag"
              list={state.regions}
              value={b.regionId}
              onChange={(v) => patch({ regionId: v })}
            />
            <EntitySelectField
              label="Area tag"
              list={state.areas}
              value={b.areaId}
              onChange={(v) => patch({ areaId: v })}
            />
          </div>
          <div className="hint">
            Area, Region, and Sub-division are independent tags — set any combination. A branch can
            carry just a Sub-division tag, a Region without an Area, or all three.
          </div>
        </div>

        <div className="section">
          <h3>Management</h3>
          <div className="grid">
            <Field
              label="Branch Manager"
              value={b.manager}
              onInput={(v) => patch({ manager: v })}
            />
            <ManagerField
              label="Area Manager"
              manager={area ? area.manager || '' : null}
              disabledHint="assign an Area first"
              onInput={(v) =>
                update((d) => {
                  d.areas = d.areas.map((x) => (x.id === area?.id ? { ...x, manager: v } : x))
                })
              }
            />
            <ManagerField
              label="Regional Manager"
              manager={region ? region.manager || '' : null}
              disabledHint="assign a Region first"
              onInput={(v) =>
                update((d) => {
                  d.regions = d.regions.map((x) => (x.id === region?.id ? { ...x, manager: v } : x))
                })
              }
            />
            <ManagerField
              label="Divisional Manager"
              manager={division ? division.manager || '' : null}
              disabledHint="assign a Division first"
              onInput={(v) =>
                update((d) => {
                  d.divisions = d.divisions.map((x) =>
                    x.id === division?.id ? { ...x, manager: v } : x,
                  )
                })
              }
            />
          </div>
          <div className="hint">
            Area / Regional / Divisional managers apply to the whole area, region, or division —
            editing here updates them everywhere.
          </div>
        </div>

        <div className="section">
          <h3>Serviced by</h3>
          <ChipsEditor
            values={b.servicedBy}
            placeholder="Add name + Enter"
            onChange={(next) => patch({ servicedBy: next })}
          />
        </div>

        <div className="section">
          <h3>
            Roster <span className="flex" />
            <button
              className="sm primary"
              onClick={() => patch({ roster: [...b.roster, emp('', '')] })}
            >
              + Add employee
            </button>
          </h3>
          <div className="card">
            {!b.roster.length ? (
              <div className="empty">No employees yet. Click “+ Add employee”.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ width: 200 }}>Title</th>
                    <th>Email</th>
                    <th style={{ width: 140 }}>Phone</th>
                    <th>Notes</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {b.roster.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <input
                          value={e.name}
                          placeholder="Full name"
                          onChange={(ev) => patchRoster(e.id, { name: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={e.title}
                          list="kernTitlesList"
                          placeholder="Title"
                          onChange={(ev) => patchRoster(e.id, { title: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={e.email}
                          placeholder="email@…"
                          onChange={(ev) => patchRoster(e.id, { email: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={e.phone}
                          onChange={(ev) => patchRoster(e.id, { phone: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={e.notes}
                          onChange={(ev) => patchRoster(e.id, { notes: ev.target.value })}
                        />
                      </td>
                      <td className="actions">
                        <button
                          className="sm danger"
                          onClick={() => patch({ roster: b.roster.filter((x) => x.id !== e.id) })}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

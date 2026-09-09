'use client'

// K 548-571 — areas group branches under a region.

import React from 'react'

import { uid } from '@/lib/kern/normalize'
import { byId } from '@/lib/kern/org'

import { useKern } from '../KernProvider'
import EntitySelect from '../ui/EntitySelect'
import Toolbar from '../ui/Toolbar'

export default function AreasView() {
  const { state, update, filter, confirmDialog } = useKern()

  let list = state.areas
  if (filter) list = list.filter((a) => a.name.toLowerCase().includes(filter))

  return (
    <>
      <Toolbar
        addLabel="Add area"
        showSearch
        onAdd={() =>
          update((d) => {
            d.areas = [
              { id: uid('a'), name: 'New Area', manager: '', regionId: d.regions[0]?.id ?? null },
              ...d.areas,
            ]
          })
        }
      />
      <div className="hint">
        Areas group branches under a Region. The Area Manager applies to every branch in the area.
      </div>

      <div className="card">
        {!list.length ? (
          <div className="empty">No areas yet. Click “+ Add area”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Area Manager</th>
                <th style={{ width: 200 }}>Region (parent)</th>
                <th>Division</th>
                <th style={{ width: 80 }}>Branches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const r = byId(state.regions, a.regionId)
                const div = r ? byId(state.divisions, r.divisionId) : undefined
                const bc = state.branches.filter((b) => b.areaId === a.id).length
                return (
                  <tr key={a.id}>
                    <td>
                      <input
                        value={a.name}
                        onChange={(e) => {
                          const v = e.target.value
                          update((d) => {
                            d.areas = d.areas.map((x) => (x.id === a.id ? { ...x, name: v } : x))
                          })
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={a.manager || ''}
                        onChange={(e) => {
                          const v = e.target.value
                          update((d) => {
                            d.areas = d.areas.map((x) => (x.id === a.id ? { ...x, manager: v } : x))
                          })
                        }}
                      />
                    </td>
                    <td>
                      <EntitySelect
                        list={state.regions}
                        value={a.regionId}
                        placeholder="— Unassigned —"
                        onChange={(id) =>
                          update((d) => {
                            d.areas = d.areas.map((x) =>
                              x.id === a.id ? { ...x, regionId: id } : x,
                            )
                          })
                        }
                      />
                    </td>
                    <td className="muted">{div ? div.name : '—'}</td>
                    <td className="num">{bc}</td>
                    <td className="actions">
                      <button
                        className="sm danger"
                        onClick={() =>
                          confirmDialog(
                            'Delete area?',
                            `Branches in “${a.name}” will move directly under its region.`,
                            () =>
                              update((d) => {
                                // K 569 — reparent, never orphan.
                                d.branches = d.branches.map((b) =>
                                  b.areaId === a.id
                                    ? { ...b, regionId: a.regionId, areaId: null }
                                    : b,
                                )
                                d.areas = d.areas.filter((x) => x.id !== a.id)
                              }),
                          )
                        }
                      >
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

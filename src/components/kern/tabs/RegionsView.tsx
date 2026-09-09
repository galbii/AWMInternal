'use client'

// K 573-596 — regions group areas and branches under a sub-division.

import React from 'react'

import { uid } from '@/lib/kern/normalize'
import { branchCountForRegion } from '@/lib/kern/org'

import { useKern } from '../KernProvider'
import EntitySelect from '../ui/EntitySelect'
import Toolbar from '../ui/Toolbar'

export default function RegionsView() {
  const { state, update, filter, confirmDialog } = useKern()

  let list = state.regions
  if (filter) {
    list = list.filter((r) => `${r.name} ${r.manager || ''}`.toLowerCase().includes(filter))
  }

  return (
    <>
      <Toolbar
        addLabel="Add region"
        showSearch
        onAdd={() =>
          update((d) => {
            d.regions = [
              {
                id: uid('r'),
                name: 'New Region',
                manager: '',
                divisionId: d.divisions[0]?.id ?? null,
              },
              ...d.regions,
            ]
          })
        }
      />
      <div className="hint">
        Regions group Areas and Branches. The Regional Manager applies across the region.
      </div>

      <div className="card">
        {!list.length ? (
          <div className="empty">No regions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Regional Manager</th>
                <th style={{ width: 200 }}>Sub-division (parent)</th>
                <th style={{ width: 70 }}>Areas</th>
                <th style={{ width: 80 }}>Branches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      value={r.name}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.regions = d.regions.map((x) => (x.id === r.id ? { ...x, name: v } : x))
                        })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={r.manager || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.regions = d.regions.map((x) =>
                            x.id === r.id ? { ...x, manager: v } : x,
                          )
                        })
                      }}
                    />
                  </td>
                  <td>
                    <EntitySelect
                      list={state.divisions}
                      value={r.divisionId}
                      placeholder="— Unassigned —"
                      onChange={(id) =>
                        update((d) => {
                          d.regions = d.regions.map((x) =>
                            x.id === r.id ? { ...x, divisionId: id } : x,
                          )
                        })
                      }
                    />
                  </td>
                  <td className="num">{state.areas.filter((a) => a.regionId === r.id).length}</td>
                  <td className="num">{branchCountForRegion(state, r.id)}</td>
                  <td className="actions">
                    <button
                      className="sm danger"
                      onClick={() =>
                        confirmDialog(
                          'Delete region?',
                          `Areas and branches under “${r.name}” will become unassigned.`,
                          () =>
                            update((d) => {
                              d.areas = d.areas.map((a) =>
                                a.regionId === r.id ? { ...a, regionId: null } : a,
                              )
                              d.branches = d.branches.map((b) =>
                                b.regionId === r.id ? { ...b, regionId: null } : b,
                              )
                              d.regions = d.regions.filter((x) => x.id !== r.id)
                            }),
                        )
                      }
                    >
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

'use client'

// K 598-647 — two tables: Divisions (the combined entity, e.g. "Matrix") and
// the Sub-divisions beneath them (Matrix Red / Matrix Blue). Branches, regions
// and areas roll up THROUGH a sub-division, never straight to a division.

import React from 'react'

import { uid } from '@/lib/kern/normalize'
import { branchCountForDivision, branchCountForSuperDivision, subdivisionsOf } from '@/lib/kern/org'

import { useKern } from '../KernProvider'
import EntitySelect from '../ui/EntitySelect'
import Toolbar from '../ui/Toolbar'

export default function DivisionsView() {
  const { state, update, confirmDialog } = useKern()

  return (
    <>
      <Toolbar
        addLabel="Add division"
        onAdd={() =>
          update((d) => {
            d.superDivisions = [
              { id: uid('sd'), name: 'New Division', manager: '' },
              ...d.superDivisions,
            ]
          })
        }
      />
      <div className="hint">
        A <b>Division</b> is the combined entity (e.g. <b>Matrix</b>). It contains{' '}
        <b>Sub-divisions</b> such as Matrix Red and Matrix Blue. Branches, regions and areas roll up
        through the sub-divisions.
      </div>

      <div className="card">
        {!state.superDivisions.length ? (
          <div className="empty">No divisions yet — click “+ Add division”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Division</th>
                <th>Divisional Manager</th>
                <th style={{ width: 100 }}>Sub-divisions</th>
                <th style={{ width: 90 }}>Branches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.superDivisions.map((sd) => (
                <tr key={sd.id}>
                  <td>
                    <input
                      value={sd.name}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.superDivisions = d.superDivisions.map((x) =>
                            x.id === sd.id ? { ...x, name: v } : x,
                          )
                        })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={sd.manager || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.superDivisions = d.superDivisions.map((x) =>
                            x.id === sd.id ? { ...x, manager: v } : x,
                          )
                        })
                      }}
                    />
                  </td>
                  <td className="num">{subdivisionsOf(state, sd.id).length}</td>
                  <td className="num">{branchCountForSuperDivision(state, sd.id)}</td>
                  <td className="actions">
                    <button
                      className="sm danger"
                      onClick={() =>
                        confirmDialog(
                          'Delete division?',
                          'Its sub-divisions will become unassigned to a division (they keep their regions and branches).',
                          () =>
                            update((d) => {
                              d.divisions = d.divisions.map((x) =>
                                x.parentId === sd.id ? { ...x, parentId: null } : x,
                              )
                              d.superDivisions = d.superDivisions.filter((x) => x.id !== sd.id)
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

      <div className="toolbar" style={{ marginTop: 20 }}>
        <button
          className="primary"
          onClick={() =>
            update((d) => {
              d.divisions = [
                {
                  id: uid('d'),
                  name: 'New Sub-division',
                  manager: '',
                  parentId: d.superDivisions[0]?.id ?? null,
                },
                ...d.divisions,
              ]
            })
          }
        >
          + Add subdivision
        </button>
        <div style={{ fontWeight: 600, marginLeft: 6 }}>Sub-divisions</div>
      </div>

      <div className="card">
        {!state.divisions.length ? (
          <div className="empty">No sub-divisions yet — click “+ Add subdivision”.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sub-division</th>
                <th>Manager</th>
                <th style={{ width: 180 }}>Division (parent)</th>
                <th style={{ width: 80 }}>Regions</th>
                <th style={{ width: 90 }}>Branches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.divisions.map((dv) => (
                <tr key={dv.id}>
                  <td>
                    <input
                      value={dv.name}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.divisions = d.divisions.map((x) =>
                            x.id === dv.id ? { ...x, name: v } : x,
                          )
                        })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={dv.manager || ''}
                      onChange={(e) => {
                        const v = e.target.value
                        update((d) => {
                          d.divisions = d.divisions.map((x) =>
                            x.id === dv.id ? { ...x, manager: v } : x,
                          )
                        })
                      }}
                    />
                  </td>
                  <td>
                    <EntitySelect
                      list={state.superDivisions}
                      value={dv.parentId}
                      placeholder="— Unassigned —"
                      onChange={(id) =>
                        update((d) => {
                          d.divisions = d.divisions.map((x) =>
                            x.id === dv.id ? { ...x, parentId: id } : x,
                          )
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    {state.regions.filter((r) => r.divisionId === dv.id).length}
                  </td>
                  <td className="num">{branchCountForDivision(state, dv.id)}</td>
                  <td className="actions">
                    <button
                      className="sm danger"
                      onClick={() =>
                        confirmDialog(
                          'Delete sub-division?',
                          `Regions and branch tags pointing to “${dv.name}” will become unassigned.`,
                          () =>
                            update((d) => {
                              d.regions = d.regions.map((r) =>
                                r.divisionId === dv.id ? { ...r, divisionId: null } : r,
                              )
                              d.branches = d.branches.map((b) =>
                                b.divisionId === dv.id ? { ...b, divisionId: null } : b,
                              )
                              d.divisions = d.divisions.filter((x) => x.id !== dv.id)
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

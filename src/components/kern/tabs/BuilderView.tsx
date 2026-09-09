'use client'

// K 1664-1820 — the drag-and-drop org board.
//
// Four columns: Branches, Areas, Regions, Sub-divisions. Dragging assigns a
// parent; dropping an item back on its OWN column detaches it. Note that the
// three branch tags are independent (K 1685): dropping a branch on an area sets
// only areaId and leaves regionId/divisionId alone, matching the Branch-detail
// editor. The Branches column is the one place all three are cleared at once.

import React, { useState } from 'react'

import { newBranch, uid } from '@/lib/kern/normalize'
import { branchTagLabel, byId } from '@/lib/kern/org'
import type { OrgState } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

type Kind = 'branch' | 'area' | 'region' | 'division'
interface DragPayload {
  kind: Kind
  id: string
}

const MIME = 'application/x-kern-node'

export default function BuilderView() {
  const { state, update, confirmDialog } = useKern()
  const [over, setOver] = useState<string | null>(null)

  const live = state.branches.filter((b) => !b.archived)

  const read = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData(MIME)
      return raw ? (JSON.parse(raw) as DragPayload) : null
    } catch {
      return null
    }
  }

  /** Wire an element as a drop target that accepts certain kinds. */
  const zone = (key: string, accepts: Kind[], apply: (d: DragPayload, s: OrgState) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      // Cannot read dataTransfer during dragover, so accept optimistically and
      // filter on drop — the source did the same via a module-global.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== key) setOver(key)
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setOver(null)
      const d = read(e)
      if (!d || !accepts.includes(d.kind)) return
      update((s) => apply(d, s))
    },
    className: over === key ? 'drop-hover' : '',
  })

  const dragProps = (kind: Kind, id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify({ kind, id }))
      e.dataTransfer.effectAllowed = 'move'
    },
  })

  const mapBranch = (s: OrgState, id: string, p: Partial<OrgState['branches'][number]>): void => {
    s.branches = s.branches.map((b) => (b.id === id ? { ...b, ...p } : b))
  }

  return (
    <>
      <div className="toolbar">
        <div style={{ fontWeight: 600 }}>
          Drag a branch onto any Area, Region, or Sub-division (independent tags) · Areas → Regions
          · Regions → Sub-divisions
        </div>
        <div className="grow" />
      </div>

      <div className="hint">
        Drag the ⠿ handle (or a chip) between columns. Drop a branch back on the Branches column —
        or an area/region back on its own column — to detach it. Use “+ New” to create items.
      </div>

      <div className="board-wrap">
        <div className="board">
          {/* ---- Branches ---- */}
          <Column
            title="Branches"
            count={state.branches.length}
            addLabel="+ New branch"
            onAdd={() =>
              update((s) => {
                s.branches = [newBranch(), ...s.branches]
              })
            }
            zone={zone('col-branches', ['branch'], (d, s) =>
              mapBranch(s, d.id, { areaId: null, regionId: null, divisionId: null }),
            )}
          >
            {live.map((b) => {
              const tag = branchTagLabel(state, b)
              return (
                <div className="item" key={b.id} {...dragProps('branch', b.id)}>
                  <span>{b.name || '(unnamed)'}</span>
                  {tag ? <span className="meta">{tag}</span> : null}
                </div>
              )
            })}
          </Column>

          {/* ---- Areas ---- */}
          <Column
            title="Areas"
            count={state.areas.length}
            addLabel="+ New area"
            onAdd={() =>
              update((s) => {
                s.areas = [
                  { id: uid('a'), name: 'New Area', manager: '', regionId: null },
                  ...s.areas,
                ]
              })
            }
            zone={zone('col-areas', ['area'], (d, s) => {
              s.areas = s.areas.map((a) => (a.id === d.id ? { ...a, regionId: null } : a))
            })}
            emptyHint={!state.areas.length ? 'No areas yet — click “+ New area”.' : undefined}
          >
            {state.areas.map((a) => {
              const r = byId(state.regions, a.regionId)
              const mine = live.filter((b) => b.areaId === a.id)
              return (
                <Card
                  key={a.id}
                  kind="area"
                  id={a.id}
                  name={a.name}
                  parentTag={r ? `▸ ${r.name}` : 'no region'}
                  dragProps={dragProps}
                  onName={(v) =>
                    update((s) => {
                      s.areas = s.areas.map((x) => (x.id === a.id ? { ...x, name: v } : x))
                    })
                  }
                  onDelete={() =>
                    confirmDialog(
                      'Delete area?',
                      'Branches in it will move back to unassigned.',
                      () =>
                        update((s) => {
                          s.branches = s.branches.map((b) =>
                            b.areaId === a.id ? { ...b, areaId: null } : b,
                          )
                          s.areas = s.areas.filter((x) => x.id !== a.id)
                        }),
                    )
                  }
                  zone={zone(`area-${a.id}`, ['branch'], (d, s) =>
                    mapBranch(s, d.id, { areaId: a.id }),
                  )}
                  emptyKids={!mine.length ? 'drop branches here' : undefined}
                >
                  {mine.map((b) => (
                    <Chip
                      key={b.id}
                      kind="branch"
                      id={b.id}
                      label={b.name}
                      dragProps={dragProps}
                      onRemove={() => update((s) => mapBranch(s, b.id, { areaId: null }))}
                    />
                  ))}
                </Card>
              )
            })}
          </Column>

          {/* ---- Regions ---- */}
          <Column
            title="Regions"
            count={state.regions.length}
            addLabel="+ New region"
            onAdd={() =>
              update((s) => {
                s.regions = [
                  { id: uid('r'), name: 'New Region', manager: '', divisionId: null },
                  ...s.regions,
                ]
              })
            }
            zone={zone('col-regions', ['region'], (d, s) => {
              s.regions = s.regions.map((r) => (r.id === d.id ? { ...r, divisionId: null } : r))
            })}
            emptyHint={!state.regions.length ? 'No regions yet — click “+ New region”.' : undefined}
          >
            {state.regions.map((r) => {
              const div = byId(state.divisions, r.divisionId)
              const areas = state.areas.filter((a) => a.regionId === r.id)
              const regionBranches = live.filter((b) => b.regionId === r.id)
              return (
                <Card
                  key={r.id}
                  kind="region"
                  id={r.id}
                  name={r.name}
                  parentTag={div ? `▸ ${div.name}` : 'no division'}
                  dragProps={dragProps}
                  onName={(v) =>
                    update((s) => {
                      s.regions = s.regions.map((x) => (x.id === r.id ? { ...x, name: v } : x))
                    })
                  }
                  onDelete={() =>
                    confirmDialog(
                      'Delete region?',
                      'Its areas and branches will become unassigned.',
                      () =>
                        update((s) => {
                          s.areas = s.areas.map((a) =>
                            a.regionId === r.id ? { ...a, regionId: null } : a,
                          )
                          s.branches = s.branches.map((b) =>
                            b.regionId === r.id ? { ...b, regionId: null } : b,
                          )
                          s.regions = s.regions.filter((x) => x.id !== r.id)
                        }),
                    )
                  }
                  zone={zone(`region-${r.id}`, ['area', 'branch'], (d, s) => {
                    if (d.kind === 'area') {
                      s.areas = s.areas.map((a) => (a.id === d.id ? { ...a, regionId: r.id } : a))
                    } else {
                      mapBranch(s, d.id, { regionId: r.id })
                    }
                  })}
                  emptyKids={
                    !areas.length && !regionBranches.length
                      ? 'drop areas or branches here'
                      : undefined
                  }
                >
                  {areas.map((a) => (
                    <Chip
                      key={a.id}
                      kind="area"
                      id={a.id}
                      label={`▤ ${a.name}`}
                      dragProps={dragProps}
                      onRemove={() =>
                        update((s) => {
                          s.areas = s.areas.map((x) =>
                            x.id === a.id ? { ...x, regionId: null } : x,
                          )
                        })
                      }
                    />
                  ))}
                  {regionBranches.map((b) => (
                    <Chip
                      key={b.id}
                      kind="branch"
                      id={b.id}
                      label={b.name}
                      dragProps={dragProps}
                      onRemove={() => update((s) => mapBranch(s, b.id, { regionId: null }))}
                    />
                  ))}
                </Card>
              )
            })}
          </Column>

          {/* ---- Sub-divisions ---- */}
          <Column
            title="Sub-divisions"
            count={state.divisions.length}
            addLabel="+ New subdivision"
            onAdd={() =>
              update((s) => {
                s.divisions = [
                  {
                    id: uid('d'),
                    name: 'New Sub-division',
                    manager: '',
                    parentId: s.superDivisions[0]?.id ?? null,
                  },
                  ...s.divisions,
                ]
              })
            }
            emptyHint={
              !state.divisions.length ? 'No divisions yet — click “+ New division”.' : undefined
            }
          >
            {state.divisions.map((dv) => {
              const regions = state.regions.filter((r) => r.divisionId === dv.id)
              const divBranches = live.filter((b) => b.divisionId === dv.id)
              return (
                <Card
                  key={dv.id}
                  kind="division"
                  id={dv.id}
                  name={dv.name}
                  dragProps={dragProps}
                  onName={(v) =>
                    update((s) => {
                      s.divisions = s.divisions.map((x) => (x.id === dv.id ? { ...x, name: v } : x))
                    })
                  }
                  onDelete={() =>
                    confirmDialog('Delete division?', 'Its regions will become unassigned.', () =>
                      update((s) => {
                        s.regions = s.regions.map((r) =>
                          r.divisionId === dv.id ? { ...r, divisionId: null } : r,
                        )
                        s.divisions = s.divisions.filter((x) => x.id !== dv.id)
                      }),
                    )
                  }
                  zone={zone(`div-${dv.id}`, ['region', 'branch'], (d, s) => {
                    if (d.kind === 'region') {
                      s.regions = s.regions.map((r) =>
                        r.id === d.id ? { ...r, divisionId: dv.id } : r,
                      )
                    } else {
                      mapBranch(s, d.id, { divisionId: dv.id })
                    }
                  })}
                  emptyKids={
                    !regions.length && !divBranches.length
                      ? 'drop regions or branches here'
                      : undefined
                  }
                >
                  {regions.map((r) => (
                    <Chip
                      key={r.id}
                      kind="region"
                      id={r.id}
                      label={`◈ ${r.name}`}
                      dragProps={dragProps}
                      onRemove={() =>
                        update((s) => {
                          s.regions = s.regions.map((x) =>
                            x.id === r.id ? { ...x, divisionId: null } : x,
                          )
                        })
                      }
                    />
                  ))}
                  {divBranches.map((b) => (
                    <Chip
                      key={b.id}
                      kind="branch"
                      id={b.id}
                      label={b.name}
                      dragProps={dragProps}
                      onRemove={() => update((s) => mapBranch(s, b.id, { divisionId: null }))}
                    />
                  ))}
                </Card>
              )
            })}
          </Column>
        </div>
      </div>
    </>
  )
}

// K 1786-1794
function Column({
  title,
  count,
  addLabel,
  onAdd,
  zone,
  emptyHint,
  children,
}: {
  title: string
  count: number
  addLabel: string
  onAdd: () => void
  zone?: ReturnType<() => { className: string }> & Record<string, unknown>
  emptyHint?: string
  children: React.ReactNode
}) {
  const { className, ...handlers } = (zone ?? { className: '' }) as {
    className: string
  } & Record<string, unknown>
  return (
    <div className="col">
      <div className="col-head">
        <span className="col-title">{title}</span>
        <span className="count">{count}</span>
        <div className="grow" />
        <button className="sm" onClick={onAdd}>
          {addLabel}
        </button>
      </div>
      <div className={`col-body ${className}`} {...handlers}>
        {emptyHint ? <div className="empty-hint">{emptyHint}</div> : null}
        {children}
      </div>
    </div>
  )
}

// K 1796-1813
function Card({
  kind,
  id,
  name,
  parentTag,
  onName,
  onDelete,
  zone,
  dragProps,
  emptyKids,
  children,
}: {
  kind: Kind
  id: string
  name: string
  parentTag?: string | null
  onName: (v: string) => void
  onDelete: () => void
  zone?: { className: string } & Record<string, unknown>
  dragProps: (k: Kind, id: string) => Record<string, unknown>
  emptyKids?: string
  children: React.ReactNode
}) {
  const { className, ...handlers } = (zone ?? { className: '' }) as {
    className: string
  } & Record<string, unknown>
  return (
    <div className={`ocard ${className}`} {...handlers}>
      <div className="ocard-head">
        <span className="grip" {...dragProps(kind, id)}>
          ⠿
        </span>
        <input value={name} onChange={(e) => onName(e.target.value)} />
        <button className="sm danger" onClick={onDelete}>
          ✕
        </button>
      </div>
      {parentTag ? <div className="parent-tag">{parentTag}</div> : null}
      <div className="kids">
        {emptyKids ? <div className="empty-hint">{emptyKids}</div> : null}
        {children}
      </div>
    </div>
  )
}

// K 1814-1820
function Chip({
  kind,
  id,
  label,
  onRemove,
  dragProps,
}: {
  kind: Kind
  id: string
  label: string
  onRemove: () => void
  dragProps: (k: Kind, id: string) => Record<string, unknown>
}) {
  return (
    <div className="chip-sm" {...dragProps(kind, id)}>
      <span>{label}</span>
      <button onClick={onRemove} title="Detach">
        ×
      </button>
    </div>
  )
}

'use client'

// K 1822-1861 — the collapsible org tree, top to bottom:
// Division → Sub-division → Region → Area → Branch, with an "Unassigned"
// bucket for anything that never got tagged.

import React, { useState } from 'react'

import {
  branchCountForDivision,
  branchCountForRegion,
  branchCountForSuperDivision,
  orphanBranches,
  orphanDivisions,
  orphanRegions,
  subdivisionsOf,
} from '@/lib/kern/org'
import type { Branch, Division } from '@/lib/kern/types'

import { useKern } from '../KernProvider'

function Node({
  cls,
  label,
  tag,
  children,
}: {
  cls: string
  label: string
  tag?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const hasKids = Boolean(children)
  return (
    <div className={`node ${cls}`}>
      <div className="row">
        <span className="caret" onClick={() => hasKids && setOpen((o) => !o)}>
          {hasKids && !open ? '▸' : '•'}
        </span>
        <span className="lbl">{label}</span>
        {tag ? <span className="tag">{tag}</span> : null}
      </div>
      {hasKids && open ? <div className="kids">{children}</div> : null}
    </div>
  )
}

const mgr = (m?: string): string => (m ? `mgr ${m} · ` : '')
const branchLabel = (b: Branch): string => `${b.orgid ? `${b.orgid} · ` : ''}${b.name}`

export default function HierarchyView() {
  const { state } = useKern()
  const live = state.branches.filter((b) => !b.archived)

  const subTree = (d: Division): React.ReactNode => (
    <Node
      key={d.id}
      cls="lvl-div"
      label={d.name}
      tag={`${mgr(d.manager)}${branchCountForDivision(state, d.id)} branches`}
    >
      {state.regions
        .filter((r) => r.divisionId === d.id)
        .map((r) => (
          <Node
            key={r.id}
            cls="lvl-reg"
            label={r.name}
            tag={`${mgr(r.manager)}${branchCountForRegion(state, r.id)} branches`}
          >
            {state.areas
              .filter((a) => a.regionId === r.id)
              .map((a) => {
                const abs = live.filter((b) => b.areaId === a.id)
                return (
                  <Node
                    key={a.id}
                    cls="lvl-area"
                    label={a.name}
                    tag={`${mgr(a.manager)}${abs.length} branches`}
                  >
                    {abs.map((b) => (
                      <Node key={b.id} cls="lvl-branch" label={branchLabel(b)} tag={b.status} />
                    ))}
                  </Node>
                )
              })}
            {/* K 1832 — branches on the region directly, with no area. */}
            {live
              .filter((b) => !b.areaId && b.regionId === r.id)
              .map((b) => (
                <Node key={b.id} cls="lvl-branch" label={branchLabel(b)} tag={b.status} />
              ))}
          </Node>
        ))}
      {/* K 1835 — branches tagged only at sub-division level. */}
      {live
        .filter((b) => b.divisionId === d.id && !b.regionId && !b.areaId)
        .map((b) => (
          <Node key={b.id} cls="lvl-branch" label={branchLabel(b)} tag={b.status} />
        ))}
    </Node>
  )

  const oRegions = orphanRegions(state)
  const oBranches = orphanBranches(state)
  const hasAny =
    state.superDivisions.length ||
    orphanDivisions(state).length ||
    oRegions.length ||
    oBranches.length

  return (
    <div className="card" style={{ padding: '14px 12px' }}>
      {!hasAny ? (
        <div className="empty">Nothing to show.</div>
      ) : (
        <div className="tree">
          {state.superDivisions.map((sd) => {
            const subs = subdivisionsOf(state, sd.id)
            return (
              <Node
                key={sd.id}
                cls="lvl-super"
                label={sd.name}
                tag={`${mgr(sd.manager)}${branchCountForSuperDivision(state, sd.id)} branches`}
              >
                {subs.length ? (
                  subs.map(subTree)
                ) : (
                  <div className="empty-hint">no sub-divisions</div>
                )}
              </Node>
            )
          })}

          {/* K 1839 — sub-divisions whose parent division is gone. */}
          {orphanDivisions(state).map(subTree)}

          {(oRegions.length > 0 || oBranches.length > 0) && (
            <Node cls="lvl-div" label="Unassigned">
              {oRegions.map((r) => (
                <Node
                  key={r.id}
                  cls="lvl-reg"
                  label={`${r.name} (no division)`}
                  tag={`${branchCountForRegion(state, r.id)} branches`}
                />
              ))}
              {oBranches.map((b) => (
                <Node
                  key={b.id}
                  cls="lvl-branch"
                  label={`${branchLabel(b)} (no region)`}
                  tag={b.status}
                />
              ))}
            </Node>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

// The app shell: header, tab bar, and the view switch. K 214-226 (renderTabs),
// 264-285 (render / renderBody), 154-166 (the header markup).
//
// `.kern` is this app's style root — every rule in (kern)/kern.css is scoped
// under it so none of it reaches the AppShell chrome rendered above.

import React from 'react'

import type { TabId } from '@/lib/kern/types'

import { useKern } from './KernProvider'
import AreasView from './tabs/AreasView'
import ArchiveView from './tabs/ArchiveView'
import BranchDetail from './tabs/BranchDetail'
import BranchesView from './tabs/BranchesView'
import BuilderView from './tabs/BuilderView'
import CreditView from './tabs/CreditView'
import DataView from './tabs/DataView'
import DivisionsView from './tabs/DivisionsView'
import EmployeesView from './tabs/EmployeesView'
import HierarchyView from './tabs/HierarchyView'
import HighlightView from './tabs/HighlightView'
import AnalysisView from './tabs/AnalysisView'
import MonthlyView from './tabs/MonthlyView'
import RegionsView from './tabs/RegionsView'
import RosterView from './tabs/RosterView'
import TenureView from './tabs/TenureView'
import TitlesView from './tabs/TitlesView'

/** K 209-213 — tab order is the source's. */
const TABS: { id: TabId; label: string }[] = [
  { id: 'branches', label: 'Branches' },
  { id: 'areas', label: 'Areas' },
  { id: 'regions', label: 'Regions' },
  { id: 'divisions', label: 'Divisions' },
  { id: 'titles', label: 'Titles' },
  { id: 'archive', label: 'Archive' },
  { id: 'employees', label: 'Employees' },
  { id: 'roster', label: 'Branch Roster' },
  { id: 'data', label: 'Data' },
  { id: 'credit', label: 'Credit Report Analysis' },
  { id: 'tenure', label: 'Tenure' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'builder', label: 'Org Builder' },
]

/** K 221 — the analytics tabs carry no count badge. */
const NO_COUNT: Partial<Record<TabId, true>> = {
  builder: true,
  hierarchy: true,
  analysis: true,
  highlight: true,
  monthly: true,
  tenure: true,
  credit: true,
}

export default function KernManager() {
  const { state, tab, setTab, openBranchId, dirty } = useKern()

  // K 215-220
  const live = state.branches.filter((b) => !b.archived)
  const counts: Partial<Record<TabId, number>> = {
    branches: live.length,
    areas: state.areas.length,
    regions: state.regions.length,
    divisions: state.superDivisions.length,
    titles: state.titles.length,
    archive: state.branches.filter((b) => b.archived).length,
    employees: live.reduce((n, b) => n + (b.roster || []).length, 0),
    roster: live.length,
    data: Object.keys(state.production || {}).length,
  }

  return (
    <div className="kern">
      <header>
        <h1>Kern Org Manager</h1>
        <span className="sub">Divisions → Regions → Areas → Branches</span>
        <div className="grow" />
        <span className={`status${dirty ? ' dirty' : ''}`}>
          <b>{dirty ? 'Saving…' : 'All changes saved'}</b>
        </span>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === tab ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {!NO_COUNT[t.id] && <span className="count">{counts[t.id] ?? 0}</span>}
          </div>
        ))}
      </nav>

      <main>
        <TabView tab={tab} openBranchId={openBranchId} />
      </main>

      {/* K 146-149 — the shared title autocomplete every roster input uses. */}
      <datalist id="kernTitlesList">
        {state.titles.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}

// K 265-285 — the switch. Branches is the one tab with two modes.
function TabView({ tab, openBranchId }: { tab: TabId; openBranchId: string | null }) {
  switch (tab) {
    case 'branches':
      return openBranchId ? <BranchDetail id={openBranchId} /> : <BranchesView />
    case 'areas':
      return <AreasView />
    case 'regions':
      return <RegionsView />
    case 'divisions':
      return <DivisionsView />
    case 'titles':
      return <TitlesView />
    case 'archive':
      return <ArchiveView />
    case 'employees':
      return <EmployeesView />
    case 'roster':
      return <RosterView />
    case 'data':
      return <DataView />
    case 'credit':
      return <CreditView />
    case 'tenure':
      return <TenureView />
    case 'analysis':
      return <AnalysisView />
    case 'monthly':
      return <MonthlyView />
    case 'highlight':
      return <HighlightView />
    case 'hierarchy':
      return <HierarchyView />
    case 'builder':
      return <BuilderView />
  }
}

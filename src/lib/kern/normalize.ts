// The state migrations, ported verbatim from the source's normalize().
// K 42–109 (`load` + `normalize`).
//
// Every branch of this runs against BOTH the bundled SEED and a JSON export
// imported from an older copy of the app, which is why the one-time passes at
// the bottom stay: an old export predates them.

import { SEED } from '@/lib/kern/data/seed'
import type { Branch, Employee, OrgState, PnlSettings, TyRoster } from '@/lib/kern/types'

let seq = 0
/** K 5 — the source's id format; kept so imported documents stay comparable. */
export const uid = (p: string): string => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** K 40 */
export const emp = (name?: string, title?: string): Employee => ({
  id: uid('e'),
  name: (name || '').trim(),
  title: title || '',
  email: '',
  phone: '',
  notes: '',
})

/** K 108 — the P&L defaults, applied under whatever the document already has. */
export const PNL_DEFAULTS: PnlSettings = {
  procFee: 695,
  loaBps: 10,
  people: 5,
  salary: 5000,
  hiBps: 10,
  loBps: 5,
  procHiPct: 67,
  loaHiPct: 33,
  onTop: true,
  useRoster: true,
  units: '',
  vol: '',
}

/**
 * A fresh deep copy of the seed tree. K 47
 *
 * Returns a PARTIAL document on purpose: the seed's branches carry no
 * `divisionId`/`roster`/`archived`, and there is no production/pnl/mix block.
 * normalize() is what turns this into an OrgState.
 */
export function seedState(): Partial<OrgState> {
  return JSON.parse(JSON.stringify(SEED)) as Partial<OrgState>
}

interface NormalizeDeps {
  /** K 84 — PROD, the initial production numbers. */
  production: OrgState['production']
  /** K 95 — the Ty Kern roster import; omit to skip that pass. */
  tyRoster?: TyRoster
}

/**
 * Fill in every default and run the one-time migrations. Mutates and returns
 * `d`, exactly as the source does.
 */
export function normalize(d: Partial<OrgState>, deps: NormalizeDeps): OrgState {
  // K 50–51
  d.divisions ||= []
  d.regions ||= []
  d.areas ||= []
  d.branches ||= []
  d.titles = Array.isArray(d.titles) && d.titles.length ? d.titles : [...SEED.titles]

  // K 52–56
  d.divisions.forEach((x) => {
    if (x.manager === undefined) x.manager = ''
  })
  d.superDivisions = Array.isArray(d.superDivisions) ? d.superDivisions : []
  d.superDivisions.forEach((s) => {
    if (s.manager === undefined) s.manager = ''
  })
  if (!d.superDivisions.length) {
    const sid = uid('sd')
    d.superDivisions.push({ id: sid, name: 'Matrix', manager: '' })
    d.divisions.forEach((x) => {
      x.parentId = sid
    })
  }
  d.divisions.forEach((x) => {
    if (x.parentId === undefined) x.parentId = d.superDivisions?.[0]?.id ?? null
  })

  // K 57–58
  d.areas.forEach((a) => {
    if (a.manager === undefined) a.manager = ''
  })
  d.regions.forEach((r) => {
    if (r.manager === undefined) r.manager = ''
  })

  // K 59–71 — per-branch defaults, and roster synthesis for pre-roster documents.
  d.branches.forEach((b) => {
    if (b.areaId === undefined) b.areaId = null
    if (b.regionId === undefined) b.regionId = null
    if (b.divisionId === undefined) b.divisionId = null
    b.servicedBy = Array.isArray(b.servicedBy) ? b.servicedBy : []
    if (!Array.isArray(b.roster)) {
      const r: Employee[] = []
      if (b.manager) r.push(emp(b.manager, 'Branch Manager'))
      ;(b.processors || []).forEach((n) => {
        if (n) r.push(emp(n, 'Processor'))
      })
      ;(b.loas || []).forEach((n) => {
        if (n) r.push(emp(n, 'Loan Officer Assistant'))
      })
      b.roster = r
    }
    b.processors ||= []
    b.loas ||= []
    b.archived = !!b.archived
  })

  // K 84–88
  if (!d.production || typeof d.production !== 'object') {
    d.production = JSON.parse(JSON.stringify(deps.production)) as OrgState['production']
  }
  if (!d.prodExcluded || typeof d.prodExcluded !== 'object') d.prodExcluded = {}
  if (!d.productMix || typeof d.productMix !== 'object') d.productMix = {}
  if (!d.pnl || typeof d.pnl !== 'object') d.pnl = { ...PNL_DEFAULTS }
  d.pnl = Object.assign({ ...PNL_DEFAULTS }, d.pnl)

  // K 90–91 — drop junk branches (no name AND no numeric ORGID).
  d.branches = d.branches.filter((b) => {
    const nm = (b.name || '').trim()
    const og = String(b.orgid || '').trim()
    return Boolean(nm) || /^\d+$/.test(og)
  })

  // K 92–94 — one-time division tagging.
  if (!d._divTagsApplied) {
    const redDiv = d.divisions.find((x) => /red/i.test(x.name))
    const blueDiv = d.divisions.find((x) => /blue/i.test(x.name))
    const RED = ['smukalla', 'vanderwegen', 'dennis']
    d.branches.forEach((b) => {
      const key = `${b.manager || ''} ${b.name || ''}`.toLowerCase()
      if (RED.some((n) => key.includes(n))) {
        if (redDiv) b.divisionId = redDiv.id
      } else if (blueDiv) {
        b.divisionId = blueDiv.id
      }
    })
    d._divTagsApplied = true
  }

  // K 95–108 — one-time Ty Kern roster import: adds branches + people,
  // non-destructive, deduped by email then name.
  if (!d._tyRosterImported && deps.tyRoster) {
    const branches = d.branches
    ;(deps.tyRoster.branches || []).forEach((nb) => {
      if (!branches.some((b) => String(b.orgid) === String(nb.orgid))) {
        branches.push({
          id: uid('b'),
          name: nb.name,
          orgid: String(nb.orgid),
          manager: '',
          status: 'Active',
          regionPending: '',
          processors: [],
          loas: [],
          servicedBy: [],
          roster: [],
          areaId: null,
          regionId: null,
          divisionId: null,
          archived: false,
        })
      }
    })
    ;(deps.tyRoster.people || []).forEach((p) => {
      const b = branches.find((x) => String(x.orgid) === String(p.orgid))
      if (!b) return
      b.roster = b.roster || []
      const em = (p.email || '').toLowerCase()
      const nmL = (p.name || '').toLowerCase()
      const dup = b.roster.some(
        (e) =>
          (em && (e.email || '').toLowerCase() === em) ||
          (nmL && (e.name || '').toLowerCase() === nmL),
      )
      if (!dup) {
        b.roster.push({
          id: uid('e'),
          name: p.name,
          title: '',
          email: p.email || '',
          phone: '',
          notes: '',
          mgr: p.mgr || '',
        })
      }
    })
    d._tyRosterImported = true
  }

  return d as OrgState
}

/** A branch record with every default in place. K 1665 */
export function newBranch(): Branch {
  return {
    id: uid('b'),
    orgid: '',
    name: 'New Branch',
    manager: '',
    status: 'Active',
    regionPending: '',
    processors: [],
    loas: [],
    servicedBy: [],
    roster: [],
    areaId: null,
    regionId: null,
    divisionId: null,
    archived: false,
  }
}

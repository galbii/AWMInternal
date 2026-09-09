// Shared types for the Kern Org Manager port.
//
// The state shape is the source app's, unchanged — see the port design spec's
// "Data contract" section and `normalize()` in
// docs/superpowers/specs/kern-org-manager-v1-source/source-3-app.js (K 49–109).

/** Any node in the org tree that carries a manager name. */
export interface OrgNode {
  id: string
  name: string
  manager: string
}

/** The top level. Carries no extra fields — its children are Divisions. */
export type SuperDivision = OrgNode

/** A sub-division. `parentId` points at a SuperDivision. */
export interface Division extends OrgNode {
  parentId: string | null
}

export interface Region extends OrgNode {
  divisionId: string | null
}

export interface Area extends OrgNode {
  regionId: string | null
}

export interface Employee {
  id: string
  name: string
  title: string
  email: string
  phone: string
  notes: string
  /** Reporting manager, set only by the TYROSTER import. */
  mgr?: string
}

export interface Branch {
  id: string
  /** The company's branch number. Joins this branch to every production series. */
  orgid: string
  name: string
  manager: string
  status: string
  regionPending: string
  /** Legacy flat name lists; `roster` supersedes them but both are kept. K 66–74 */
  processors: string[]
  loas: string[]
  servicedBy: string[]
  roster: Employee[]
  /** A branch is tagged at exactly one level; the other two stay null. */
  areaId: string | null
  regionId: string | null
  divisionId: string | null
  archived: boolean

  // ---- Branch Roster tab. Set only there, and absent on a branch that tab
  // has never touched — normalize() does not default them. K 1048-1112
  /** Flagged as needing a processor / loan-officer assistant hire. */
  needProcessor?: boolean
  needLO?: boolean
  /** Hand-entered monthly unit count; falls back to production when blank. */
  monthlyUnits?: number | string
  processorName?: string
  /** Share of that processor allocated to this branch, in percent. */
  procAlloc?: number | string
  loaName?: string
  loaAlloc?: number | string
}

/** `[dollars, units]` — the source stores production as a positional pair. */
export type ProductionPair = [dollars: number, units: number]

/** orgid -> "YYYY-MM" -> [dollars, units] */
export type ProductionMap = Record<string, Record<string, ProductionPair>>

/**
 * Cumulative-to-date arrays indexed by business day: `d` dollars, `u` units.
 *
 * The company-wide series (PROD_DAILY) also carries `bdays` (= d.length) and
 * the month totals `td`/`tu` (= the last cumulative value). The per-branch
 * series (PROD_DAILY_BR) carries only `d`/`u`, which is why the extras are
 * optional. `td`/`tu` are redundant and the source never reads them; they are
 * typed so the generated data module stays assignable.
 */
export interface DailyPoint {
  d: number[]
  u: number[]
  bdays?: number
  td?: number
  tu?: number
}

/** "YYYY-MM" -> cumulative curve for the whole company. */
export type DailySeries = Record<string, DailyPoint>

/** orgid -> "YYYY-MM" -> cumulative curve for that branch. */
export type DailySeriesByBranch = Record<string, Record<string, DailyPoint>>

/** Percentile distribution of "fraction of the month complete at this business day". */
export interface FractionPercentiles {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

/**
 * The company-wide intra-month projection model for the in-progress month.
 *
 * The Monthly tab does NOT project from this directly — it recomputes a
 * run-rate from whichever branches are selected, and uses `gfD`/`gfU` (the
 * historical month-fractions at this business day, one per month of history)
 * as a shrinkage prior so a thin selection borrows the stable company-wide
 * shape. K 1452-1456.
 *
 * Fields the app reads: `month`, `bday`, `factorD`, `factorU`, `confidence`,
 * `gfD`, `gfU`. The rest are carried by the data drop and typed so the
 * generated module stays assignable.
 */
export interface RunRate {
  /** The in-progress month, "YYYY-MM". */
  month: string
  /** Business day reached within it. */
  bday: number
  /** Fraction of a typical month complete by `bday`. */
  fracD: number
  fracU: number
  /** The multiplier that fraction implies (≈ 1 / frac). */
  factorD: number
  factorU: number
  /** Back-tested mean absolute percentage error of that multiplier. */
  mapeD: number
  mapeU: number
  /** Share of back-tested months that landed within ±25%. */
  within25D: number
  lowFracD: number
  highFracD: number
  lowFracU: number
  highFracU: number
  /** Bucketed reliability of the projection at this business day. */
  confidence: string
  /** Months of history behind the model. */
  nMonths: number
  pD: FractionPercentiles
  pU: FractionPercentiles
  /** Historical month-fraction at this business day, one entry per month. */
  gfD: number[]
  gfU: number[]
}

/** Per-branch product mix, in percent. Hand-entered on the Tenure tab. */
export interface ProductMix {
  conv: number
  fha: number
  va: number
  nonqm: number
}

/**
 * The branch P&L model's inputs (Branch Roster tab). Dollar figures are
 * per-month; `*Bps` are basis points of volume; `*HiPct` split a hire's cost
 * between the processor and LOA lines.
 */
export interface PnlSettings {
  procFee: number
  loaBps: number
  people: number
  salary: number
  hiBps: number
  loBps: number
  procHiPct: number
  loaHiPct: number
  onTop: boolean
  useRoster: boolean
  /** Manual overrides for the basis units/volume; '' means "use the roster". */
  units: number | string
  vol: number | string
}

export interface OrgState {
  superDivisions: SuperDivision[]
  divisions: Division[]
  regions: Region[]
  areas: Area[]
  branches: Branch[]
  titles: string[]
  production: ProductionMap
  /** orgid -> true when the branch is excluded from every analytics rollup. */
  prodExcluded: Record<string, boolean>
  productMix: Record<string, ProductMix>
  pnl: PnlSettings
  /** One-time migration flags. K 76–108 — guarded so they run at most once. */
  _divTagsApplied?: boolean
  _tyRosterImported?: boolean
}

/**
 * A branch as it sits in SEED — before normalize() fills in `divisionId`,
 * `servicedBy`, `roster` and `archived`. Do not use this anywhere but the seed
 * module; everything downstream sees a full `Branch`.
 */
export type SeedBranch = Omit<Branch, 'divisionId' | 'servicedBy' | 'roster' | 'archived'>

/**
 * The shape of `SEED` as it sits in the source: the same tree, but before
 * `normalize()` has filled in the production/pnl/mix defaults.
 */
export interface SeedState {
  superDivisions: SuperDivision[]
  divisions: Division[]
  regions: Region[]
  areas: Area[]
  branches: SeedBranch[]
  titles: string[]
}

/** The one-time Ty Kern division roster import. K 95–108 */
export interface TyRoster {
  branches: { orgid: string; name: string }[]
  people: { orgid: string; name: string; email?: string; mgr?: string }[]
}

// ---- Credit Report Analysis -------------------------------------------------

/**
 * A credit line item, as a positional tuple — the source indexes these
 * numerically and never by name.
 */
export type CreditItem = [
  date: string,
  descIdx: number,
  charge: number,
  credit: number,
  opIdx: number,
]

export interface CreditLoan {
  /**
   * Borrower name. STRIPPED from public/kern/credit.json by
   * scripts/kern-extract-data.ts — it is consumer NPI and display-only.
   * The type keeps it optional because the source renders `—` without it.
   */
  b?: string
  op?: number
  i: CreditItem[]
}

export interface CreditData {
  /** Line-item descriptions, referenced by `CreditItem[1]`. */
  descs: string[]
  /** Operator login codes ("surname.first"), referenced by `CreditItem[4]`. */
  ops: string[]
  /** Keyed by branch orgid; the "" key is the unknown bucket. */
  orgs: Record<string, { loans: Record<string, CreditLoan> }>
}

// ---- UI contracts -----------------------------------------------------------

export type TabId =
  | 'branches'
  | 'areas'
  | 'regions'
  | 'divisions'
  | 'titles'
  | 'archive'
  | 'employees'
  | 'roster'
  | 'data'
  | 'credit'
  | 'tenure'
  | 'analysis'
  | 'monthly'
  | 'highlight'
  | 'hierarchy'
  | 'builder'

export type MetricKey = 'dollars' | 'units'
/** K 1289 — the Analysis/Highlight grouping levels, coarsest to finest. */
export type DimensionKey = 'division' | 'subdivision' | 'region' | 'area' | 'branch'

export interface ToastState {
  msg: string
  err?: boolean
}

export interface ConfirmState {
  title: string
  msg: string
  yesLabel?: string
  onYes: () => void
}

/**
 * The contract between KernProvider and every view. Nothing mutates the org
 * document around this API — the same rule OffersApi sets for the offers app.
 */
export interface KernApi {
  state: OrgState
  /** True until the first loadState() resolves. */
  loading: boolean
  /** True when there are edits the debounced persist has not flushed yet. */
  dirty: boolean

  /** Apply a mutation to a draft of the state and persist the result. */
  update(fn: (draft: OrgState) => void): void
  /** Replace the whole document (JSON import, reset-to-seed). */
  replace(next: OrgState): void

  tab: TabId
  setTab(t: TabId): void
  /** Set while the Branches tab shows the detail editor instead of the list. */
  openBranchId: string | null
  openBranch(id: string | null): void
  /** The shared search box, reset on every tab change. K 226 */
  filter: string
  setFilter(v: string): void

  toast(msg: string, err?: boolean): void
  confirmDialog(title: string, msg: string, onYes: () => void, yesLabel?: string): void
}

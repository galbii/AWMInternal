# Kern Org Manager Port — Design Spec

**Date:** 2026-09-09 · **Status:** Approved (in-chat, architectural path)

## What we're building

Port the standalone single-file app **"Kern Org Manager"**
(`kern-org-manager.html`, All Western Mortgage internal ops tool) into this
repo as a **new app in the multi-app suite**, served at `/kern`.

Phase 1 has **no database integration**: the whole org document lives in
`localStorage` behind a seam, exactly as the source stores it. All 16 tabs are
functional. It must pass `bun run typecheck` and `bun run build`.

The app manages a four-level org tree (SuperDivision → Division → Region → Area
→ Branch), branch rosters, and production analytics over that tree.

## Source of truth

The original app is the executable spec. It is committed beside this spec with
the vendored ECharts bundle stripped:

| File | Contents |
|---|---|
| `kern-org-manager-v1-source/source-1-markup-css.html` | `<head>`, full `<style>` (source lines 7–152), all body markup (154–179) |
| `kern-org-manager-v1-source/source-2-data.js` | Embedded datasets: `SEED`, `PROD`, `PROD_ASOF`, `PROD_DAILY`, `PROD_RUNRATE`, `PROD_DAILY_BR`, `PROD_MBDAYS`, `TYROSTER` (source lines 227–233, 235) |
| `kern-org-manager-v1-source/source-2b-credit-schema.md` | Schema of `CREDIT` (source line 234), whose **data is deliberately not committed** — see D2 |
| `kern-org-manager-v1-source/source-3-app.js` | The entire application: 2,097 lines (source 236–2332), including the ~200-line stylesheet it injects at runtime |

Source anatomy, for scale: of the file's 1.5 MB, **1.29 MB is vendored ECharts**
(source lines 180–225) and **~250 KB is embedded data**. The app itself is
~90 KB / 2,097 lines.

**Parity rule:** port logic verbatim — same math, same defaults, same edge-case
behavior — except the Named Deviations below. When behavior is ambiguous, the
source wins. Carry `// K <line>` provenance comments the way `src/lib/offers/*`
carries `// S2` / `// S3`, and keep them accurate when editing.

There is no legal language here (unlike offers), but there is real money math —
the branch P&L model, the intra-month run-rate projection with its MAPE
confidence bands, tenure, and credit-cost aggregation. Those are the parts that
drift silently, and they are the reason for the provenance discipline.

## Feature scope (phase 1)

All 16 tabs, functional:

**Structure editors** — Branches (list + detail editor), Areas, Regions,
Divisions (incl. super-divisions), Titles, Archive, Hierarchy (collapsible
tree), Org Builder (4-column HTML5 drag-and-drop board).

**People** — Employees (filterable roster grid across all branches, CSV
template import/export), Branch Roster (processor/LOA assignment with a live
P&L panel).

**Analytics** (9 ECharts instances) — Data (editable production pivot with
per-branch include/exclude), Credit Report Analysis, Tenure (master–detail +
product-mix pie), Analysis (by division/region/area/branch, top-N), Monthly
(intra-month curve by business day, cumulative/daily, with run-rate projection
and confidence band), Highlight (YoY / QoQ comparison cards).

Plus: JSON export/import (the data-migration path off the old app), CSV exports
(branches, employees, roster, production, credit), reset-to-seed, toast +
confirm dialog.

**Dropped:** the vestigial File System Access API plumbing — see *Named deviations → D1*.

## Architecture

Follows the app-shape CLAUDE.md documents under "Adding an app to the hub", and
mirrors the internal shape of the offers app.

```
src/app/(kern)/
  layout.tsx                 ROOT layout: own <html>/<body>;
                             import '../shell.css' then './kern.css'
  kern.css                   ~350 lines: source <style> + the injected
                             style block, retokenized and scoped
                             (see *CSS isolation*)
  (authed)/
    layout.tsx               const v = await requireApp('kern')
                             return <AppShell appId="kern" viewer={v}>…
    kern/page.tsx            <KernProvider><KernManager /></KernProvider>

src/lib/kern/                framework-free, server-import-safe, unit-tested
  types.ts                   OrgState, SuperDivision, Division, Region, Area,
                             Branch, Employee, ProductionData, KernApi
  storage.ts                 THE SEAM (see *The persistence seam*)
  normalize.ts               load()/normalize() migrations, verbatim
  org.ts                     byId, branchArea/Region/Division, branchHasTag,
                             branchTagLabel, subdivisionsOf, the count helpers
  production.ts              prodGroups, divisionForOrg, groupKeyForOrg,
                             groupMonthly, monthsByQuarter, pctChange,
                             run-rate projection + confidence band
  pnl.ts                     the P&L model lifted out of renderPnl
  tenure.ts                  tenure rows, first-production month, product mix
  credit.ts                  org/operator/loan aggregation + foreign-pull match
  format.ts                  fmtUSD, fmtShort, divColor, esc
  csv.ts                     parseCSV + every CSV export + the employee
                             template round trip
  data/seed.ts               SEED — statically imported (7 KB; it is the
                             starting state, needed on first paint)
  data/production.ts         PROD, PROD_ASOF, PROD_DAILY, PROD_RUNRATE,
                             PROD_DAILY_BR, PROD_MBDAYS — dynamic import()
  data/roster.ts             TYROSTER — dynamic import()
                             (CREDIT is not a module here — see D2)

src/components/kern/         'use client'
  KernProvider.tsx           owns ALL state; implements the KernApi context
  KernManager.tsx            <div className="kern">: header, tab bar, switch
  Chart.tsx                  ECharts wrapper (see *Charts*)
  ui/                        Toolbar, SegToggle, ChipsEditor, Field,
                             PivotTable, ConfirmDialog, Toast
  tabs/                      16 view components
```

Registry entry — the only edit outside the two new directories:

```ts
{ id: 'kern', name: 'Kern Org Manager',
  description: 'Divisions → Regions → Areas → Branches — org structure, rosters, and production analytics.',
  href: '/kern', icon: '🏢', status: 'beta', group: 'Operations',
  roles: ['admin', 'dev'] }
```

`src/middleware.ts` needs no change: its matcher already covers `/kern`.

**Security.** The registry `roles` field is a UX filter. `requireApp('kern')`
gates the routes. Phase 1 ships no route handler; when one arrives it must
resolve `getViewer()` itself and pass `{ user: viewer, overrideAccess: false }`
to Payload, exactly as `/api/offer-records` does.

**Isolation.** Nothing in `src/lib/kern/*` or `src/components/kern/*` may be
imported by another app, and this app imports nothing from `src/lib/offers/*`
or `src/components/offers/*`. Shared chrome comes from
`src/components/shell/`.

## Rendering model

**Provider + React components**, the offers pattern. `KernProvider` owns the
org document and implements a single `KernApi` context (`patch`, `patchMany`,
`toast`, `confirmDialog`, `setTab`, `openBranch`, …). Every component consumes
`useKern()`; nothing mutates state around the API.

Two alternatives were considered and rejected. Mounting the source's
`render()`/`innerHTML` wholesale as an imperative island is fastest and lowest
translation risk, but cannot be typechecked (against the repo's strict-TS,
no-`as any` rule) or unit-tested, and leaves every future change to be made
inside a 2,000-line string-concatenation blob. A hybrid — React for the
structure tabs, islands for the analytics tabs — would put the most valuable
code (P&L, run-rate, tenure) in the untestable half.

Offers reserves the imperative-island technique for exactly one component,
`LetterView`, and only because a contenteditable sheet cannot be re-rendered
while the user types. Kern has no such constraint: its one genuinely imperative
concern, the ECharts canvases, is already isolated behind `mkChart` /
`disposeCharts` in the source and becomes one `<Chart>` component (see *Charts*).

## Named deviations from the source

### D1. The dead File System Access plumbing is dropped

`reconnectHandle()` is defined and never called; the IndexedDB `fileHandle`
store exists only to serve it; `saveToFile()` no longer touches the File System
Access API at all — it just calls `saveLocal()`. `canFS` survives only inside
`loadFromFile`, as a nicety over an `<input type=file>`.

The port keeps JSON download + upload (`exportJson` / `importJson` in
`storage.ts`) and drops `idb()` / `idbSet` / `idbGet` / `reconnectHandle` /
`fileHandle` entirely.

**This matters practically:** the current app's `localStorage['kernOrgApp.v3']`
lives on a different origin and cannot be read by `/kern`. Exporting JSON from
the old app and importing it into the new one is the migration path for real
data, which is why these two functions are in scope for phase 1.

### D2. `CREDIT` is not committed and not bundled — borrower NPI

`CREDIT.orgs[*].loans[*].b` holds **494 real borrower names** ("LAST, FIRST")
keyed to loan numbers and credit-report pulls across 24 branches. That is
consumer NPI. Porting it verbatim would (a) write it into git history
permanently and (b) ship it inside a client JS bundle to every admin/dev who
opens the app.

The name is **display-only**. `renderCredit` reads `b` in exactly one place —
`esc(l.b || '—')`, the label on a collapsed loan row — and never groups, sorts,
filters, aggregates or exports it. Every number the tab computes comes from
`i[2]`, `i[3]` and `i[4]`. The source already renders `—` when `b` is absent.

Therefore:

1. The dataset is **not** a module under `src/lib/kern/data/`. It is
   `public/kern/credit.json`, fetched at runtime by the Credit tab, and
   `/public/kern/credit.json` is added to `.gitignore`. Its schema is committed
   as `source-2b-credit-schema.md`.
2. `scripts/kern-credit.ts` (run once, by hand) reads `CREDIT` out of the
   original HTML, deletes every `loans[*].b`, and writes
   `public/kern/credit.json`. The tab renders identically apart from the
   borrower column showing `—`.
3. The Credit tab shows a clear "dataset not loaded" empty state when the file
   is absent, so a fresh clone builds and runs.
4. When the backend lands, `public/kern/credit.json` becomes a viewer-gated
   route handler. This is the same destination either way; the deviation just
   avoids committing NPI in the meantime.

**This is the one decision flagged for confirmation at spec review.** The
alternative — keep `b` and accept the exposure — is a business call, not a
technical one. If borrower names are genuinely needed on screen, keeping the
file gitignored but unredacted is the middle option.

`PROD*` and `TYROSTER` are internal company data (branch names, ORGIDs,
employee names and emails, production dollars), not consumer NPI, and are
committed as normal modules.

### D3. Vendored ECharts → npm

`bun add echarts`. Never vendored, never server-rendered. No `echarts-gl`: the
Analysis tab's "3D" comment is a label, and the source contains no 3D series.

### D4. CSS retokenized and scoped

Mechanical, and the one place a verbatim copy cannot work — see
*CSS isolation*.

### D5. The active tab syncs to `?tab=<id>`

The source has no routing; refreshing always lands on Branches. The port
mirrors the active tab into the query string so refresh and shared links work.
In-memory sub-state (selected branch, sort, filters) is not URL-synced.

### D6. Charts own their lifecycle

The source keeps a module-global `chartInstances` array and calls
`disposeCharts()` at the top of every `renderBody()`. The port replaces this
with per-component lifecycle (see *Charts*). Behaviorally identical, no global.

## CSS isolation

`kern.css` is the source's `<style>` block (146 lines) plus the ~200-line
stylesheet the app injects at runtime, concatenated, with two mechanical
transforms:

1. **Retokenize.** The source declares `--bg --panel --panel2 --line --ink
   --muted --accent --accent2 --danger --chip --hover` on `:root` with *dark
   neon* values. `shell.css` declares `--bg --panel --line --muted --accent
   --danger` on `:root` with *light navy* values, and is imported first — so
   kern would win and turn the shared session bar's `.btn-primary` neon cyan
   and `.login-error` neon red. Rename kern's to `--k-*` and declare them on
   `.kern` rather than `:root`.

   Offers gets away with duplicating shell's tokens because its values are
   *identical* to shell's. Kern's are not; this is the difference.

2. **Scope element selectors.** `button`, `header`, `body`, `body::before`
   become `.kern button`, `.kern > header`, `.kern`, `.kern::before`.
   `KernManager` renders `<div className="kern">` as its root.
   `SessionBar` renders `div.session-bar`, not `<header>`, so the shared chrome
   is untouched once the bare `button` rule is scoped.

The ~56 inline hex values in the injected block stay as-is: they are chart and
table accents, not theme tokens, and hoisting them buys nothing while the dark
theme is being kept.

**Visual decision (confirmed):** the app keeps its dark neon look. Each app
owning its own root layout is what makes this possible, and the charts, KPI
tiles and pivot tables were all tuned for a dark ground.

## The persistence seam

`src/lib/kern/storage.ts` is the single file that changes when the backend
lands.

```ts
export async function loadState(): Promise<OrgState>
export async function persistState(s: OrgState): Promise<boolean>
export function exportJson(s: OrgState): void
export async function importJson(file: File): Promise<OrgState>
export const LS_KEY = 'kernOrgApp.v3'   // frozen — matches the source
```

Three rules:

- **Async from day one**, even though `localStorage` is synchronous. Offers'
  storage was built sync and had to be retrofitted to async when Payload
  arrived; that rippled through `OffersProvider`. This costs nothing now.
- **Whole-document in, whole-document out.** Kern's state is one document, not
  a list of records, so there is no diffing counterpart to
  `persistRecords`. This deliberately stays non-committal about the eventual
  collection design (single `kern-org` doc vs. a doc per branch).
- **Server-safe.** Every function no-ops with a safe default when
  `typeof window === 'undefined'`, so the module is import-safe during
  SSR/build.

`loadState()` runs the source's `load()` → `normalize()` chain. `normalize` is
ported verbatim, including the two flag-guarded one-time passes
(`_divTagsApplied`, `_tyRosterImported`): they are idempotent, and an imported
JSON export from an older copy of the app still needs them.

`KernProvider` writes through `persistState` on a debounce, mirroring the
source's `touch()` (which saves on every mutation) without a write per
keystroke.

## Charts

`src/components/kern/Chart.tsx`, a client component:

- `await import('echarts')` inside an effect — never at module scope, so it
  stays out of the server graph and out of the initial bundle.
- `echarts.init(el, null, { renderer: 'canvas' })`, `setOption(opt)` on prop
  change.
- One `resize` listener per instance, replacing the source's `resizeHooked`
  global flag.
- `dispose()` in the effect cleanup, replacing `chartInstances` /
  `disposeCharts()`.

Nine instances across Tenure, Analysis, Monthly and Highlight. Chart option
objects are built by pure functions in `src/lib/kern/*` so they can be tested
without a DOM.

## Data contract

Ported unchanged from the source's `normalize()`. Abbreviated:

```ts
interface OrgState {
  superDivisions: { id, name, manager }[]
  divisions:      { id, name, manager, parentId }[]
  regions:        { id, name, manager, divisionId }[]
  areas:          { id, name, manager, regionId }[]
  branches: {
    id, orgid, name, manager, status, regionPending,
    processors: string[], loas: string[], servicedBy: string[],
    roster: { id, name, title, email, phone, notes, mgr? }[],
    areaId, regionId, divisionId, archived
  }[]
  titles: string[]
  production:  Record<orgid, Record<'YYYY-MM', [dollars, units]>>
  prodExcluded: Record<orgid, boolean>
  productMix:   Record<orgid, { conv, fha, va, nonqm }>
  pnl: { procFee, loaBps, people, salary, hiBps, loBps,
         procHiPct, loaHiPct, onTop, useRoster, units, vol }
  _divTagsApplied?: boolean
  _tyRosterImported?: boolean
}
```

`id`s keep the source's `uid(prefix)` format (`b-`, `e-`, `sd-`, …).

## Verification

- `bun run typecheck` — strict, no `as any`.
- `bun run build` — must pass before the work is complete.
- `bun test tests/int/kern/` — unit tests over the pure lib: org helpers and
  counts, production grouping and `groupKeyForOrg`, the P&L model, run-rate
  projection, tenure rows, credit aggregation and foreign-pull matching, CSV
  round trip, and `normalize` (including idempotency of the two one-time
  flags).
- `bun run test:e2e` — extend `tests/e2e/frontend.e2e.spec.ts` with a `/kern`
  smoke: the page loads gated, the tab bar renders 16 tabs, a chart tab mounts
  without throwing.
- Manual: import a JSON export from the live app and confirm every tab renders
  the same numbers as the original HTML file side by side.

## Out of scope (phase 2)

Payload collection + `/api/kern-org` route handler; multi-user concurrency on a
single shared org document; an audit trail equivalent to `offer-events`; a
per-branch deep-link page equivalent to `/offers/[id]`; serving `credit.json`
from a gated route handler.

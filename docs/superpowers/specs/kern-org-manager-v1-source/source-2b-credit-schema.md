# `CREDIT` dataset — schema (data deliberately not committed)

Source line 234 of `kern-org-manager.html` is a ~160 KB `const CREDIT = {…}`
blob. It is **not** committed beside the other datasets because
`orgs[*].loans[*].b` holds **494 real borrower names** keyed to loan numbers and
credit-report pulls — consumer NPI. See *Named deviations → D2* of the port design spec.

This file records its shape so the port can be written against it.

```ts
interface CreditData {
  /** Line-item descriptions, referenced by index. 261 entries. */
  descs: string[]          // e.g. "Credit Report (I-TUC/EXP/EQX)", "Fannie Mae Reissue"
  /** Operator login codes, referenced by index. 28 entries. */
  ops: string[]            // e.g. "lyons.alexa", "morrell.audrey"
  /** Keyed by branch ORGID. 24 entries; the "" key is the unknown bucket. */
  orgs: Record<string, { loans: Record<string, CreditLoan> }>
}

interface CreditLoan {
  /** Borrower name, "LAST, FIRST". DISPLAY-ONLY — see note below. */
  b?: string
  /** Loan-level operator code index into `ops`. Present but unused by the UI. */
  op?: number
  /** Line items. */
  i: CreditItem[]
}

/** Positional tuple — the source indexes these numerically, never by name. */
type CreditItem = [
  date: string,     // it[0]  "MM/DD/YYYY"
  descIdx: number,  // it[1]  index into CREDIT.descs
  charge: number,   // it[2]  dollars, summed into every total
  credit: number,   // it[3]  dollars (refunds), summed into every total
  opIdx: number,    // it[4]  index into CREDIT.ops — drives the operator breakdown
]
```

## What the Credit tab computes (`source-3-app.js`, `renderCredit`)

- Per-org rollup: loan count, line-item count, `Σ charge`, `Σ credit`,
  `net = Σcharge + Σcredit`; org list sorted by charges descending.
- Six KPI tiles over the grand totals, incl. `avg/loan = net / loans`.
- Operator breakdown for the selected org: aggregate by `it[4]`, then match the
  operator code's surname (`code.split('.')[0]`) against branch names to label
  each as this-branch / `foreign` ("not this branch") / `unknown`
  ("unrecognized"). This cross-branch-pull detection is the tab's real purpose.
- Per-loan expandable rows: items sorted by `it[0]` string compare, each showing
  date, `descs[it[1]]`, charge, credit.

## Note on `b` (borrower name)

`b` is read in exactly one place — `'<span class="cr-bor">'+esc(l.b||'—')+'</span>'`
— as a label on the collapsed loan row. It is never grouped, sorted, filtered,
aggregated, or exported. The source already falls back to `—` when it is
missing, so a dataset with `b` stripped renders correctly with no code change.

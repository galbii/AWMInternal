# AWM Internal — AI Agent Guide

An internal **multi-app dashboard** for All Western Mortgage. Signing in lands
on a **hub** at `/` that lists the apps a user may open; each app is a
self-contained Next.js route group.

Built on Payload CMS v3.88 + Next.js 15 App Router + Bun. The Payload CMS
(admin at `/admin`, pages at their slugs, posts, search) still exists
underneath and is untouched by app work.

| Route | What |
|---|---|
| `/` | The hub — app launcher, filtered by the viewer's roles |
| `/offers` | **Offer & New Hire Request Manager** (the first and largest app) |
| `/offers/[id]` | Per-offer letter page + history/assignments sidebar |
| `/login` | Sign in (honours `?next=`) |
| `/admin` | Payload CMS |

The **Offer & New Hire Request Manager** is an HR tool that takes new-hire
requests (42-question comp/equipment/setup form), generates legally-worded
offer letters (PDF / Word / HTML / email), and tracks a Pipeline → Hired →
Archived funnel with analytics. Most of this guide is about that app, because
it is where the hard-won behavior lives — but it is now **one app among
several**, and nothing in `src/lib/offers/` or `src/components/offers/` may be
imported by another app.

## The one rule that outranks everything: PARITY

This app is a **port** of a standalone HTML app. The original's application
code is committed at `docs/superpowers/specs/offer-manager-v1.6-source/`
(3 files: markup+CSS, form/storage logic, letter/pipeline logic). Letter
language, compensation math, defaults, and edge-case behavior were ported
**character-for-character** and verified by differential testing.

- Never "improve" letter wording, comp math, or defaults without an explicit
  request — the letters carry legal language (sign-on repayment, guarantee
  terms). When behavior is ambiguous, the source files win.
- Most `src/lib/offers/*` functions carry `// S2 <line>` / `// S3 <line>`
  comments mapping back to the source. Keep them accurate when editing.
- Design spec + port history: `docs/superpowers/specs/2026-09-03-offer-manager-port-design.md`
  and `docs/superpowers/plans/2026-09-03-offer-manager-port.md`.

## Architecture

```
src/app/(hub)/            → the hub at "/" + /login (own root layout;
                            shell.css + hub.css)
src/app/(offers)/         → the Offer Manager at "/offers" and "/offers/[id]"
                            (own root layout; shell.css THEN offers.css +
                            letter.css — plain global CSS, verbatim from the
                            source app; NOT Tailwind, NOT CSS modules)
src/app/(frontend)/       → CMS site (slugs, posts, search) — template code
src/app/(payload)/        → /admin — generated Payload UI
src/app/shell.css         → SHARED chrome CSS: tokens, reset, session bar,
                            emulation frame, app switcher, login, buttons,
                            modals. Imported by every app's root layout.
src/lib/apps/             → registry.ts (THE app list) + guard.ts (requireApp)
src/components/shell/     → chrome shared by all apps: AppShell, AppSwitcher,
                            SessionBar, LoginForm, Modal, user modals
src/lib/offers/           → offers logic, framework-free, unit-tested
src/components/offers/    → offers UI ('use client'), consumes lib via OffersApi
```

**Each app owns a route group with its OWN root layout** (its own `<html>`),
which is what keeps one app's global CSS from leaking into another's. The
tradeoff is deliberate: crossing between apps is a full page load, which is
fine for a launcher. Shared chrome is delivered as a **component**
(`<AppShell>`), never as a shared layout.

## Adding an app to the hub

Two steps. Nothing else in the repo needs to change.

**1. Create the route group** — copy the shape of `src/app/(hub)/`:

```
src/app/(myapp)/
  layout.tsx              ← ROOT layout: own <html>/<body>,
                            import '../shell.css' then './myapp.css'
  myapp.css               ← this app's styles ONLY; prefix your classes
  (authed)/
    layout.tsx            ← const v = await requireApp('myapp')
                            return <AppShell appId="myapp" viewer={v}>{children}</AppShell>
    myapp/page.tsx        ← serves /myapp
```

**2. Add one entry to `APPS` in `src/lib/apps/registry.ts`:**

```ts
{ id: 'myapp', name: 'My App', description: '…', href: '/myapp',
  icon: '🧾', status: 'live', group: 'Operations', roles: ['admin','dev'] }
```

The hub renders it automatically, filtered by `roles` (omit `roles` for "any
signed-in user"). Use `status: 'planned'` to show a dimmed "Coming soon" card
before the routes exist.

Rules for a new app:

- **The registry `roles` field is a UX filter, not a security boundary.** It
  decides what a user *sees*. `requireApp()` gates the routes, and every route
  handler must still resolve `getViewer()` itself and pass
  `{ user: viewer, overrideAccess: false }` to Payload — exactly as
  `/api/offer-records` does.
- **Never import across apps.** `src/lib/offers/*` and
  `src/components/offers/*` belong to the offers app. Anything genuinely shared
  moves to `src/lib/apps/`, `src/lib/auth/`, or `src/components/shell/` first.
- **Pick your own styling stack.** Because each app has its own root layout, a
  new app can use Tailwind (already configured for `(frontend)`) even though
  offers uses plain global CSS. Just don't add global element selectors to
  `shell.css`.
- **Payload collections** for a new app get their own `admin.group` so `/admin`
  stays navigable.
- Write route handlers under `src/app/api/` and keep the collection's
  `endpoints: false` if the app should be the only door, as offers does.

### `src/lib/offers/` — pure logic (no React, server-import-safe)

| Module | Owns |
|---|---|
| `types.ts` | Frozen contracts: `OfferRecord`, `LetterConfig`, `OffersApi`, `FieldDef` |
| `schema.ts` | The 68 field definitions (42 questions, groups A–F), validation, xlsx headers |
| `format.ts` | Money/date/address/esc utilities |
| `calc.ts` | Base-wage conversion, guarantee math, bonus sentence builders |
| `letter.ts` | Letter language constants + HTML generation (`resolveLetter`, `generateLetterHTML`) |
| `letter-exports.ts` | Word `.doc` + shareable HTML packet + Outlook email helpers |
| `logo.ts` | Base64 logo data-URI (embedded in exports so files work offline) |
| `spreadsheet.ts` | xlsx/CSV import+export, template workbook, backup/restore (dynamic `import('xlsx')`) |
| `pdf.ts` | Letter → paginated PDF via jspdf+html2canvas (client-only, dynamic imports) |
| `zip.ts` | Hand-rolled STORE zip writer (mass-export bundles) |
| `intake.ts` | Intake code/link encode/decode |
| `storage.ts` | **THE persistence seam** — see below |

### `src/components/offers/` — UI

`OffersProvider` owns all state and implements the `OffersApi` context
(records, currentId, view/sub navigation, toasts, confirm dialogs, autosave
flush, intake polling). Every component consumes `useOffers()`; **nothing
mutates records around the API**. `OfferManager` is the shell (header, tabs,
view switching). Views: `RequestForm`+`fields/*`+`RecordList` (editor),
`StageTable`×3 + `BulkToolbar` (pipeline/hired/archived), `AnalysisView`,
`LetterView` (contenteditable letter sheet — an imperative island rendered
once via `dangerouslySetInnerHTML`; never re-render it while the user types).

## Data & persistence

**Records live in Payload (Mongo/Atlas) in the `offer-requests` collection**
behind ONE route handler, `/api/offer-records` (the collection sets
`endpoints: false`, so Payload's generated REST for it is closed). The frozen
record shape (unchanged):

```ts
{ id, data: Record<fieldId, string>, status: 'complete'|'draft',
  stage?: 'pipeline'|'hired'|'archived', created, updated,
  letter?, letterHtml?, letterStale? }
```

- The client's `r…` `uid()` is the literal Mongo `_id` (custom text id field).
- `data` is an untyped `json` field ON PURPOSE — `src/lib/offers/schema.ts`
  stays the single source of truth; adding a question needs NO Payload change.
- The seam is still `loadRecords()`/`persistRecords(all)` in
  `src/lib/offers/storage.ts`, now async: it diffs against a client-side
  snapshot and POSTs only `{upsert, reorder, remove}`. `pos` preserves the
  frozen "array order = display order" behavior. Deletes are computed ONLY
  from this client's own snapshot — never treat "absent from a posted list"
  as a delete server-side.
- `toOfferRecord`/`toOfferDoc` (`src/lib/offers/payload-doc.ts`) must stay a
  byte-stable round trip (tested) — LetterView's `letterSig` compares JSON.
- Still localStorage (frozen keys): `onhr_email_client` (read in sync click
  handlers before `window.open` — cannot go async), `onhr_imported_sids`,
  `onhr_inbox` (written by the external intake page; the 2.5s poller drains
  it). `onhr_records_v121` is read once to migrate old data up to the server.

**Auth & dashboard:** every app is login-gated by its own `(authed)` layout
calling `requireApp('<id>')` (`src/lib/apps/guard.ts`), which redirects to
`/login?next=…` when there is no session and to `/` when the actor lacks the
app's registry roles. `/login` posts to Payload's `/api/users/login` and
honours a same-origin `?next=`. `users.roles` =
`dev | admin | user`; the FIRST user ever created gets all roles (bootstrap
hook). `admin` and `dev` carry IDENTICAL permissions (view-as, user
management); `user` is everyone else. `src/lib/auth/viewer.ts` resolves
`{ actor, viewer }` — an admin/dev can
"view as" another user via the `awm-emulate` cookie; emulation is READ-ONLY
(write routes reject it) and all reads run
`{ user: viewer, overrideAccess: false }` so real access control applies.

**Passkeys (WebAuthn):** sign-in accepts a passkey as well as a password.
Credentials live in the `passkeys` collection; the flows run through
`/api/passkey/*` on top of `@simplewebauthn/server`. Three things to know
before touching this:

- **Origin binding.** `env.PASSKEY` (from `APP_ORIGIN`) supplies the rpID and
  the accepted origins. The rpID is the FIRST origin's bare hostname —
  changing it invalidates every enrolled passkey, permanently. Never
  "tidy up" that env var on a live deployment.
- **Sessions.** `payload.login()` needs a password, so it cannot be used here.
  `src/lib/passkeys/session.ts` mints the session by hand:
  append a session to `user.sessions` → `getFieldsToSign({…, sid})` →
  `jwtSign` → `generatePayloadCookie`. `auth.useSessions` defaults to TRUE in
  Payload 3.88, so a JWT whose `sid` has no matching session record is
  rejected — the session row and the token must be written together.
- **Emulation.** Every passkey WRITE rejects while `isEmulating`. An admin
  viewing-as must never be able to enrol a credential on someone else's
  account — that would be a permanent backdoor, not a read-only peek.

Registration is discoverable (`residentKey: 'required'`), which is what makes
usernameless sign-in and the autofill path work. The login page starts a
conditional-UI ceremony on mount so saved passkeys appear inside the email
field's own autofill menu; that is why the email input carries
`autocomplete="username webauthn"`. Removing that attribute silently kills
the feature without breaking anything visible.

**`src/middleware.ts` exists for exactly one reason:** it stamps the request
path onto `x-awm-pathname` so `requireApp()`/`requireSession()` — which run in
(authed) LAYOUTS, and layouts get no `params` — can build
`/login?next=<the real path>`. Without it every gated deep link collapsed to a
hardcoded fallback (`/offers/<id>` signed-out sent you to `/offers`). It does
NOT authenticate: auth needs Payload and a database, far too heavy for
middleware. Keep the `api/` exclusion in its matcher — route handlers answer
401/403 rather than redirecting.

**Profiles (`/u/<username>`):** every user has a `username` handle on the
`users` collection, and `/u/<handle>` is their profile + settings page (in the
`(hub)` group, so it is available from every app). `/u/me` resolves to your
own. The session bar's "Settings" opens `SettingsModal` (shared chrome:
preferences like the theme, plus a link to the profile page); identity and
passkeys stay on `/u/<handle>` because they need real URLs and server checks.

**Theme (light/dark/system):** the preference is the `awm-theme` cookie
(`src/lib/theme.ts` owns the contract). Every app's ROOT layout reads it via
`cookies()` and stamps `data-theme` on `<html>` — 'system' stamps nothing and
`prefers-color-scheme` decides in CSS. The dark ramp lives in NEW token names
(`--awm-*` themed surfaces in `hub.css`, `--sh-*`/`--md-*` chrome tokens in
`shell.css`). Never flip a token the frozen `offers.css` re-declares
(`--navy`, `--line`, …): offers/kern app CONTENT stays light on purpose
(parity + printed letters); only the shared chrome (modals) follows the theme
inside those apps.

- **`src/lib/users/profile.ts` is a security boundary.** `users.read` is
  `selfOrAdminOrDev`, so a normal user cannot read a colleague's document at
  all. The directory profile reads with `overrideAccess: true` and then returns
  an explicitly-built projection. **Never spread the Payload doc** in that
  file — the whitelist is what keeps `hash`, `salt`, `sessions` and
  `emulationBlocked` from ever leaving the server. A field added to `users`
  later is private by default, which is the point.
- `email` is not public: it is included only for the owner and admin/dev.
- **Passkeys are self-service only** (`canManagePasskeys = isSelf`). An admin
  editing someone else's profile can change their name and roles but must
  never enrol a credential on that account — that is a permanent backdoor,
  not an administrative action.
- Nobody can edit their own roles, and every edit path is disabled while
  emulating.
- `username` is deliberately **not** `unique: true` in Payload: a unique Mongo
  index counts every pre-existing doc's missing value as `null` and collides on
  the second one, so the index would fail to build on an existing database.
  The `ensureUsername` beforeChange hook owns normalization and uniqueness on
  every write instead. Like `bootstrapFirstUser`, its probe deliberately does
  not pass `req` (Mongo refuses a read inside the create's transaction).
- Existing accounts predate the field: `bun run backfill:usernames`
  (`--dry-run` to preview) fills them in. It is idempotent and talks to Mongo
  directly — importing `@payload-config` in a plain script pulls in Lexical,
  which fails to initialise outside Next's bundler.

**Brand & sign-in design:** `public/brand/awm-logo.png` is the logo of record.
`--awm-blue` (`#00629f`) in `(hub)/hub.css` is sampled from that artwork, not
approximated — the mark, the horizon curve and the primary button are the same
blue on purpose. The `(hub)` group sets Public Sans via `next/font`; the
offers app deliberately keeps its verbatim port CSS and system font stack.
The sign-in page's horizon SVG is the logo's own swoosh redrawn full-bleed.

**History & assignments:** every change to an offer is audited into
`offer-events` by `afterChange` hooks on `offer-requests` — field edits and
letter churn are COALESCED into a rolling 10-min window per actor (never one
event per autosave); assignment/stage events are atomic. Versions are OFF on
purpose (no actor, snapshot-per-autosave, letterHtml bloat). `/offers/[id]`
is the per-offer page: LetterView + a client-fetched sidebar
(`/api/offer-timeline`) — the sidebar must NEVER trigger a server re-render
of the letter island.

## Commands

| Command | Use |
|---|---|
| `bun dev` | Dev server → http://localhost:3000 (app) / /admin (CMS) |
| `bun run build` | Production build. MUST PASS before work is complete. Needs a reachable `DATABASE_URL`. |
| `bun run typecheck` | `tsc --noEmit` — lint does NOT typecheck |
| `bun test tests/int/offers/` | The app's unit tests (schema/calc/letter/io/roundtrip) |
| `bun run test:e2e` | Playwright smoke of the hub at `/` + the offers app at `/offers` |
| `bun run generate:types` | After Payload schema changes only |

Bun only — npm/pnpm/yarn desync `bun.lock`. `xlsx` is pinned to the SheetJS
CDN tarball (npm's is stale + vulnerable) — don't "upgrade" it to npm.

## Common tasks

**Add/change a form question:** edit `src/lib/offers/schema.ts` (FieldDef —
`col` header powers xlsx import/export; `req` powers validation), then check
whether the letter should react to it (`letter.ts` rows / `calc.ts`
builders). Update `tests/int/offers/` counts (FIELDS length, required-count).

**Change letter language:** `letter.ts` constants (`LB`, `PATH`, `CLOSING`,
expect-bullets) or the row builders in `calc.ts`. This is the legal-language
zone — get explicit sign-off, and update `letter.int.spec.ts`.

**Add a signatory:** `SIGNATORY` map in `letter.ts` (key + name + title) —
flows to options panel, bulk-assign, and `swapSigInHtml` automatically.

**Styling:** the app's look lives in `src/app/(offers)/offers.css` +
`letter.css` — plain CSS, verbatim class names from the source (generated
letter HTML references them as strings). Don't Tailwind-ify; don't rename
classes. `letter.css` includes `@media print` rules the PDF/print path
depends on. (Tailwind + `@/utilities/ui` `cn()` still apply to CMS-side code.)

## Gotchas

- **`/` shadows any CMS Page with slug `home`** — the hub owns the root. CMS
  pages live at their other slugs.
- **`/offers` is the Offer Manager now, not `/`.** Anything that hardcoded the
  root as "the app" is wrong. Check `OfferDetail`'s back-link and the e2e spec
  when touching routing.
- **`shell.css` deliberately duplicates the tokens, reset, buttons and modal
  rules that also live in the frozen top half of `offers.css`.** That copy is
  intentional: `offers.css` lines 1–197 are verbatim port CSS and must not be
  edited, but the hub needs the same primitives. Change both or neither.
- LetterView's hand-edit invalidation: editing any form field sets
  `letterStale`; the letter rebuilds (discarding hand edits, with a toast)
  only when the letter subview is opened. Don't trigger resolve/regen from
  anywhere else.
- `RequestForm` autosaves on a 600ms debounce; record switches flush through
  `registerPendingFlush` — preserve that path if touching navigation.
- Bulk operations must batch: use `patchRecords` (single persist), never
  `patchRecord` in a loop.
- `applyImport` is pure and must stay pure (returns new arrays; the provider
  merges against `recordsRef.current` to avoid racing the intake poller).
- Letter/PDF/spreadsheet functions are client-only at call time; lib modules
  must stay import-safe on the server (dynamic imports inside functions,
  `typeof window` guards in storage.ts).
- Exported Word/HTML letters must embed the logo as a data URI (`logo.ts`) —
  a URL path breaks once the file leaves the browser.
- Strict TS, no `as any`. No `process.env` outside `src/lib/env.ts`.

## CMS / template layer (unchanged from the Payload starter)

Env flows through `.env.local` → `src/lib/env.ts` (import `env`, never read
`process.env`; use `||` not `??` for optional vars). `DATABASE_URL` must
include the db name. Payload rules: pass `overrideAccess: false` with `user`;
pass `req` to nested Local API calls in hooks; guard hook loops with
`context` flags. Local storage vs R2 via `STORAGE_MODE`. `NEXT_PUBLIC_*` vars
are baked at build time (Dockerfile needs matching ARG+ENV). Full details:
`.env.example` and `README.md`.

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
| `/apply` | **Public** new-hire request form (no sign-in) → creates a pipeline record via `/api/apply` |
| `/users` | **Users app** (admin/dev): the account directory — create, roles, view-as block, delete |
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
                            letter.css — plain global CSS, restyled 2026-09 to
                            the hub's AWM design language with FROZEN class
                            names; NOT Tailwind, NOT CSS modules)
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

The hub renders it automatically. Omit `roles` and the app is
**membership-managed**: admins/devs always open it, everyone else needs its id
on their `users.apps` list (granted inside the app's own Users view, in
`/users`, or on a profile). Set `roles` and it is **role-gated** instead (the
Users app) — membership can never grant it. Use `status: 'planned'` to show a
dimmed "Coming soon" card before the routes exist.

Rules for a new app:

- **The registry is a UX filter, not a security boundary.** `canUseApp()`
  decides what a user *sees* and what `requireApp()` lets through; every route
  handler must still resolve `getViewer()` itself and pass
  `{ user: viewer, overrideAccess: false }` to Payload — exactly as
  `/api/offer-records` does.
- **Give a membership-managed app a Users view — behind `isManager`.** Render
  the shared `<AppMembers appId="myapp" />` (`src/components/shell/AppMembers.tsx`,
  fed by `/api/app-members`) somewhere in its navigation, as offers (sidebar
  entry) and kern (last tab) do, so the people who can open the app are managed
  from inside it. **Gate the nav entry AND the view on
  `useViewer().isManager`** (2026-09-25): the roster is user management, so a
  plain user must not see it — `/api/app-members` refuses them outright, GET
  included. Where the active view lives in the URL (kern's `?tab=`), fall the
  view back rather than trusting the hidden entry. Its styles are the `.am-*`
  block in `shell.css`; an app with its own palette re-maps the `--sh-*` tokens
  under its scope (see `kern.css`).
- **`useViewer()` is how a CLIENT component asks who is signed in**
  (`src/components/shell/ViewerProvider.tsx`). `<AppShell>` provides it, so
  every app gets it without drilling a prop through its own provider.
  `isManager` = admin/dev AND not emulating, matching `SessionBar`'s
  `adminTools` and `/api/app-members`' `canManage`, so view-as shows the
  target's UI. Outside a provider it defaults to a plain user — deny by
  default. Like the registry it is a UX filter, never the boundary.
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
| `summary.ts` | The `/offers/[id]` header facts + completion chip + `relativeTime` |
| `applicant.ts` | Applicant identity (key on email, else name) + snapshot for the `applicants` collection |
| `activity.ts` | The audit feed contract: `toActivityEvent`, the kind filters, shared by both feed routes |
| `storage.ts` | **THE persistence seam** — see below |

### `src/components/offers/` — UI

`OffersProvider` owns all state and implements the `OffersApi` context
(records, currentId, view/sub navigation, toasts, confirm dialogs, autosave
flush, intake polling). Every component consumes `useOffers()`; **nothing
mutates records around the API**. `OfferManager` is the shell: since 2026-09 a
LEFT SIDEBAR (`header.app` masthead + `nav.tabbar` vertical list — class names
kept for the e2e suite and print rules) with Pipeline / Hired / Archived / All /
Analysis (+ Editor while a request is open), and a corner **action hub**
(`ActionHub`, the `.ah-*` disc bottom-right) holding New Request plus the
import/export/backup actions that used to be the header toolbar. Views:
`RequestForm`+`fields/*`+`RecordList` (editor), `StageTable`×4 + `BulkToolbar`
(pipeline/hired/archived, plus `stage="all"` — every record with a Stage
column, row moves following each row's own stage), `AnalysisView`,
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
- Still localStorage (frozen keys): `onhr_imported_sids`, `onhr_inbox`
  (written by the external intake page; the 2.5s poller drains it).
  `onhr_records_v121` is read once to migrate old data up to the server.
  (`onhr_email_client` is GONE — it remembered Desktop Outlook vs Outlook Web,
  and the app sends the mail itself now. See **Emailing an offer**.)

**Auth & dashboard:** every app is login-gated by its own `(authed)` layout
calling `requireApp('<id>')` (`src/lib/apps/guard.ts`), which redirects to
`/login?next=…` when there is no session and to `/` when the actor lacks the
app's registry roles. `/login` posts to Payload's `/api/users/login` and
honours a same-origin `?next=`. `users.roles` =
`dev | admin | user`; the FIRST user ever created gets all roles (bootstrap
hook). `admin` and `dev` carry IDENTICAL permissions (view-as, user
management, and they open EVERY app); `user` is everyone else, and a user
opens only the membership-managed apps on `users.apps` (a `hasMany` select
whose options come from the registry, admin-only field access). Every write
to that list goes through `withApps()` (`src/lib/apps/membership.ts`, tested)
so it stays de-duplicated, in registry order and free of unknown ids — the
in-app Users view (`/api/app-members`), the directory (`/api/directory`) and
the profile (`/api/profile`) all do. Accounts that predate the field have NO
list and see an empty hub: `bun run backfill:apps` (`--dry-run`, `--apps
offers,kern`) gives them one, Mongo-direct like the other backfills.
`src/lib/auth/viewer.ts` resolves
`{ actor, viewer }` — an admin/dev can
"view as" another user via the `awm-emulate` cookie; emulation is READ-ONLY
(write routes reject it) and all reads run
`{ user: viewer, overrideAccess: false }` so real access control applies.
While emulating there is NO second banner: the session bar itself switches
mode (amber strip, the emulated user's avatar, "Viewing as …", an inline
"Exit view-as" pill) and a thin fixed `.emu-frame` outlines the window.

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

**Email (Resend):** ONE door — `sendEmail()` in `src/lib/email/send.ts`. It
goes through `payload.sendEmail`, because Resend is configured once as
Payload's email adapter in `payload.config.ts`, so the same credentials cover
admin password resets and anything an app sends, and a provider swap stays a
one-line adapter change. It never throws (a failed notification must not fail
the request that triggered it) and never pretends: with `RESEND_API_KEY` unset
there is no adapter at all, Payload logs the message to the console, and the
result is `{ ok: false, skipped: true }`. `src/lib/env.ts` treats a leftover
placeholder (`noreply@yourdomain.com`, `<-- FILL IN`) as UNSET — a key *with* a
placeholder from-address fails the boot instead of 403-ing on the first real
send. `RESEND_OVERRIDE_TO` redirects every outbound email to one inbox
(the adapter's `overrideRecipientAddress`) — set it anywhere that must never
mail a real applicant. Two ways to verify: `bun run email:test <address>`
(terminal; hits api.resend.com directly, because a plain script can't import
`@payload-config`) and `POST /api/email/test` (admin/dev, no emulation; the
real app path). Sending from an unverified domain is the usual failure —
Resend only accepts `onboarding@resend.dev` until you verify one, and only
delivers it to the account owner.

**`src/middleware.ts` exists for exactly one reason:** it stamps the request
path onto `x-awm-pathname` so `requireApp()`/`requireSession()` — which run in
(authed) LAYOUTS, and layouts get no `params` — can build
`/login?next=<the real path>`. Without it every gated deep link collapsed to a
hardcoded fallback (`/offers/<id>` signed-out sent you to `/offers`). It does
NOT authenticate: auth needs Payload and a database, far too heavy for
middleware. Keep the `api/` exclusion in its matcher — route handlers answer
401/403 rather than redirecting.

**Session bar look & fold (2026-09-21):** the bar is BRAND BLUE with white
type (`.session-bar` in shell.css) so it separates from the white sidebar and
the dark cards alike; emulation turns the whole bar amber-brown. A chevron at
its far right folds it into a 12px strip with a restore tab; the choice is the
`awm-bar` cookie (`src/lib/bar.ts`), read in `AppShell` so the fold survives
reloads without a jump. The offers activity rail (`OfferSidebar`) folds too, to
a vertical tab, via `onhr_activity_rail` in localStorage and a
`.od-body:has(.od-side-closed)` grid rule, so `OfferDetail` stays unaware.

**Users app (`/users`):** the admin directory, built exactly like any other
hub app (`src/app/(users)/`, registry entry with `roles: ['admin','dev']`,
`requireApp('users')`). Its root layout imports `(hub)/hub.css` for the tokens
and role chips plus its own `users.css`. The list is read with
`overrideAccess: true` and projected through `src/lib/users/directory.ts` —
an ADMIN projection (includes email and `emulationBlocked`), never to be
reused for anything a regular user can reach. Writes go through
`/api/directory` (PATCH roles / emulationBlocked, DELETE), which re-checks
admin/dev, refuses emulation, and never lets you change your own roles or
delete yourself. Creating accounts still uses Payload's `/api/users` via
`NewUserModal`, now opened from this page (the account menu links here as
"Manage users").

**Profiles (`/u/<username>`):** every user has a `username` handle on the
`users` collection, and `/u/<handle>` is their profile + settings page (in the
`(hub)` group, so it is available from every app). `/u/me` resolves to your
own. The session bar (2026-09: one 46px line — `◈ Apps / <app name ⌄>` on the
left, where the app's name is the switcher, and an avatar **account menu** on
the right; both are `ShellMenu` popovers, `.shm-*` in shell.css) holds
Settings, Profile, Sign out and, for admin/dev, View-as + New user. "Settings"
opens `SettingsModal` (shared chrome: preferences like the theme, plus a link to
the profile page); identity and passkeys stay on `/u/<handle>` because they
need real URLs and server checks.

**Theme (light/dark/system):** the preference is the `awm-theme` cookie
(`src/lib/theme.ts` owns the contract). Every app's ROOT layout reads it via
`cookies()` and stamps `data-theme` on `<html>` — 'system' stamps nothing and
`prefers-color-scheme` decides in CSS. The dark ramp lives in `--awm-*` tokens
(`hub.css`, and since the 2026-09 offers redesign the same ramp in
`offers.css`) plus the `--sh-*`/`--md-*` chrome tokens in `shell.css`. Offers
CONTENT follows the theme; the LETTER SHEET does not — it is white paper in
both themes, and `offers.css` re-pins light tokens under `@media print` so a
dark session still prints ink on paper. Kern content stays on its own
`.kern`-scoped tokens.

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
blue on purpose. The `(hub)` and `(offers)` groups both set Public Sans (plus
Source Serif for one display accent) via `next/font`; the letter sheet keeps
its own Calibri stack because the document's typography is part of the port.
The sign-in page's horizon SVG is the logo's own swoosh redrawn full-bleed.

**Assignments in the list views:** the stage tables carry an "Assigned"
column (avatar stack) fed by `/api/offer-assignments` through
`AssignmentsProvider` — a context BESIDE the frozen `OfferRecord`, never a
field on it, so records still round-trip byte-for-byte. Admin/dev click the
stack (or the selection bar's Assign) to open `AssignPopover`; edits POST
`{ ids, add, remove }` and the route re-derives each offer's array from its
CURRENT rows via the pure `applyAssignmentEdit` (`src/lib/offers/assignments.ts`,
tested) so roles survive. "Assigned to me" filters on the VIEWER's id. Roles are
still set per offer on `/offers/[id]`.

**The public request form (`/apply`):** lives in `(offers)` but OUTSIDE its
`(authed)` segment, so anyone with the link can open it. It renders the same
`FORM_SECTIONS` through the shared `FieldBlock` (extracted from `RequestForm` —
keep the two in step) minus the `pay-wording` card, and POSTs to `/api/apply`,
which whitelists fields against `schema.ts`, requires the same required fields,
honours an optional shared `APPLY_ACCESS_CODE` (env, constant-time compare),
drops honeypot hits silently, and creates a COMPLETE pipeline record at the top
of the list with `overrideAccess: true` (there is no user to evaluate). The
submitter's name/email travel in `context.apply`, which `recordOfferEvents`
writes into the "Created" event. Submissions appear in the Offer Manager on its
next load — there is no live push.

Its LAYOUT (2026-09-26) is two columns, not HR's stack: a sticky left RAIL
(`.apply-rail`) carries the identity of the request — a live "who is joining"
card (`.apply-who`, initials + `position · branchName`, `aria-hidden` because it
mirrors typed fields), the `person` section and the About-you block — while the
right column carries role/pay/equipment/systems. `RAIL_SECTIONS` in
`ApplyForm.tsx` is the whole split; the headline is passed in from the server
page as a `hero` prop so it can be its own grid cell (`grid-template-areas`),
which is what puts it FIRST in the one-column fallback below 1080px instead of
after everything in the rail. Two things the rail must keep: `.apply-rail > *
{flex:0 0 auto}` (flex children shrink and `.grp` clips — without it the last
questions of a card are swallowed rather than scrolled to) and a styled
`::-webkit-scrollbar` (macOS overlay scrollbars would hide the only hint that
the rail has more below it). The send bar's meter counts the schema's required
fields PLUS the About-you answers, so its denominator is not `missingRequired`'s.

**The `/offers/[id]` workspace (2026-09 layout):** a STICKY SUMMARY BAR on
top (`.od-bar`: back link, avatar + the name in the serif, position · branch,
stage + completion chips, the stage actions and the two sub-tabs — the
BASICS, which is all it shows by default; a "Details" toggle unfolds a WHO
row — the applicant's email/phone/NMLS/address, chips linking their other
offers, and the assigned stack — and a WHAT row — the letter's key terms;
the fold is remembered per browser under `onhr_detail_header`), the letter
or form beside a sticky
ACTIVITY RAIL on the right (`.od-side`: the Recent activity feed and nothing
else), and the letter's actions as a STICKY FOOTER (`.od-foot`, the one piece
of dark chrome). Things to know:

- `useOfferTimeline` (`detail/useOfferTimeline.ts`) is the page's ONE fetch of
  `/api/offer-timeline`; the bar (applicant, assignments) and the rail (events)
  are fed from it, and it refetches itself a few seconds after the record
  changes. Nothing fetched sits above the letter island.
- The WHAT row is `offerFacts(rec, resolveLetter(rec))`
  (`src/lib/offers/summary.ts`, tested) — it reads the SAME resolved config
  the letter is built from, so it can never disagree with the sheet. Keep it
  that way; don't hand-derive terms in the component.
- The assigned stack is a button; it opens a light `.od-pop` popover hosting
  the existing `AssignmentsEditor` (roles are still edited per offer here).
  Contact facts come from the LIVE record, so they follow edits on the details
  tab instantly; the `applicants` row only adds the other-offers chips.
- The footer's controls are NOT rendered by `OfferDetail`. Their handlers
  need LetterView's refs, so LetterView takes `actionsSlotId` and PORTALS its
  action bar (`.la-bar`, same button ids as the SPA's `.letter-actions`
  column) into the footer slot. The SPA editor still renders the column.
- `OfferDetail` measures the bar and footer into `--od-bar-h` / `--od-foot-h`
  (and `--od-top`, the session bar above) so the letter pane fills exactly
  what the chrome leaves and the rails (`.od-side`, the form's `.rf-nav`)
  stick below the bar. The activity rail is the SAME on both tabs and stays
  on the right down to 1100px (it also folds to a 44px tab); below the full
  width budget the LETTER gives, never the rail — through two independent
  knobs: the letter's LEFT columns (section rail, options width, stacking)
  follow VIEWPORT breakpoints and never move when the rail folds, while the
  sheet PREVIEW scales with `zoom` by the room the preview really has
  (`.letter-preview-area` is a size container, `@container od-preview`), so
  folding the rail just grows the sheet. Screen only: print never sees the
  zoom, and `@media print` switches the containment off so the sheet's
  absolute positioning still resolves against the page. Every export stays
  a true 8.5in.

**Emailing an offer (2026-09-25):** pressing ✉ Email — on the letter's action
bar or an address in a stage table — opens `SendLetterModal`, and the app sends
the message itself. It replaced the port's `emailViaOutlook` (S3 511–552): a
`mailto:` deeplink to desktop Outlook or the OWA compose URL, chosen with a
remembered picker. That flow left the app, attached the PDF by hand, and left
no trace on the record.

- The modal is owned by `OffersProvider` and opened through
  `api.composeEmail(id)`, so the letter view and both tables use ONE composer.
  It holds To/Cc, the subject and note (still `offerEmailSubject` /
  `offerEmailBody` — the source's wording, which did not change when the
  transport did), and an "attach the letter as a PDF" tick.
- The PDF is built IN THE BROWSER (`letterToPdfBytes`, html2canvas) and posted
  as base64 — there is no server-side renderer. `src/lib/email/send.ts` takes
  attachment `content` as base64 because that is what Resend's API wants and
  the adapter passes strings through untouched.
- `/api/offer-email` is the door: it re-reads the offer as the VIEWER with
  `overrideAccess: false` (the body's `id` is a lookup key, never a grant),
  re-runs the SAME pure checks the modal ran (`src/lib/offers/email.ts`,
  tested), refuses emulation, and sets `replyTo` to the actor — mail leaves the
  shared RESEND_FROM_ADDRESS, so replies must come back to whoever sent it.
- A successful send writes an `offer-events` row of kind `email-sent`
  ("Emailed"), which the activity rail and the Analysis feed show under the
  Letters filter. The audit is best-effort: it can never turn a sent email into
  a failed one.
- Sends fail while `RESEND_FROM_ADDRESS` is the `onboarding@resend.dev`
  sandbox — Resend only delivers those to the account owner. Resend's own
  wording is surfaced verbatim in the modal.

**Applicants:** `applicants` is one row per PERSON across all their offers,
related to `offer-requests` both ways (`offer-requests.applicant` relationship
+ an `applicants.offers` join). Nobody types these in: the `linkApplicant`
beforeChange hook (`src/collections/OfferRequests/hooks/linkApplicant.ts`)
keys the person on the form's email, else name (`src/lib/offers/applicant.ts`,
tested), mirrors group A onto the row from the latest saved offer, and points
`applicant` at it — only on writes that carry `data` (never assignment/reorder
updates), best-effort like the audit hook. `notes` is the one hand-written
field. `toOfferDoc` never writes `applicant` (tested), so the client blob can't
clobber the link. The workspace header shows the LIVE record's contact fields
and, once linked, chips for the person's other offers (via `/api/offer-timeline`).
Offers saved before the collection existed link on their next save, or all at
once with `bun run backfill:applicants` (`--dry-run`; Mongo-direct, like the
usernames backfill). `applicants` keeps REST open (the admin picker and join
table read through it), gated by the usual access rules.

**Recent activity, everywhere:** the same audit feed appears twice — the
per-offer rail on `/offers/[id]` (`/api/offer-timeline`) and, across every
request, on the Analysis view (`RecentActivity` → `/api/offer-activity`, a
kind filter + `before` cursor paging). Both routes map documents through
`toActivityEvent` (`src/lib/offers/activity.ts`, tested) and both render
through `ActivityFeed`, so the two feeds cannot drift. The Analysis feed
loads when the view opens and refetches a few seconds after the record
list changes, like the rail.

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

**Motion:** every animation across the dashboard sits inside a
`@media (prefers-reduced-motion:no-preference)` block, so reduced-motion
users get the same UI instantly; keep it that way. Durations stay under
~350ms on the sidebar's easing `cubic-bezier(.22,.68,.35,1)`. `shell.css`
holds the shared keyframes (`sh-rise`, `sh-fade`) and the press feel of the
shared buttons; each app's sheet has its own MOTION block (offers: view rise
+ staggered rows + the sub-tab underline slide + the `/offers/[id]` rail
fold, Details reveal and popover; kern: `<main key={tab}>` so the tab
content rises per switch; users: rows + menu; hub: profile sections).
The Details fold on `/offers/[id]` is a `grid-template-rows: 0fr → 1fr`
reveal whose inner box stops clipping once open (allow-discrete overflow)
so the assigned popover can hang below the bar.

**Styling:** the app's look lives in `src/app/(offers)/offers.css` +
`letter.css` — plain CSS, restyled (2026-09) to the hub's `--awm-*` token
language, themed light/dark. CLASS NAMES are still frozen: generated
letter/table HTML and the e2e suite reference them as strings. Don't
Tailwind-ify; don't rename classes. `letter.css` is two halves: chrome (may
be restyled) above the `.letter-sheet` marker, and the FROZEN letter document
+ `@media print` rules below it — the PDF/print path depends on those exact
metrics. (Tailwind + `@/utilities/ui` `cn()` still apply to CMS-side code.)

## Gotchas

- **`/` shadows any CMS Page with slug `home`** — the hub owns the root. CMS
  pages live at their other slugs.
- **`/offers` is the Offer Manager now, not `/`.** Anything that hardcoded the
  root as "the app" is wrong. Check `OfferDetail`'s back-link and the e2e spec
  when touching routing.
- **`shell.css` and `offers.css` both declare a button base and `.btn-*`
  rules on purpose** — shell for the modals every app shares, offers (loaded
  after) restyling them for its own chrome. The offers modal rules are GONE:
  the shared themed `.modal` in shell.css is the only copy now. `offers.css`
  also aliases the ported token names (`--navy`, `--line`, …) onto the
  `--awm-*` ramp so inline styles and letter.css chrome stay themed.
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

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
| `/hiring` | **New Hire Requests** — hiring managers' door onto the SAME app; letters are stamped SAMPLE until pushed to HR |
| `/offers` | **Offer Letters** — HR's door: issue final letters, run the pipeline |
| `/offers/[id]`, `/hiring/[id]` | Per-offer letter page + history/assignments sidebar (one component, two doors) |
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
| `letter-fit.ts` | **THE ONE-PAGE FIT** — the ladder, `fitCss`, `chooseFit`; shared by PDF, print, packet |
| `logo.ts` | Base64 logo data-URI (embedded in exports so files work offline) |
| `spreadsheet.ts` | xlsx/CSV import+export, template workbook, backup/restore (dynamic `import('xlsx')`) |
| `pdf.ts` | Letter → one-page (else paginated) PDF via jspdf+html2canvas (client-only, dynamic imports) |
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

## Two doors, one app (2026-09-29)

`hiring` and `offers` are the SAME application served at two paths over one
`offer-requests` collection. They render the same components and the same
stylesheets on purpose. What differs is one capability, and it is decided by
**app membership, never by a role and never by the URL**:

- **`src/lib/offers/official.ts` is the one place that answers "who may issue a
  final letter".** It carries the access matrix. `mayIssueFinal(user)` =
  admin/dev, or `users.apps` includes `offers`. `letterIsOfficial(pushedToHr,
  mayIssue)` needs BOTH halves — so HR opening a request nobody pushed still
  sees SAMPLE, because it has not been through the process.
- **No new `Role` was added and none should be.** `users.roles` stays
  `dev | admin | user`, a suite-wide axis; "HR" is one app's vocabulary.
  Membership already has four tested write paths through `withApps()`
  (`/api/app-members`, `/api/directory`, `/api/profile`, the directory UI).
  **All four are admin/dev only**, as is `users.apps`' own field access — so
  granting HR membership is an admin action, and an HR person who is only
  `user` + apps:['offers'] cannot add anyone or even open the roster
  (`/api/app-members` refuses them on GET too).
- **Route-derived capability is the trap.** "You are in /hiring, so you are
  stamped" is bypassed by typing the other URL. The rule travels with the
  person instead.
- **`resolveLetter(rec, official)` is THE watermark chokepoint.** Every path
  that puts the letter in front of a human resolves its config there — screen,
  print, PDF, Word, packet, emailed attachment. The old `wm: WatermarkOpt |
  null` argument was a SECOND source of truth and three paths contradicted the
  record with it (Word passed `null`, the packet had no parameter at all and
  shipped the RECIPIENT a toggle, the bulk toolbar used its own checkbox).
  Those parameters are gone: `LetterRenderOpts { official?, stamp? }` can only
  ever ADD a stamp. **Do not reintroduce a per-path watermark argument** — a
  new export path must get the rule for free.
- **The watermark is a GUARDRAIL, not a security boundary.** The PDF is
  rendered in the browser (`pdf.ts`), so there is no server-side renderer to
  enforce it. It stops mistakes and shortcuts, not devtools.
- **Push to HR** is the handoff: `pushedToHr`/`pushedAt`/`pushedBy` on
  `offer-requests`, owned by `/api/offer-push` and kept BESIDE the frozen
  `OfferRecord` exactly like `assignments` — `toOfferDoc()` never writes them,
  so the byte-stable round trip is untouched. Individual (row menu + the
  workspace bar) and batch (the selection bar). Pushing is anyone's; RETURNING
  is HR's alone, because it un-issues a letter. Both write `offer-events`
  (`pushed-to-hr` / `returned-to-hiring`, the "HR handoff" activity filter).
- `PushProvider` (`usePush()`) carries the state client-side and defaults
  `isOfficial` to FALSE outside a provider — a tree that cannot prove a letter
  went through HR must treat it as a draft.
- **`useAppBase()` builds every in-app link.** Five call sites used to hardcode
  `/offers`, which would send a hiring manager into HR's app to be bounced by
  `requireApp`. Never hardcode an app path in `src/components/offers/`.
- **Keep the two apps from forking.** "Both are exactly the same" is true today
  and will be asked to stop being true. When it does, the divergence goes in
  the route group's COMPOSITION, not in a capability conditional inside a
  shared component.

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
`{ actor, viewer, isEmulating, isActing }` — an admin/dev can
"view as" another user via the `awm-emulate` cookie, and all reads run
`{ user: viewer, overrideAccess: false }` so real access control applies.

**View-as has TWO MODES (2026-09-29).** The cookie carries `<id>` to VIEW and
`<id>|act` to ACT; anything else degrades to view, so every pre-existing cookie
stays read-only. The pure rules live in `src/lib/auth/emulation.ts` (tested;
split out of `viewer.ts` precisely because that file imports `@payload-config`
and cannot be unit-tested) and are re-exported from `viewer.ts`, so callers keep
one import.

- **`view` stays read-only, and that is load-bearing.** The offers UI WRITES
  WHILE YOU BROWSE — `LetterView`'s regen effect persists `letterHtml` the
  moment the Offer Letter tab opens, and `RequestForm` autosaves on 600ms. If
  every emulated session were write-capable, merely INSPECTING someone's record
  would rewrite it. Do not "simplify" this into one mode.
- **`act` writes AS THE VIEWER.** `writeUser(v)` returns the emulated user, so
  their real limits apply — writing as the admin would silently succeed at
  things the target cannot do, which is worse than refusing. Routes pass
  `writeContext(v)` into `req.context`.
- **Two tiers, via `blockEmulatedWrite(v, tier)`.** `'acting-ok'` =
  offer-records, offer-assignments, offer-timeline, offer-push. `'never'` =
  roles/apps/roster/directory/profile/passkeys (attribution laundering; a
  passkey enrolled while acting is a permanent backdoor) AND anything that
  leaves the building (offer email, test mail). `canWrite(v)` is the predicate
  for GET paths that report `canAssign`/`canPush`.
- **Acting is STRICTLY DOWNWARD** — never as an admin or dev (`mayActAs`),
  re-checked on every request, so a cookie minted before the target was
  promoted stops granting writes immediately. 15-minute expiry against an hour
  for viewing.
- **DUAL ATTRIBUTION.** `offer-events.actor` is ALWAYS the real human;
  `actingAs` names whose seat it was, and the feed reads "Chance (as Dana)".
  Recording only the emulated identity would FORGE the trail. The rolling
  coalescing window keys on both, so an admin's own edits never merge with
  edits they made in someone else's seat.
- Every mode change lands in the append-only `emulation-events` collection —
  entering view-as used to leave no trace at all.
- The chrome is a different colour on purpose: amber for viewing, **crimson**
  for acting (`.session-bar.acting`, `.emu-frame-act`).
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

**Session bar look & auto-hide (2026-09-29):** the bar is BRAND BLUE with
white type (`.session-bar` in shell.css) so it separates from the white sidebar
and the dark cards alike; emulation turns the whole bar amber-brown. It GETS
OUT OF THE WAY on its own — the fold chevron, its restore tab and the `awm-bar`
cookie (`src/lib/bar.ts`) are gone:

- `position:sticky;top:0;z-index:70`, slid up by a **transform** (`.sb-away`)
  once the window scrolls past it. Transform, not height — the bar keeps its
  46px of flow space at the document's top, so nothing below it reflows and
  `OfferDetail`'s `--od-top` (`root.offsetTop`) stays 46. It comes back at the
  top of the page, or when the pointer reaches the top edge.
- The peek zone has hysteresis: 6px while the bar is away (it must not pop open
  on a drift) and 56px while it is out (the pointer can rest on it).
  `SessionBar` listens on `pointermove`/`scroll` behind one rAF and re-renders
  only when the state actually flips.
- **The two exceptions are CSS, so the component never learns a menu is open:**
  `.sb-away:has(.shm.open)` (a panel hangs BELOW the bar — the pointer has to
  reach it) and `.sb-away:has(:focus-visible)`. NOT `:focus-within` — clicking
  the view-as pill leaves focus on it, which would pin the bar out for the rest
  of the session; `:focus-visible` keeps it only for the keyboard.
- Sticky needs the bar to be a direct child of `<body>` (it is — `AppShell`
  returns a fragment) and no `overflow` on an ancestor. Wrapping it in a div
  caps it to that div and it scrolls away instead.
- **While emulating, hiding the bar is safe because `.emu-frame` does not
  hide**: the fixed 3px amber outline is what marks the window read-only, and
  it takes no height. Don't make the frame conditional on the bar.

Both rails on `/offers/[id]` REST COLLAPSED and unfold on hover (see that
section), via `onhr_activity_rail` / `onhr_letter_rail` in localStorage and
`:has()` grid rules, so `OfferDetail` stays unaware of either.

**"View as" and switching (2026-09-29):** the roster picker is
`src/components/shell/ViewAsList.tsx` — the CONTENTS of a `ShellMenu` panel,
never a popover of its own (nesting two would double the outside-click, blur
and Escape handling). Its host is **one `.sb-viewas` pill in the bar,
immediately left of the account cluster** — never a row inside the account
menu, because it is a mode switch, not an account setting. It reads "View as"
on the blue bar and "Switch" on the amber one, where picking someone else is
one click instead of exit → reload → reopen → pick.

- **No new server door.** `POST /api/emulate` just overwrites the cookie and
  authorizes off the real ACTOR, whose role `getViewer()` re-checks on every
  request. Each pick is a full page load: identity is server-rendered.
- **It is gated on `canManage`, deliberately NOT on `adminTools`**
  (`canManage && !isEmulating`). The rest of the admin block stays hidden while
  emulating so the session still looks like the target's own UI — but the
  emulation chrome has always been actor-only, exactly like the Exit pill, and
  `requireApp` already gates app access on the actor for the same reason. Don't
  "fix" the inconsistency by relaxing `adminTools`.
- The person being viewed as stays IN the list, marked `now` and disabled;
  `AppShell` passes `viewerId` for it. Recents are
  `src/lib/users/view-as-recent.ts` (localStorage, tested, import-safe on the
  server) and are PRUNED against the roster, so a deleted or view-as-blocked
  account falls out on its own. They are a hint, never a permission.
- The panel is the bar's tallest, which is why `.shm-panel` is capped to the
  window and why `.sb-away:has(.shm.open)` exists (see the auto-hide above).
- The second door is the Users app's row menu ("View as <name>"), which lands
  on `/` — that admin screen shows nothing while emulating.
- `.va-scroll` carries NO `scrollbar-width`: Chrome prefers the standard
  property over `::-webkit-scrollbar` and `thin` is a macOS OVERLAY bar that
  reserves nothing, hiding the only hint the list goes on (same trap as
  `.stage-table-wrap` in offers.css). `.shm-panel` is capped to the window so a
  short viewport can never clip a panel's foot.

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

A signed-in visitor gets SEEDED answers (2026-09-26): About you's name/email and
the New hire card's Branch Manager arrive filled in. The page reads
`getViewer()` behind a `.catch(() => null)` — /apply stays PUBLIC, so this is a
convenience and an auth or database hiccup must never take the public door down
— and seeds from the **actor**, never the viewer, because those answers become
the submitter on the "Created" event and attribution is always the real human.
The seed is applied once, to initial state: the fields are ordinary and
editable, clearing one keeps it cleared, and a `.apply-seeded` note marks each
seeded answer only while it is still untouched (Branch Manager is a GUESS about
a third party, so it must be visibly a guess).

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
- **The letter FLOWS WITH THE PAGE (2026-09-29).** It used to be an island:
  `.od-letter .letter-overlay` was pinned to `calc(100vh - chrome)` and every
  column scrolled inside it, so a three-page letter showed 640px of its 2499px
  in a bordered box and you scrolled a widget instead of the page (measured).
  Now the pane's height is `auto` with that calc as its `min-height` — a short
  letter still fills the screen — the preview stops being an internal scroller,
  and the document scrolls once. Two things make it hold together: `.od-letter`
  is `overflow:clip`, NOT `hidden` (hidden makes it a scroll container, and
  sticky descendants would then stick to a box that never scrolls), and the
  pane's own chrome — the drawer tab and both panels — is `position:sticky`
  under the summary bar, with `align-self:start` so it has room to travel.
  Width is untouched: the column tracks are the same, so the sheet is still a
  true 816px at 1024–1440 with the activity rail resting.
- `OfferDetail` measures the bar and footer into `--od-bar-h` / `--od-foot-h`
  (and `--od-top`, the session bar above) so a short letter fills exactly
  what the chrome leaves, the sticky chrome knows its offset, and the rails
  (`.od-side`, the form's `.rf-nav`)
  stick below the bar. The activity rail is the SAME on both tabs and stays
  on the right down to 1100px; below the full
  width budget the LETTER gives, never the rail — through two independent
  knobs: the letter's LEFT columns (section rail, options width, stacking)
  follow VIEWPORT breakpoints and never move when a rail folds, while the
  sheet PREVIEW scales with `zoom` by the room the preview really has
  (`.letter-preview-area` is a size container, `@container od-preview`), so
  folding a rail just grows the sheet. Screen only: print never sees the
  zoom, and `@media print` switches the containment off so the sheet's
  absolute positioning still resolves against the page. Every export stays
  a true 8.5in.
- **Both rails REST COLLAPSED and unfold on hover (2026-09-26)**, the same
  contract as the offers sidebar's `.om-collapsed`: the activity rail
  (`.od-side-closed`, `onhr_activity_rail`) and the letter's section rail +
  options column, which share one drawer behind `.lp-peek-tab`
  (`.letter-overlay.lp-collapsed`, `onhr_letter_rail`, gated by LetterView's
  `railsCollapsible` prop so the SPA editor is untouched). Each tab CLICKS to
  pin and is the collapse control when pinned. **A peek must OVERLAY, never
  reflow** — `.letter-preview-area` is a size container driving the zoom
  ladder, so reflowing it mid-sweep would re-scale the sheet under the
  pointer; that is why the grid column stays 44px and only the panel widens.
  Resting buys the preview 240–490px and keeps the sheet at a true 816px down
  to a 1180px viewport (pinned it drops to `zoom:.9` there). Three things to
  keep: the collapsed rules are deliberately 4 classes so they outrank every
  3-class width-budget override; on `/offers/[id]` the peek panels are STICKY
  GRID ITEMS sharing the tab's 44px column and overflowing it to the right —
  a fixed grid track cannot be widened by its contents, so that overlays
  without reflowing, and unlike the `position:absolute` they replaced (which
  anchored them to the top of a now page-tall wrap, i.e. off-screen) a peek
  still lands beside the tab three pages down; and `@media print` resets the drawer's
  `position:relative`, the same trap as the container-query reset beside it —
  `#letterSheet` prints absolute at 0,0 and must resolve against the PAGE.
  The drawer's chrome subtracts `--od-foot-h` from its `max-height` as well as
  the bars: without it the options column ran to the bottom of the viewport and
  its last controls sat UNDER the sticky action footer. It is `overflow-y:auto`
  so the overflow scrolls rather than spilling. `.od-side-closed` and the form's
  `.rf-nav` already did this; the letter drawer was the one that did not.
  A peeked panel SHARES the tab's 44px grid track, so `100%` inside it is
  44px, not the pane — `width:min(312px,calc(100% - 44px))` therefore resolved
  to ZERO and the drawer opened ~33px wide below 1740px. Hover fired correctly
  the whole time; it just revealed a sliver, which is why it had to be clicked
  to be useful. Size a peeked panel against the VIEWPORT, never a percentage.
  The reveal is one forgiving `:has()` list covering the tab AND both panels,
  which is what lets the pointer travel from the tab into the options without
  the drawer closing behind it. All of it is scoped to `(hover:hover)`; on a
  touch screen the tab's click is the only way in.

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

**Fitting the letter on one page (2026-09-27):** every path that puts the
letter on paper asks `src/lib/offers/letter-fit.ts` for a density first. It is
ONE ladder of 17 steps from the untouched letter to a floor, and every consumer
takes the GENTLEST step that fits — binary-searched, ~7 layout reads.

- **Two knobs move together along one `t`.** Vertical rhythm (line-height,
  paragraph/heading/list margins, comp-table padding, the whitespace around the
  signature) ships as CSS custom properties, so `fitCss(scope)` is ONE static
  stylesheet whose fallbacks are letter.css's own values — it is inert until a
  step's variables are set. Type size is the second knob: the letter lays out at
  `widthPx` and is mapped onto the 532pt page box, so a wider layout means
  smaller type. That is a real reflow, not a squeeze.
- **The floor at 8.5pt is the product decision, not a limit of the code.** The
  letter's length is not fixed — a salaried ops hire fills one comp row, a
  branch manager with a guarantee and an override fills nine — and the "How It
  Works" column carries the repayment language verbatim. Measured: 5 of 7
  realistic letters now land on one page (they used to run 1.3–3.0 pages). The
  two that do not are the ones with a **monthly guarantee**, whose repayment
  clause is 17% of a page on its own and puts the letter 10% over. Shortening it
  is a legal decision — do not "fix" it here.
- `atFloor` comes back from `letterToPdf` and is surfaced: the letter view and
  the bulk export say when a letter needed a second page, and why.
- **Nothing here touches the on-screen sheet.** Print gets the step as a
  stylesheet `LetterView` injects for the duration of the print (behind
  `@supports (zoom:1)`, so a browser without `zoom` degrades to the spacing
  compression instead of clipping) and tears down with the print class. The HTML
  packet has its fit BAKED IN at export time — it ships no fit code, which is
  why `offerPacketHTML` is now async. The Word export is the one path that
  cannot be guaranteed: Word owns its pagination, so it is pinned to fixed
  compressed metrics and KEEPS 11pt type, because a .doc exists to be edited.
- The page box lives in `letter-fit.ts` (`MARGIN`, 34pt 40pt 34pt 40pt).
  letter.css's `@page`, the packet's `@page` and the Word `@page` all repeat it
  in inches — change them together. `tests/int/offers/letter-fit.int.spec.ts`
  pins the arithmetic, the ladder's monotonicity and the `fitCss` fallbacks.

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

**Notes (2026-09-29):** `offer-events` carries a `note` kind — the one row a
human writes on purpose rather than one a hook derives. `NoteComposer` sits at
the head of the activity rail (a note IS a feed entry, so it belongs with the
feed, not on the record) and posts to `/api/offer-note`, tier `'acting-ok'`.
While ACTING it is attributed to both people exactly like every other event,
and the composer says so BEFORE you type — a note that quietly claimed to be
the emulated user's would be the forgery view-as exists to avoid. Notes get
their own filter in `ACTIVITY_FILTERS`.

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
- **Leaving the editor (2026-09-29).** "+ New Request" used to be a dead end:
  the only exit was the sidebar, which rests collapsed to a rail, and Delete on
  an uncommitted form just called `newRecord()` again. `#btnCancel` is the way
  out — **"Cancel"** on a request this session started (discards it) and
  **"Close"** on anything else (saves and leaves). The distinction is
  `api.newDraftId`: the record `newRecord()` → autosave created and nobody
  deliberately saved. It is NULL for a record opened from a list, because
  discarding one of those would be catastrophic. `discardNewRecord()`
  deliberately does NOT flush — the pending autosave would re-create the draft
  it is deleting — so the form cancels its own timer and clears its own state
  first (when nothing autosaved yet, `currentId` is already null and the
  record-sync effect never fires). SPA only: `/offers/[id]` has `.od-back`.
- **The way out is the FIRST button in `.form-actions`** (2026-09-29), not a
  floating disc — it briefly was one, and in the header is where it belongs.
  It is ONE control (`#btnCancel`): **"Cancel"** discards a request this
  session started, **"← Back to <view>"** saves and leaves anything else. The
  old separate "Close" did exactly the latter, so the two are merged rather
  than sitting side by side doing the same thing. The letter tab keeps its own
  `#letterClose`.
- `VIEW_TITLE` / `backLabel()` (`components/offers/view-labels.ts`) name the
  destination in one place: the view head, `.om-back-fab`, and the letter's
  `#letterClose` all read from it. `#letterClose` was a hardcoded
  `showView('pipeline')` — wrong if you opened the record from Hired, and it
  skipped the autosave flush; it goes through `closeEditor()` now.
- **Deleting an offer is admin/dev, plus YOUR OWN DRAFT** (`deleteOfferRequest`
  in the collection, tested). The exception exists because `/api/offer-records`
  removes with `overrideAccess:false` as the ACTOR, so without it "+ New
  Request → type → Cancel" silently failed for every plain user: the client
  dropped the record, the server refused, and the draft came back on the next
  load. Keep it narrow — `createdBy` is yours AND `status` is still `draft`.
  Public /apply rows have no `createdBy`, so they never match. The three Delete
  controls (`#btnDelete`, the row ⋯ menu, the selection bar) are gated on
  `useViewer().isManager` to match; a plain user ARCHIVES instead.
- **The editor is WIDE and goes two-up above 1200px.** `main` was pinned to
  960px with the rest of the window empty; it is `min(1560px, 100%)` now. But
  widening alone just stretches every input, so `.grp-body` AND `.rf-card`
  (the Pay section's sub-cards, whose questions are direct children of the card
  itself — that is where most of the money questions live) become a 2-column
  grid, and the extra width buys a second column of questions instead of a
  700px Employee Name box. Three rules keep it honest: anything that is not a
  `.fld` spans the row (a card's blurb as a plain cell pushed question 1 into
  the right column); `:has()` spans the composites, textareas and stacked radio
  lists; and plain text/email inputs cap at 560px. Below 1200px it is the
  original single stack, untouched.
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

# Offer & New Hire Request Manager

This repo is the **Offer & New Hire Request Manager** — an offer-letter builder and
new-hire request pipeline for All Western Mortgage — running on top of the Payload
Website Template.

| Route | What serves it |
|-------|----------------|
| `/` | The app hub / launcher (`src/app/(hub)`). Marked `noindex`. |
| `/offers` | The Offer Manager app (`src/app/(offers)`). Marked `noindex`. |
| `/admin` | The Payload CMS admin panel. |
| `/<slug>` | CMS Pages, Posts, search, sitemaps — everything the template ships with. |

Two things to know:

- **`/` shadows any CMS page with slug `home`.** The app owns the root route, so a
  Page document with that slug has no reachable URL and is filtered out of
  `pages-sitemap.xml`. Give CMS home content a different slug.
- **Offer records live in the browser's `localStorage`, not in Mongo.** Nothing in
  the app writes to Payload yet; export/backup (`.xlsx`, `.csv`, `.json`) is the
  only way data leaves a machine. The CMS collections below are unrelated to it.

Everything from here down is the upstream template documentation.

---

# Payload Website Template

This is the official [Payload Website Template](https://github.com/payloadcms/payload/blob/main/templates/website). Use it to power websites, blogs, or portfolios from small to enterprise. This repo includes a fully-working backend, enterprise-grade admin panel, and a beautifully designed, production-ready website.

This template is right for you if you are working on:

- A personal or enterprise-grade website, blog, or portfolio
- A content publishing platform with a fully featured publication workflow
- Exploring the capabilities of Payload

Core features:

- [Pre-configured Payload Config](#how-it-works)
- [Authentication](#users-authentication)
- [Access Control](#access-control)
- [Layout Builder](#layout-builder)
- [Draft Preview](#draft-preview)
- [Live Preview](#live-preview)
- [On-demand Revalidation](#on-demand-revalidation)
- [SEO](#seo)
- [Search](#search)
- [Redirects](#redirects)
- [Jobs and Scheduled Publishing](#jobs-and-scheduled-publish)
- [Website](#website)

## Quick Start

```bash
git clone <this-repo> my-project && cd my-project
rm -rf .git && git init          # start fresh history

bun install
cp .env.example .env.local
bun run setup                    # generates PAYLOAD_SECRET / CRON_SECRET / PREVIEW_SECRET
```

Now open `.env.local` and fill in the values marked `<-- FILL IN`. It is the
single source of truth for configuration — Mongo, Resend, GA, GTM, Meta Pixel
and R2 are all grouped, commented blocks in that one file.

Minimum to boot: `DATABASE_URL` and `NEXT_PUBLIC_SITE_NAME`. Everything in the
analytics and email sections is optional and inert when left blank.

```bash
docker compose up -d             # optional — local mongo on :27017
bun dev                          # → http://localhost:3000/admin
```

Create the admin user on the signup screen, then create a Page with slug `home`.
Until that page exists the `homeStatic` fallback renders.

### Database

Using MongoDB Atlas? The string Atlas gives you has **no database name**:

```
mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true
                                           ↑ empty — add your db name here
```

Left as-is, every collection is silently written to a database called `test`.
Boot will refuse to start rather than let this happen.

Two further notes:

- Add your server's IP to Atlas → **Network Access**, or connections hang.
- The local docker-compose Mongo is **standalone**, so Payload transactions are
  off locally but on with Atlas. Hooks that forget to pass `req` can therefore
  pass locally and leave partial writes in production.

### Deploying on Coolify

Build pack **Dockerfile**, port **3000**.

`NEXT_PUBLIC_*` values are compiled into the bundle at build time, so in Coolify
each must be marked **Build Variable** — a runtime-only variable arrives too late
and compiles to an empty string with no error:

```
NEXT_PUBLIC_SERVER_URL   NEXT_PUBLIC_SITE_NAME    NEXT_PUBLIC_GA_ID
NEXT_PUBLIC_GTM_ID       NEXT_PUBLIC_FB_PIXEL_ID  NEXT_PUBLIC_R2_PUBLIC_URL
DATABASE_URL             PAYLOAD_SECRET
```

The same names have matching `ARG`/`ENV` pairs in the `Dockerfile`; adding a new
public var means editing both. Changing one needs a **rebuild**, not a restart.

Health check endpoint: `/api/health`.

With `STORAGE_MODE=local`, uploads live at `/app/public/media` **inside the
container** and are destroyed on every redeploy — mount a volume there, or use
`STORAGE_MODE=r2`.

## Integrations

Every integration is driven by `.env.local` and is **inert when blank**. A fresh
clone builds and runs with only the required variables set — no third-party
scripts are loaded, no accounts needed, nothing to comment out.

| Integration | Variables | When blank |
|---|---|---|
| **MongoDB** | `DATABASE_URL` | ❌ required — will not boot |
| **Payload auth** | `PAYLOAD_SECRET` | ❌ required — will not boot |
| **Site identity** | `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_SITE_NAME` | URL falls back to localhost; name falls back to `Site` |
| **Resend email** | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_FROM_NAME` | Emails log to the console instead of sending |
| **Google Analytics 4** | `NEXT_PUBLIC_GA_ID` | No script injected |
| **Google Tag Manager** | `NEXT_PUBLIC_GTM_ID` | No script injected |
| **Meta Pixel** | `NEXT_PUBLIC_FB_PIXEL_ID` | No script injected |
| **Cloudflare R2** | `STORAGE_MODE=r2` + `R2_*` | Files served from local disk |
| **Shopify** | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Catalog helpers return empty results |

Minimum viable `.env.local`:

```
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/myproject
PAYLOAD_SECRET=<generated by bun run setup>
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

### Analytics

Set the IDs and the tags mount automatically in the root layout — no code
changes. If `NEXT_PUBLIC_GTM_ID` is set, the standalone GA tag is **skipped**, on
the assumption GA is routed through the GTM container. Set `NEXT_PUBLIC_GA_ID`
alone only if you are not using GTM.

These are `NEXT_PUBLIC_*`, so they are compiled into the bundle at **build**
time. Changing one requires a rebuild, not a restart, and on Coolify each must be
marked a Build Variable.

For custom events, use `sendGTMEvent` / `sendGAEvent` from
`@next/third-parties/google` inside a client component.

### Email

Set `RESEND_API_KEY` and the Resend adapter activates in `payload.config.ts`.
This drives contact-form notifications and admin password resets. Verify the
from-address domain in Resend first, or sends fail.

Setting the key while leaving `RESEND_FROM_ADDRESS` blank **throws on boot** — a
half-configured integration fails loudly rather than silently dropping mail.

### Media storage

`STORAGE_MODE=local` (the default) writes to `public/media`. Switching to `r2`
requires the four `R2_*` values; see the block in `.env.example` for the
Cloudflare setup steps. `NEXT_PUBLIC_R2_PUBLIC_URL` is optional — set it to serve
directly from R2's CDN, leave it blank to have Payload proxy the files.

### Shopify (headless catalog + cart)

Set two variables and `@/lib/shopify` comes alive:

```
SHOPIFY_STORE_DOMAIN=acme
SHOPIFY_STOREFRONT_ACCESS_TOKEN=...
```

The domain accepts `acme`, `acme.myshopify.com`, or the full URL — it is
normalized for you.

**Use a Storefront API token, not an Admin API token.** The Admin API carries
write scopes for orders, inventory and customers; the Storefront API is scoped to
the catalog plus cart, which is all a website needs. A leaked Admin token is a
full store compromise. If the token is wrong you get a 401 and the error message
says so explicitly.

To create one: Shopify admin → **Settings → Apps and sales channels → Develop
apps → Create an app**, configure the Storefront API scopes
(`unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`,
`unauthenticated_write_checkouts`, `unauthenticated_read_checkouts`), install, then
reveal the Storefront access token.

⚠️ These are **not** `NEXT_PUBLIC_` and must never be. The token stays
server-side, which means it never enters the browser bundle — and conveniently,
no Dockerfile `ARG` and no Coolify Build Variable. They are plain **runtime**
variables.

#### Usage

```tsx
// app/(frontend)/shop/page.tsx
import { getProducts } from '@/lib/shopify'

export const revalidate = 60

export default async function ShopPage() {
  const { items } = await getProducts({ first: 12 })

  return items.map((p) => (
    <a key={p.id} href={`/shop/${p.handle}`}>
      {p.title} — {p.price.formatted}
    </a>
  ))
}
```

Available from `@/lib/shopify`:

| Function | Returns |
|---|---|
| `getProducts({ first, after, query, sortKey })` | `Paginated<Product>` |
| `getProduct(handle)` | `Product \| null` |
| `getCollections()` | `Collection[]` |
| `getCollectionProducts({ handle, first })` | `Paginated<Product>` |
| `createCart(lines)` / `getCart(id)` | `Cart` |
| `addToCart(cartId, lines)` | `Cart` — creates one if the id is stale |
| `updateCartLines` / `removeCartLines` | `Cart` |
| `isShopifyEnabled()` | `boolean` — gate commerce UI on this |
| `storefront<T>(query, vars)` | Raw escape hatch for queries not wrapped above |

Prices arrive preformatted (`p.price.formatted` → `"$24.00"`), images are
flattened out of `edges[].node`, and a product's compare-at price is `null`
rather than `$0.00` when it is not on sale.

Checkout is **never rebuilt** — every `Cart` carries a `checkoutUrl` pointing at
Shopify's hosted checkout. Redirect there and Shopify owns payments, tax,
shipping and PCI scope.

#### Two caveats

1. **Do not statically prerender catalog routes.** Because the credentials are
   runtime-only, a page prerendered at build time bakes in an empty catalog. Use
   `export const revalidate = 60` (ISR) or `dynamic = 'force-dynamic'`.
2. **Pass a buyer IP on high-traffic stores.** All server-side calls come from one
   IP, so Shopify can mistake them for a scraper and return `430`. Use
   `buyerIpFromHeaders(await headers())` and pass it as `buyerIp`.

### Adding a new integration

Five files, every time. The checklist lives in `CLAUDE.md` under *Adding a New
Integration* — the step that gets missed is the `Dockerfile` `ARG`, which fails
silently in production only.

## How it works

The Payload config is tailored specifically to the needs of most websites. It is pre-configured in the following ways:

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- #### Users (Authentication)

  Users are auth-enabled collections that have access to the admin panel and unpublished content. See [Access Control](#access-control) for more details.

  For additional help, see the official [Auth Example](https://github.com/payloadcms/payload/tree/main/examples/auth) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.

- #### Posts

  Posts are used to generate blog posts, news articles, or any other type of content that is published over time. All posts are layout builder enabled so you can generate unique layouts for each post using layout-building blocks, see [Layout Builder](#layout-builder) for more details. Posts are also draft-enabled so you can preview them before publishing them to your website, see [Draft Preview](#draft-preview) for more details.

- #### Pages

  All pages are layout builder enabled so you can generate unique layouts for each page using layout-building blocks, see [Layout Builder](#layout-builder) for more details. Pages are also draft-enabled so you can preview them before publishing them to your website, see [Draft Preview](#draft-preview) for more details.

- #### Media

  This is the uploads enabled collection used by pages, posts, and projects to contain media like images, videos, downloads, and other assets. It features pre-configured sizes, focal point and manual resizing to help you manage your pictures.

- #### Categories

  A taxonomy used to group posts together. Categories can be nested inside of one another, for example "News > Technology". See the official [Payload Nested Docs Plugin](https://payloadcms.com/docs/plugins/nested-docs) for more details.

### Globals

See the [Globals](https://payloadcms.com/docs/configuration/globals) docs for details on how to extend this functionality.

- `Header`

  The data required by the header on your front-end like nav links.

- `Footer`

  Same as above but for the footer of your site.

## Access control

Basic access control is setup to limit access to various content based based on publishing status.

- `users`: Users can access the admin panel and create or edit content.
- `posts`: Everyone can access published posts, but only users can create, update, or delete them.
- `pages`: Everyone can access published pages, but only users can create, update, or delete them.

For more details on how to extend this functionality, see the [Payload Access Control](https://payloadcms.com/docs/access-control/overview#access-control) docs.

## Layout Builder

Create unique page layouts for any type of content using a powerful layout builder. This template comes pre-configured with the following layout building blocks:

- Hero
- Content
- Media
- Call To Action
- Archive

Each block is fully designed and built into the front-end website that comes with this template. See [Website](#website) for more details.

## Lexical editor

A deep editorial experience that allows complete freedom to focus just on writing content without breaking out of the flow with support for Payload blocks, media, links and other features provided out of the box. See [Lexical](https://payloadcms.com/docs/rich-text/overview) docs.

## Draft Preview

All posts and pages are draft-enabled so you can preview them before publishing them to your website. To do this, these collections use [Versions](https://payloadcms.com/docs/configuration/collections#versions) with `drafts` set to `true`. This means that when you create a new post, project, or page, it will be saved as a draft and will not be visible on your website until you publish it. This also means that you can preview your draft before publishing it to your website. To do this, we automatically format a custom URL which redirects to your front-end to securely fetch the draft version of your content.

Since the front-end of this template is statically generated, this also means that pages, posts, and projects will need to be regenerated as changes are made to published documents. To do this, we use an `afterChange` hook to regenerate the front-end when a document has changed and its `_status` is `published`.

For more details on how to extend this functionality, see the official [Draft Preview Example](https://github.com/payloadcms/payload/tree/examples/draft-preview).

## Live preview

In addition to draft previews you can also enable live preview to view your end resulting page as you're editing content with full support for SSR rendering. See [Live preview docs](https://payloadcms.com/docs/live-preview/overview) for more details.

## On-demand Revalidation

We've added hooks to collections and globals so that all of your pages, posts, footer, or header changes will automatically be updated in the frontend via on-demand revalidation supported by Nextjs.

> Note: if an image has been changed, for example it's been cropped, you will need to republish the page it's used on in order to be able to revalidate the Nextjs image cache.

## SEO

This template comes pre-configured with the official [Payload SEO Plugin](https://payloadcms.com/docs/plugins/seo) for complete SEO control from the admin panel. All SEO data is fully integrated into the front-end website that comes with this template. See [Website](#website) for more details.

## Search

This template also pre-configured with the official [Payload Search Plugin](https://payloadcms.com/docs/plugins/search) to showcase how SSR search features can easily be implemented into Next.js with Payload. See [Website](#website) for more details.

## Redirects

If you are migrating an existing site or moving content to a new URL, you can use the `redirects` collection to create a proper redirect from old URLs to new ones. This will ensure that proper request status codes are returned to search engines and that your users are not left with a broken link. This template comes pre-configured with the official [Payload Redirects Plugin](https://payloadcms.com/docs/plugins/redirects) for complete redirect control from the admin panel. All redirects are fully integrated into the front-end website that comes with this template. See [Website](#website) for more details.

## Jobs and Scheduled Publish

We have configured [Scheduled Publish](https://payloadcms.com/docs/versions/drafts#scheduled-publish) which uses the [jobs queue](https://payloadcms.com/docs/jobs-queue/jobs) in order to publish or unpublish your content on a scheduled time. The tasks are run on a cron schedule and can also be run as a separate instance if needed.

> Note: When deployed on Vercel, depending on the plan tier, you may be limited to daily cron only.

## Website

This template includes a beautifully designed, production-ready front-end built with the [Next.js App Router](https://nextjs.org), served right alongside your Payload app in a instance. This makes it so that you can deploy both your backend and website where you need it.

Core features:

- [Next.js App Router](https://nextjs.org)
- [TypeScript](https://www.typescriptlang.org)
- [React Hook Form](https://react-hook-form.com)
- [Payload Admin Bar](https://github.com/payloadcms/payload/tree/main/packages/admin-bar)
- [TailwindCSS styling](https://tailwindcss.com/)
- [shadcn/ui components](https://ui.shadcn.com/)
- User Accounts and Authentication
- Fully featured blog
- Publication workflow
- Dark mode
- Pre-made layout building blocks
- SEO
- Search
- Redirects
- Live preview

### Cache

Although Next.js includes a robust set of caching strategies out of the box, Payload Cloud proxies and caches all files through Cloudflare using the [Official Cloud Plugin](https://www.npmjs.com/package/@payloadcms/payload-cloud). This means that Next.js caching is not needed and is disabled by default. If you are hosting your app outside of Payload Cloud, you can easily reenable the Next.js caching mechanisms by removing the `no-store` directive from all fetch requests in `./src/app/_api` and then removing all instances of `export const dynamic = 'force-dynamic'` from pages files, such as `./src/app/(pages)/[slug]/page.tsx`. For more details, see the official [Next.js Caching Docs](https://nextjs.org/docs/app/building-your-application/caching).

## Development

To spin up this example locally, follow the [Quick Start](#quick-start). Then [Seed](#seed) the database with a few pages, posts, and projects.

### Docker

Alternatively, you can use [Docker](https://www.docker.com) to spin up this template locally. To do so, follow these steps:

1. Follow [steps 1 and 2 from above](#development), the docker-compose file will automatically use the `.env` file in your project root
1. Next run `docker-compose up`
1. Follow [steps 4 and 5 from above](#development) to login and create your first admin user

That's it! The Docker instance will help you get up and running quickly while also standardizing the development environment across your teams.

### Seed

To seed the database with a few pages, posts, and projects you can click the 'seed database' link from the admin panel.

The seed script will also create a demo user for demonstration purposes only:

- Demo Author
  - Email: `demo-author@payloadcms.com`
  - Password: `password`

> NOTICE: seeding the database is destructive because it drops your current database to populate a fresh one from the seed template. Only run this command if you are starting a new project or can afford to lose your current data.

## Production

To run Payload in production, you need to build and start the Admin panel. To do so, follow these steps:

1. Invoke the `next build` script by running `pnpm build` or `npm run build` in your project root. This creates a `.next` directory with a production-ready admin bundle.
1. Finally run `pnpm start` or `npm run start` to run Node in production and serve Payload from the `.build` directory.
1. When you're ready to go live, see Deployment below for more details.

### Deploying

This template targets **Coolify** via the included `Dockerfile` — see
[Deploying on Coolify](#deploying-on-coolify) above for the build-variable setup,
which is the part that bites.

Nothing in here is Coolify-specific beyond that, so any host that builds a
Dockerfile works the same way. The only hard requirements are that
`NEXT_PUBLIC_*` values are present at **build** time and that `DATABASE_URL`
points at a replica set in production (Atlas is; a standalone Mongo is not, and
Payload transactions silently disable themselves without one).

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).

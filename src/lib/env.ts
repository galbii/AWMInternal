function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}. Check .env.local (see .env.example).`)
  return v
}

function optional(key: string): string | null {
  const v = process.env[key]
  return v && v.trim() !== '' ? v : null
}

/**
 * Placeholders survive a copied .env.example: `noreply@yourdomain.com`,
 * `<-- FILL IN`, a leftover `#`. Resend accepts none of them, but it only
 * says so at SEND time — a 403 inside whatever request tried to mail, long
 * after boot. Treat a placeholder as "not configured" so the fallback
 * (Payload logs mail to the console) kicks in and /api/email/test says why.
 */
const PLACEHOLDER = [/^#/, /^<.*>$/, /fill[ _-]?in/i, /yourdomain\.com$/i, /example\.com$/i]

function real(key: string): string | null {
  const v = optional(key)
  return v && !PLACEHOLDER.some((p) => p.test(v.trim())) ? v.trim() : null
}

function requireReal(key: string, why: string): string {
  const v = real(key)
  if (!v) throw new Error(`${key} is missing or still a placeholder. ${why} (see .env.example).`)
  return v
}

/**
 * Atlas hands you a connection string with an empty database path:
 *   mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true
 * Mongoose silently falls back to a database named `test`, so every
 * collection lands in the wrong place and nothing appears to be wrong
 * until a second project shares the cluster. Fail loudly instead.
 */
function validateDatabaseUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid connection string: "${url}". ` +
        `Expected mongodb:// or mongodb+srv:// — see .env.example.`,
    )
  }

  if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
    throw new Error(
      `DATABASE_URL must start with mongodb:// or mongodb+srv:// (got "${parsed.protocol}//").`,
    )
  }

  const dbName = parsed.pathname.replace(/^\//, '')
  if (!dbName) {
    throw new Error(
      `DATABASE_URL has no database name — everything would silently be written to a database called "test".\n` +
        `Add the name before the "?":\n` +
        `  mongodb+srv://user:pass@cluster.mongodb.net/YOUR_DB_NAME?retryWrites=true&w=majority`,
    )
  }

  return url
}

const storageMode = (process.env.STORAGE_MODE ?? 'local') as 'local' | 'r2'
if (storageMode !== 'local' && storageMode !== 'r2') {
  throw new Error(`Invalid STORAGE_MODE: ${storageMode}. Must be 'local' or 'r2'.`)
}

const resendApiKey = real('RESEND_API_KEY')

/**
 * Accepts whatever the merchant pastes out of the Shopify admin bar —
 * "acme", "acme.myshopify.com", "https://acme.myshopify.com/" — and
 * returns the bare host the Storefront API expects.
 *
 * A custom domain (shop.acme.com) is passed through untouched: it is a
 * valid Storefront host once the store's primary domain is set to it.
 */
function normalizeShopDomain(input: string): string {
  const host = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase()

  return host.includes('.') ? host : `${host}.myshopify.com`
}

const shopifyDomain = optional('SHOPIFY_STORE_DOMAIN')
const shopifyToken = optional('SHOPIFY_STOREFRONT_ACCESS_TOKEN')

/**
 * Passkeys (WebAuthn) are bound to an ORIGIN and a Relying Party ID, and the
 * browser refuses the ceremony if either disagrees with the page it runs on.
 *
 * `APP_ORIGIN` accepts a comma-separated list so one deployment can serve more
 * than one origin (e.g. a bare domain and a www host, or localhost during dev).
 * The FIRST entry is canonical: its hostname becomes the rpID, which is what
 * credentials are actually scoped to. Every listed origin is accepted at
 * verification time.
 */
function passkeyConfig(): { rpID: string; rpName: string; origins: string[] } {
  const raw = process.env.APP_ORIGIN || 'http://localhost:3000'
  const origins = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  if (!origins.length) throw new Error('APP_ORIGIN is set but empty — see .env.example.')

  let canonical: URL
  try {
    canonical = new URL(origins[0])
  } catch {
    throw new Error(
      `APP_ORIGIN must be a full origin like https://internal.example.com (got "${origins[0]}").`,
    )
  }

  return {
    // Bare hostname, no port — a passkey created on :3000 must still work on :3001.
    rpID: canonical.hostname,
    rpName: process.env.NEXT_PUBLIC_SITE_NAME || 'All Western Mortgage',
    origins,
  }
}

export const env = {
  DATABASE_URL: validateDatabaseUrl(required('DATABASE_URL')),
  PAYLOAD_SECRET: required('PAYLOAD_SECRET'),
  PASSKEY: passkeyConfig(),
  // `||` not `??`: an unfilled .env.local leaves this as an empty string,
  // which `??` would happily pass through and render as "About | ".
  SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME || 'Site',

  STORAGE_MODE: storageMode,
  R2:
    storageMode === 'r2'
      ? {
          bucket: required('R2_BUCKET'),
          accessKeyId: required('R2_ACCESS_KEY_ID'),
          secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
          endpoint: required('R2_ENDPOINT'),
          publicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? null,
        }
      : null,

  // The public new-hire request form at /apply. Null = open to anyone who has
  // the link; set a shared code and the form asks for it (compared in
  // constant time by /api/apply). Rotate it by changing the value.
  APPLY_ACCESS_CODE: optional('APPLY_ACCESS_CODE'),

  // Null when unset — Payload then falls back to logging emails to the
  // console rather than sending, which is what we want in local dev.
  //
  // A key WITH a placeholder from-address is a misconfiguration, not a
  // half-enabled state: fail at boot rather than 403 on the first send.
  RESEND: resendApiKey
    ? {
        apiKey: resendApiKey,
        // The domain must be verified at resend.com/domains, with one
        // exception: onboarding@resend.dev sends without a domain but only
        // reaches the address that owns the Resend account.
        fromAddress: requireReal(
          'RESEND_FROM_ADDRESS',
          'RESEND_API_KEY is set, so mail needs a real sender on a verified domain',
        ),
        fromName:
          process.env.RESEND_FROM_NAME || process.env.NEXT_PUBLIC_SITE_NAME || 'All Western Mortgage',
        /**
         * Staging safety valve: every outbound email is redirected here
         * instead of to its real recipients (the Resend adapter's
         * `overrideRecipientAddress`). Leave unset in production.
         */
        overrideTo: real('RESEND_OVERRIDE_TO'),
      }
    : null,
}

/**
 * Null unless BOTH the domain and the token are present — a store domain
 * with no token cannot answer a single query, so treating it as "half
 * enabled" would only produce 401s at request time instead of an obvious
 * "Shopify is off" at boot.
 *
 * Deliberately NOT prefixed NEXT_PUBLIC_. The Storefront token stays on
 * the server, which means it never enters the client bundle, needs no
 * Dockerfile ARG, and is a plain runtime variable on Coolify.
 */
export const shopify = shopifyDomain && shopifyToken
  ? (() => {
      const domain = normalizeShopDomain(shopifyDomain)
      // Shopify ships a new dated version each quarter and supports each
      // for a year. Pinning means an upgrade is a deliberate env change
      // rather than a silent breakage on their release day.
      const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07'

      return {
        domain,
        apiVersion,
        token: shopifyToken,
        endpoint: `https://${domain}/api/${apiVersion}/graphql.json`,
      }
    })()
  : null

/**
 * Analytics IDs are read from `process.env.*` by full literal name on
 * purpose: Next.js inlines NEXT_PUBLIC_* at build time via static text
 * replacement, so `process.env[someVariable]` would not be substituted.
 *
 * Each is null when blank, and the matching component renders nothing.
 */
export const analytics = {
  gaId: process.env.NEXT_PUBLIC_GA_ID || null,
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || null,
  fbPixelId: process.env.NEXT_PUBLIC_FB_PIXEL_ID || null,
}

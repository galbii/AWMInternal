// The DocuSign envelope body — pure, so it is unit-tested without the server
// env (envelope.ts sends it; auth.ts reads the private key).
//
// The letter PDF is rasterised in the browser (src/lib/offers/pdf.ts), so it
// has no text layer and DocuSign's anchor tabs (`anchorString`) cannot find
// anything. Tabs are placed by coordinates instead: points from the page's
// top-left, which is exactly DocuSign's unit (pixels at 72 dpi).
//
// ROUTING (2026-10-27, HR's request): the INTERNAL signer (the letter's
// signatory) signs first, then the CANDIDATE, then the reporting manager — a
// carbon copy, not a signer — receives the completed documents. Routing order
// is what sequences them; DocuSign only emails each one when their turn comes.
//
// Extra agreements ride in the same envelope as documents 2..n. The app has
// never seen them, so it cannot place their fields: an envelope with extras
// is created as a DRAFT and HR places those fields in DocuSign's own tagging
// screen (the sender view) before sending. The letter's fields arrive already
// placed either way.

export interface SignaturePlacement {
  /** 1-based page of the document. */
  page: number
  /** Left edge of the signer's line, in points. */
  x: number
  /** The signature line itself (the rule the signer writes on), in points. */
  y: number
  /** Left edge of a date column on the same line, in points — absent when the line has none. */
  dateX?: number
}

export interface EnvelopeDoc {
  filename: string
  base64: string
}

export interface EnvelopeParty {
  name: string
  email: string
}

export interface EnvelopeInput {
  /** The offer letter — document 1, the only one the app places fields on. */
  letter: EnvelopeDoc
  /** Further agreements, documents 2..n; fields placed by HR in DocuSign. */
  extras: EnvelopeDoc[]
  /** Signs first, on the letter's "Warm regards" line. */
  internal: EnvelopeParty & { place: SignaturePlacement }
  /** Signs second, on the acceptance line, with the date beside it. */
  candidate: EnvelopeParty & { place: SignaturePlacement }
  /** Receives the completed documents once both have signed. */
  copyTo: EnvelopeParty | null
  subject: string
  message: string
  /** true = create as a draft, for HR to finish in the sender view. */
  draft: boolean
}

/** DocuSign refuses an emailSubject over 100 characters. */
export const MAX_SUBJECT = 100

/** The agreement types accepted beside the letter; DocuSign converts Word itself. */
export const EXTRA_DOC_TYPES = ['pdf', 'docx', 'doc'] as const
export const MAX_EXTRA_DOCS = 5

// The sign-here graphic is drawn DOWN from its anchor point and is roughly
// 30pt tall; lifting it that far sits it on the rule rather than through it.
// The date is plain text, so it only needs to clear the rule.
const SIGN_LIFT = 30
const DATE_LIFT = 14

const pos = (n: number): string => String(Math.max(0, Math.round(n)))

/** 'Offer.PDF' -> 'pdf'; '' when it has no extension. */
export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim())
  return m ? m[1].toLowerCase() : ''
}

export function isAcceptedExtra(filename: string): boolean {
  return (EXTRA_DOC_TYPES as readonly string[]).includes(extensionOf(filename))
}

function signHere(place: SignaturePlacement): Record<string, string> {
  return {
    documentId: '1',
    pageNumber: String(place.page),
    xPosition: pos(place.x),
    yPosition: pos(place.y - SIGN_LIFT),
  }
}

export function buildEnvelope(input: EnvelopeInput): Record<string, unknown> {
  const { internal, candidate } = input
  const documents = [input.letter, ...input.extras].map((d, i) => ({
    documentId: String(i + 1),
    name: d.filename,
    fileExtension: extensionOf(d.filename) || 'pdf',
    documentBase64: d.base64,
  }))

  const candidateTabs: Record<string, unknown> = {
    signHereTabs: [signHere(candidate.place)],
  }
  if (candidate.place.dateX !== undefined) {
    candidateTabs.dateSignedTabs = [
      {
        documentId: '1',
        pageNumber: String(candidate.place.page),
        xPosition: pos(candidate.place.dateX),
        yPosition: pos(candidate.place.y - DATE_LIFT),
      },
    ]
  }

  const recipients: Record<string, unknown> = {
    signers: [
      {
        recipientId: '1',
        routingOrder: '1',
        name: internal.name,
        email: internal.email,
        tabs: { signHereTabs: [signHere(internal.place)] },
      },
      {
        recipientId: '2',
        routingOrder: '2',
        name: candidate.name,
        email: candidate.email,
        tabs: candidateTabs,
      },
    ],
  }
  if (input.copyTo) {
    // Routing order 3: reached only after both signers finish, so the copy is
    // of the COMPLETED documents.
    recipients.carbonCopies = [
      {
        recipientId: '3',
        routingOrder: '3',
        name: input.copyTo.name || input.copyTo.email,
        email: input.copyTo.email,
      },
    ]
  }

  return {
    emailSubject: input.subject.slice(0, MAX_SUBJECT),
    emailBlurb: input.message,
    status: input.draft ? 'created' : 'sent',
    documents,
    recipients,
  }
}

/**
 * The sender-view request: DocuSign's Prepare screen, one Next from where the
 * extra documents' fields are placed, and its Send button sends.
 * 'prepare' is the only startingScreen the API accepts: 'Tagging' (any case)
 * is refused with "Invalid startingScreen value." (verified 2026-10-29).
 */
export function buildSenderView(returnUrl: string): Record<string, unknown> {
  return {
    returnUrl,
    viewAccess: 'envelope',
    settings: {
      startingScreen: 'prepare',
      sendButtonAction: 'send',
      showBackButton: 'false',
      showHeaderActions: 'false',
    },
  }
}

/** US Letter in points — a placement outside it is a bug, not a request. */
const PAGE_W = 612
const PAGE_H = 792
const MAX_PAGES = 20

/** The placement a client posted, if it is a sane one; null otherwise. `dateX` is optional. */
export function readPlacement(v: unknown): SignaturePlacement | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const num = (k: string, max: number): number | null =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= 0 && (o[k] as number) <= max
      ? (o[k] as number)
      : null
  const page = num('page', MAX_PAGES)
  const x = num('x', PAGE_W)
  const y = num('y', PAGE_H)
  if (page === null || x === null || y === null) return null
  if (!Number.isInteger(page) || page < 1) return null
  if (o.dateX === undefined) return { page, x, y }
  const dateX = num('dateX', PAGE_W)
  return dateX === null ? null : { page, x, y, dateX }
}

/**
 * "Peter Lin, then Dana Smith (dana@x.com) · copy to Sam (sam@x.com) · 2 more documents"
 * — the audit line for a sent envelope, in signing order.
 */
export function routingSummary(
  signers: EnvelopeParty[],
  copies: EnvelopeParty[],
  extraDocs: number,
): string {
  const who = (p: EnvelopeParty): string => (p.name ? `${p.name} (${p.email})` : p.email)
  let s = signers.map(who).join(', then ')
  if (copies.length) s += ' · copy to ' + copies.map(who).join(', ')
  if (extraDocs > 0) s += ` · ${extraDocs} more document${extraDocs === 1 ? '' : 's'}`
  return s
}

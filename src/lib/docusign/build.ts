// The DocuSign envelope body — pure, so it is unit-tested without the server
// env (envelope.ts sends it; auth.ts reads the private key).
//
// The letter PDF is rasterised in the browser (src/lib/offers/pdf.ts), so it
// has no text layer and DocuSign's anchor tabs (`anchorString`) cannot find
// anything. Tabs are placed by coordinates instead: points from the page's
// top-left, which is exactly DocuSign's unit (pixels at 72 dpi).

export interface SignaturePlacement {
  /** 1-based page of the document. */
  page: number
  /** Left edge of the signer's line, in points. */
  x: number
  /** The signature line itself (the rule the signer writes on), in points. */
  y: number
  /** Left edge of the date column on the same line, in points. */
  dateX: number
}

export interface EnvelopeInput {
  pdfBase64: string
  filename: string
  signerName: string
  signerEmail: string
  subject: string
  message: string
  place: SignaturePlacement
}

/** DocuSign refuses an emailSubject over 100 characters. */
export const MAX_SUBJECT = 100

// The sign-here graphic is drawn DOWN from its anchor point and is roughly
// 30pt tall; lifting it that far sits it on the rule rather than through it.
// The date is plain text, so it only needs to clear the rule.
const SIGN_LIFT = 30
const DATE_LIFT = 14

const pos = (n: number): string => String(Math.max(0, Math.round(n)))

export function buildEnvelope(input: EnvelopeInput): Record<string, unknown> {
  const { place } = input
  return {
    emailSubject: input.subject.slice(0, MAX_SUBJECT),
    emailBlurb: input.message,
    status: 'sent',
    documents: [
      {
        documentId: '1',
        name: input.filename,
        fileExtension: 'pdf',
        documentBase64: input.pdfBase64,
      },
    ],
    recipients: {
      signers: [
        {
          recipientId: '1',
          routingOrder: '1',
          name: input.signerName,
          email: input.signerEmail,
          tabs: {
            signHereTabs: [
              {
                documentId: '1',
                pageNumber: String(place.page),
                xPosition: pos(place.x),
                yPosition: pos(place.y - SIGN_LIFT),
              },
            ],
            dateSignedTabs: [
              {
                documentId: '1',
                pageNumber: String(place.page),
                xPosition: pos(place.dateX),
                yPosition: pos(place.y - DATE_LIFT),
              },
            ],
          },
        },
      ],
    },
  }
}

/** US Letter in points — a placement outside it is a bug, not a request. */
const PAGE_W = 612
const PAGE_H = 792
const MAX_PAGES = 20

/** The placement a client posted, if it is a sane one; null otherwise. */
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
  const dateX = num('dateX', PAGE_W)
  if (page === null || x === null || y === null || dateX === null) return null
  if (!Number.isInteger(page) || page < 1) return null
  return { page, x, y, dateX }
}

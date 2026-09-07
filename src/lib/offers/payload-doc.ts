// Pure mappers between the frozen OfferRecord shape (src/lib/offers/types.ts)
// and the `offer-requests` Payload document. Framework-free and import-safe on
// both server and client (types only).
//
// toOfferRecord builds keys in a FIXED order and normalizes null/absent so a
// DB round trip is JSON-stable — LetterView's letterSig and the storage seam's
// snapshot diff both compare JSON strings.

import type {
  OfferData,
  OfferRecord,
  RecordStatus,
  Stage,
  StoredLetterConfig,
} from '@/lib/offers/types'
import type { OfferRequest } from '@/payload-types'

const STAGES: Stage[] = ['pipeline', 'hired', 'archived']

/** Payload doc -> frozen record shape. */
export function toOfferRecord(doc: OfferRequest): OfferRecord {
  const data: OfferData =
    doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data)
      ? (doc.data as OfferData)
      : {}
  const status: RecordStatus = doc.status === 'complete' ? 'complete' : 'draft'

  const rec: OfferRecord = {
    id: String(doc.id),
    data,
    status,
    created: doc.created || '',
    updated: doc.updated || '',
  }
  if (doc.stage && STAGES.includes(doc.stage)) rec.stage = doc.stage
  if (doc.letter && typeof doc.letter === 'object' && !Array.isArray(doc.letter)) {
    rec.letter = doc.letter as StoredLetterConfig
  }
  if (typeof doc.letterHtml === 'string' && doc.letterHtml !== '') rec.letterHtml = doc.letterHtml
  if (doc.letterStale) rec.letterStale = true
  return rec
}

/** The write payload for offer-requests: every required collection field
 *  present, so `payload.create({ data: { ...toOfferDoc(rec), id } })` typechecks
 *  without draft mode. */
export interface OfferDocData {
  data: OfferData
  status: 'complete' | 'draft'
  stage: Stage | null
  created: string
  updated: string
  letter: OfferRequest['letter']
  letterHtml: string | null
  letterStale: boolean
  pos?: number
}

/** Frozen record shape -> Payload write data (create adds `id` at the call site). */
export function toOfferDoc(rec: OfferRecord, pos?: number): OfferDocData {
  return {
    data: rec.data && typeof rec.data === 'object' ? rec.data : {},
    status: rec.status === 'complete' ? 'complete' : 'draft',
    stage: rec.stage && STAGES.includes(rec.stage) ? rec.stage : null,
    created: rec.created || '',
    updated: rec.updated || '',
    letter: rec.letter ?? null,
    letterHtml: typeof rec.letterHtml === 'string' ? rec.letterHtml : null,
    letterStale: Boolean(rec.letterStale),
    ...(pos !== undefined ? { pos } : {}),
  }
}

// Where each letter signatory receives DocuSign requests — the internal signer
// who signs the "Warm regards" line before the candidate.
//
// Kept BESIDE letter.ts's SIGNATORY map rather than on it: that map is ported
// letter content (S3), and an address is not part of the letter. An empty
// string means "not on file" — the send panel then asks for it, and a guessed
// address must never go here: a signing request sent to the wrong person is
// an offer letter in a stranger's inbox.

import type { SignatoryKey } from '@/lib/offers/types'

export const SIGNATORY_EMAIL: Record<SignatoryKey, string> = {
  biaggi: '',
  kauffman: '',
  kern: '',
  lin: 'plin@allwestern.com',
}

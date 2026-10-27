'use client'

// "Send for signature" (DocuSign) — offered by COMPOSITION, like Push to HR:
// only the /hiring pages render this provider, so HR's /offers never shows the
// button. `configured` comes from the server page (env.DOCUSIGN), so a server
// without DocuSign shows nothing rather than a button that always fails.
//
// Without a provider `useSignature()` is unavailable — the button simply does
// not render. The provider hosts the one SendForSignatureModal, the way
// OffersProvider hosts SendLetterModal.
//
// It also reads `?signature=` once: /api/offer-signature/return lands the
// browser here after HR finishes a draft in DocuSign's tagging screen, and
// the flag (sent | draft | unknown) becomes a toast, then leaves the URL.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useOffers } from '@/components/offers/OffersProvider'
import SendForSignatureModal from '@/components/offers/SendForSignatureModal'

export interface SignatureApi {
  /** This door offers DocuSign and the server is configured for it. */
  available: boolean
  /** Open the send-for-signature modal for a record. */
  open(id: string): void
}

const INERT: SignatureApi = { available: false, open: () => {} }

const Ctx = createContext<SignatureApi>(INERT)

export const useSignature = (): SignatureApi => useContext(Ctx)

export function SignatureProvider({
  children,
  configured,
}: {
  children: React.ReactNode
  configured: boolean
}) {
  const offers = useOffers()
  const [forId, setForId] = useState<string | null>(null)
  const open = useCallback((id: string) => setForId(id || null), [])
  const api = useMemo<SignatureApi>(() => ({ available: configured, open }), [configured, open])

  const { toast } = offers
  useEffect(() => {
    const url = new URL(window.location.href)
    const flag = url.searchParams.get('signature')
    if (!flag) return
    if (flag === 'sent') toast('Sent via DocuSign. The signers get their emails in order.')
    else if (flag === 'draft') toast('Not sent yet — the envelope is saved as a draft in DocuSign.', true)
    else toast('Could not confirm the DocuSign send. Check the envelope in DocuSign.', true)
    url.searchParams.delete('signature')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [toast])

  return (
    <Ctx.Provider value={api}>
      {children}
      {configured ? (
        <SendForSignatureModal
          open={forId !== null}
          rec={offers.records.find((r) => r.id === forId) ?? null}
          onClose={() => setForId(null)}
          onSent={(msg) => offers.toast(msg)}
        />
      ) : null}
    </Ctx.Provider>
  )
}

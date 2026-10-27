import React from 'react'

import { AssignmentsProvider } from '@/components/offers/AssignmentsProvider'
import OfferManager from '@/components/offers/OfferManager'
import { OffersProvider } from '@/components/offers/OffersProvider'
import { PushProvider } from '@/components/offers/PushProvider'
import { SignatureProvider } from '@/components/offers/SignatureProvider'
import { env } from '@/lib/env'

export default function HiringPage() {
  return (
    <OffersProvider>
      <AssignmentsProvider>
        <PushProvider allowPush watermarkToggle>
          <SignatureProvider configured={Boolean(env.DOCUSIGN)}>
            <OfferManager />
          </SignatureProvider>
        </PushProvider>
      </AssignmentsProvider>
    </OffersProvider>
  )
}

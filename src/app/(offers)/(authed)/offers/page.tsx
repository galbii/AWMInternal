import React from 'react'

import { AssignmentsProvider } from '@/components/offers/AssignmentsProvider'
import OfferManager from '@/components/offers/OfferManager'
import { OffersProvider } from '@/components/offers/OffersProvider'
import { PushProvider } from '@/components/offers/PushProvider'

export default function OffersPage() {
  return (
    <OffersProvider>
      <AssignmentsProvider>
        <PushProvider>
          <OfferManager />
        </PushProvider>
      </AssignmentsProvider>
    </OffersProvider>
  )
}

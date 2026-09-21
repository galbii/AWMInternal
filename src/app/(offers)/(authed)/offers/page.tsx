import React from 'react'

import { AssignmentsProvider } from '@/components/offers/AssignmentsProvider'
import OfferManager from '@/components/offers/OfferManager'
import { OffersProvider } from '@/components/offers/OffersProvider'

export default function OffersPage() {
  return (
    <OffersProvider>
      <AssignmentsProvider>
        <OfferManager />
      </AssignmentsProvider>
    </OffersProvider>
  )
}

import React from 'react'

import OfferManager from '@/components/offers/OfferManager'
import { OffersProvider } from '@/components/offers/OffersProvider'

export default function OffersPage() {
  return (
    <OffersProvider>
      <OfferManager />
    </OffersProvider>
  )
}

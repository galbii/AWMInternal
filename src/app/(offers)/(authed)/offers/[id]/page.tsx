// Dynamic offer-letter page: /offers/<recordId> (the frozen 'r…' id, so links
// survive the localStorage->DB migration). Fetched as the VIEWER with real
// access control, so under "view as" this 404s exactly when that user
// couldn't open it.

import { notFound, redirect } from 'next/navigation'
import React from 'react'

import OfferDetail from '@/components/offers/detail/OfferDetail'
import { OffersProvider } from '@/components/offers/OffersProvider'
import { getViewer } from '@/lib/auth/viewer'
import { toOfferRecord } from '@/lib/offers/payload-doc'

export const dynamic = 'force-dynamic'

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const v = await getViewer()
  if (!v) redirect('/login')

  const found = await v.payload.find({
    collection: 'offer-requests',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    user: v.viewer,
    overrideAccess: false,
  })
  const doc = found.docs[0]
  if (!doc) notFound()

  const record = toOfferRecord(doc)

  return (
    <OffersProvider standalone initialRecords={[record]} initialCurrentId={record.id}>
      <OfferDetail
        recordId={record.id}
        name={record.data.employeeName || 'Offer letter'}
        readOnly={v.isEmulating}
      />
    </OffersProvider>
  )
}

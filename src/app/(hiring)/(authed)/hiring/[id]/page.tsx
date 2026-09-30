// The hiring manager's workspace for one request: /hiring/<recordId>.
//
// Identical to /offers/[id] — same OfferDetail, same letter island, same
// activity rail. What differs is decided by membership, not by this file
// (src/lib/offers/official.ts): the letter this viewer generates here is
// stamped SAMPLE until the request is pushed to HR.

import { notFound, redirect } from 'next/navigation'
import React from 'react'

import OfferDetail from '@/components/offers/detail/OfferDetail'
import { OffersProvider } from '@/components/offers/OffersProvider'
import { PushProvider } from '@/components/offers/PushProvider'
import { getViewer } from '@/lib/auth/viewer'
import { toOfferRecord } from '@/lib/offers/payload-doc'

export const dynamic = 'force-dynamic'

export default async function HiringDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      <PushProvider>
        <OfferDetail
          recordId={record.id}
          name={record.data.employeeName || 'Offer letter'}
          readOnly={v.isEmulating && !v.isActing}
        />
      </PushProvider>
    </OffersProvider>
  )
}

'use client'

// Row "Edit" modal on the stage tables: edit who is assigned to the offer
// (admin/dev; read-only list for everyone else), with a jump to the full
// details editor and the offer page.

import Link from 'next/link'
import React from 'react'

import AssignmentsEditor from './AssignmentsEditor'
import Modal from './Modal'

interface AssignModalProps {
  /** null = closed. */
  recordId: string | null
  name: string
  onClose: () => void
  /** Open the classic details form for this record. */
  onEditDetails: () => void
}

export default function AssignModal({
  recordId,
  name,
  onClose,
  onEditDetails,
}: AssignModalProps): React.JSX.Element {
  return (
    <Modal
      open={recordId !== null}
      title={name ? `Assigned users — ${name}` : 'Assigned users'}
      onBackdrop={onClose}
      foot={
        <>
          {recordId && (
            <Link className="btn-light am-page-link" href={`/offers/${recordId}`}>
              Offer page
            </Link>
          )}
          <button className="btn-light" onClick={onEditDetails}>
            Edit details
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {recordId ? <AssignmentsEditor recordId={recordId} /> : <p />}
    </Modal>
  )
}

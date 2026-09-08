'use client'

// Port of S2 886–897 (openModal / closeModal / confirmModal markup) as a
// controlled component. Backdrop click closes, per S2 969.

import React from 'react'

export interface ModalProps {
  open: boolean
  title: string
  /** Modal body (`.body`). */
  children: React.ReactNode
  /** Footer buttons (`.foot`). */
  foot: React.ReactNode
  /** Fired when the backdrop itself is clicked. */
  onBackdrop: () => void
}

export default function Modal({ open, title, children, foot, onBackdrop }: ModalProps) {
  return (
    <div
      className={open ? 'modal-bg show' : 'modal-bg'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdrop()
      }}
    >
      <div className="modal">
        <h3>{title}</h3>
        <div className="body">{children}</div>
        <div className="foot">{foot}</div>
      </div>
    </div>
  )
}

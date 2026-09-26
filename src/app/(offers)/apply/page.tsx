// The public door: /apply. A branch or hiring manager fills in the new-hire
// request here WITHOUT signing in; /api/apply creates the pipeline record.
// Lives in the (offers) route group (same stylesheet and fonts as HR's form)
// but OUTSIDE its (authed) segment, so requireApp never runs for it.
//
// The headline is built here (server copy) and handed to ApplyForm, which
// gives it its own cell in the two-column grid — level with the identity rail.

import type { Metadata } from 'next'
import Image from 'next/image'
import React from 'react'

import ApplyForm from '@/components/offers/apply/ApplyForm'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'New hire request',
  robots: { index: false, follow: false },
}

// The access-code requirement is a deploy-time env setting; never bake it in.
export const dynamic = 'force-dynamic'

export default function ApplyPage(): React.JSX.Element {
  const hero = (
    <header className="apply-hero">
      <h1>Request a new hire</h1>
      <p className="apply-lede">
        Tell HR who is joining, where, and how they will be paid. HR turns this into the offer
        letter, so the more complete it is, the sooner the letter goes out.
      </p>
      <p className="apply-meta">
        Required fields are marked <span className="req">*</span>. Nothing is saved until you send,
        so plan to finish in one sitting.
      </p>
    </header>
  )

  return (
    <div className="apply">
      <div className="session-bar apply-bar">
        <Image className="apply-mark" src="/brand/awm-logo.png" alt="" width={28} height={28} />
        <span className="apply-brand">All Western Mortgage</span>
        <span className="sb-spacer" />
        <span className="apply-bar-note">New hire request</span>
      </div>
      <main className="apply-main">
        <ApplyForm requiresCode={Boolean(env.APPLY_ACCESS_CODE)} hero={hero} />
      </main>
    </div>
  )
}

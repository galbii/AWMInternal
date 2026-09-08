import { redirect } from 'next/navigation'
import React from 'react'

import LoginForm from '@/components/shell/LoginForm'
import { getViewer } from '@/lib/auth/viewer'

export const dynamic = 'force-dynamic'

/** Only accept an internal, single-slash path — never an absolute URL or a
 *  protocol-relative one (`//evil.com`), which browsers treat as a host. */
function safeNext(next: unknown): string | undefined {
  if (typeof next !== 'string') return undefined
  if (!next.startsWith('/') || next.startsWith('//')) return undefined
  return next
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = safeNext(params.next)

  const v = await getViewer()
  if (v) redirect(next || '/')

  return <LoginForm next={next} />
}

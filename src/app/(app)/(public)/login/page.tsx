import { redirect } from 'next/navigation'
import React from 'react'

import LoginForm from '@/components/offers/LoginForm'
import { getViewer } from '@/lib/auth/viewer'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const v = await getViewer()
  if (v) redirect('/')
  return <LoginForm />
}

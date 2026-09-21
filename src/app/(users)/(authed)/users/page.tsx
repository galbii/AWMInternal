// /users — the directory: everyone who can sign in, what they can do, and
// the admin actions on each account. Rendered as the ACTOR: this page exists
// only for admin/dev, so the list is read with overrideAccess and projected
// through src/lib/users/directory.ts (explicit fields, never the raw doc).

import React from 'react'

import UsersDirectory from '@/components/users/UsersDirectory'
import { requireApp } from '@/lib/apps/guard'
import { listDirectory } from '@/lib/users/directory'

export const dynamic = 'force-dynamic'

export default async function UsersPage(): Promise<React.JSX.Element> {
  const v = await requireApp('users')
  const rows = await listDirectory(v.payload)
  return <UsersDirectory rows={rows} me={String(v.actor.id)} canManage={!v.isEmulating} />
}

// The one place an app's `icon` name (registry.ts) becomes a glyph. The hub
// cards, the dock's quick links and the launcher grid all draw through it, so
// an app looks the same everywhere. To give a new app a new icon, add its name
// to `AppIconName` in the registry and one entry here.

import { FileText, Network, UserPlus, Users, type LucideIcon } from 'lucide-react'
import React from 'react'

import type { AppIconName } from '@/lib/apps/registry'

const APP_ICONS: Record<AppIconName, LucideIcon> = {
  'user-plus': UserPlus,
  'file-text': FileText,
  network: Network,
  users: Users,
}

export default function AppIcon({
  name,
  size = 18,
}: {
  name: AppIconName
  size?: number
}): React.JSX.Element {
  const Icon = APP_ICONS[name]
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
}

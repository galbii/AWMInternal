// The name of each list view, in one place.
//
// Three things say it now — the title row above a view, the back control that
// leaves the editor, and the letter's own "back" button — and they must not
// drift, because two of them promise the user where they are about to land.

import type { View } from '@/lib/offers/types'

export type ListView = Exclude<View, 'editor'>

export const VIEW_TITLE: Record<ListView, string> = {
  pipeline: 'Pipeline',
  hired: 'Hired',
  archived: 'Archived',
  all: 'All requests',
  analysis: 'Analysis',
  users: 'Users',
}

/** "Back to Pipeline" — what a control that leaves the editor should say. */
export const backLabel = (v: ListView): string => 'Back to ' + VIEW_TITLE[v]

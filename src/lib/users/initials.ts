// Initials for an avatar disc, from whatever label we have for a person.
// Shared by the session bar's account trigger and the offers app's assignee
// stacks, so the same person gets the same two letters everywhere.

/** "Chance Dev" → "CD"; "chance@example.com" → "C"; never empty. */
export function initialsOf(label: string): string {
  const s = label.trim()
  if (!s) return '?'
  if (s.includes('@') && !s.includes(' ')) return s[0]!.toUpperCase()
  const parts = s.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

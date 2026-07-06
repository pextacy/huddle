// Single UI source of truth for matchday spend categories — key/label/emoji.
// Mirrors src/domain/insights.js CATEGORIES (the domain module the backend uses to tag and roll
// up spend). Kept here so AddExpense (the picker) and ActivityView (raw entries carry only a key)
// share one list; LedgerView renders the emoji/label the insights payload already carries.

export const CATEGORIES = [
  { key: 'tickets', label: 'Tickets', emoji: '⚽' },
  { key: 'food', label: 'Food & drinks', emoji: '🍔' },
  { key: 'travel', label: 'Travel', emoji: '🚗' },
  { key: 'stay', label: 'Stay', emoji: '🏨' },
  { key: 'gear', label: 'Gear', emoji: '🎽' },
  { key: 'other', label: 'Other', emoji: '💸' }
]

const EMOJI = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.emoji]))

/** Emoji for a category key, falling back to the 'other' glyph for missing/unknown keys. */
export function categoryEmoji (key) {
  return EMOJI[key] || EMOJI.other
}

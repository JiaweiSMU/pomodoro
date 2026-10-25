// The main pet: one species you pick to show off. Each focus session finished
// while it is your main pet adds to its bond, and its mood follows how recently
// you focused. Pure functions only (no React, no storage), like coins.js.

// Sessions as main pet needed for each heart.
export const BOND_LEVELS = [5, 15, 30, 60]

const DAY_MS = 86_400_000

// Sessions finished as main pet, by species id.
export function bonds(history) {
  const out = {}
  for (const h of history) if (h.buddy) out[h.buddy] = (out[h.buddy] || 0) + 1
  return out
}

// Hearts earned with this many sessions, and sessions left to the next heart (null at the top).
export function bondLevel(sessions) {
  const hearts = BOND_LEVELS.filter((n) => sessions >= n).length
  return { hearts, toNext: hearts < BOND_LEVELS.length ? BOND_LEVELS[hearts] - sessions : null }
}

// The most hearts any species has earned. Bond rewards in the Closet unlock from this.
export const topHearts = (history) => Math.max(0, ...Object.values(bonds(history)).map((n) => bondLevel(n).hearts))

const dayStart = (t) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 'happy' after a focus session today, 'ready' when the last one was yesterday,
// 'sleepy' after two or more days without one. History is kept in time order.
export function mood(history, now) {
  const last = history.at(-1)?.t
  if (last == null) return 'sleepy'
  // Rounded, so a day that is 23 or 25 hours long (clock changes) still counts as one.
  const days = Math.round((dayStart(now) - dayStart(last)) / DAY_MS)
  return days <= 0 ? 'happy' : days === 1 ? 'ready' : 'sleepy'
}

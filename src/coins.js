// Coins for the Meadow idle game. While a focus timer runs, every owned species
// jumps the fence once per JUMP_MS, taking turns, and each landing pays
// value x copies. Pure functions only (no React, no storage), so the coin count
// and the animation can both be worked out from the same clock.
import { ANIMAL_BY_ID } from './animals.js'

export const JUMP_MS = 10_000
export const COIN_VALUE = { common: 1, rare: 3, legendary: 10 }
// Animation timings: the arc ends exactly at a landing, then "+N" shows for LANDED_MS.
export const ARC_MS = 1_200
export const LANDED_MS = 1_000

// One entry per owned species, in order of first hatch. Unknown ids (a species
// removed from animals.js) are skipped.
export function jumpers(history, byId = ANIMAL_BY_ID) {
  const bySpecies = new Map()
  for (const h of history) {
    const animal = byId[h.animal]
    if (!animal) continue
    const j = bySpecies.get(animal.id)
    if (j) j.copies += 1
    else bySpecies.set(animal.id, { id: animal.id, value: COIN_VALUE[animal.rarity], copies: 1 })
  }
  return [...bySpecies.values()]
}

// Run time at which species i of n lands its first jump; the rest follow every JUMP_MS.
export const jumpOffset = (i, n) => ((i + 1) * JUMP_MS) / n

export const landedJumps = (elapsedMs, offset) =>
  elapsedMs < offset ? 0 : Math.floor((elapsedMs - offset) / JUMP_MS) + 1

export function coinsEarned(elapsedMs, list) {
  return list.reduce((sum, j, i) => sum + j.value * j.copies * landedJumps(elapsedMs, jumpOffset(i, list.length)), 0)
}

export const coinsPerSecond = (list) => list.reduce((sum, j) => sum + j.value * j.copies, 0) / (JUMP_MS / 1000)

// How long the current focus run has been going. 0 unless a focus timer is
// running. Clamped at the end of the session, so a timer that ran out while the
// tab was closed pays for the full session and never more.
export function runElapsedMs(timer, now) {
  if (timer.mode !== 'focus' || !timer.running || timer.runStartRemainingMs == null) return 0
  const remaining = Math.min(timer.totalMs, Math.max(0, timer.endAt - now))
  return Math.max(0, timer.runStartRemainingMs - remaining)
}

// Coins you can spend right now: banked coins plus the landed jumps of the focus
// run in progress. It never drops while a run goes on, and banking the run (pause,
// skip, reset, finish) leaves it unchanged, so spending against it is safe even
// when the price takes the banked coins below 0.
export const coinBalance = (banked, timer, list, now) => banked + coinsEarned(runElapsedMs(timer, now), list)

// Where a species with this offset is in its jump cycle at this run time.
export function jumpPose(elapsedMs, offset) {
  const sinceFirst = elapsedMs - offset
  const u = ((sinceFirst % JUMP_MS) + JUMP_MS) % JUMP_MS // time since the latest landing slot
  if (sinceFirst >= 0 && u < LANDED_MS) return { phase: 'landed', p: u / LANDED_MS }
  if (u >= JUMP_MS - ARC_MS) return { phase: 'jumping', p: (u - (JUMP_MS - ARC_MS)) / ARC_MS }
  return { phase: 'waiting', p: 0 }
}

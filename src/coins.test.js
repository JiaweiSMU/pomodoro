import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANIMALS, FENCE } from './animals.js'
import {
  COIN_VALUE,
  JUMP_MS,
  coinBalance,
  coinsEarned,
  coinsPerSecond,
  jumpOffset,
  jumpPose,
  jumpers,
  runElapsedMs,
} from './coins.js'

const MIN = 60_000
const jumper = (value, copies = 1, id = `s${value}-${copies}`) => ({ id, value, copies })
const commons = (n) => Array.from({ length: n }, (_, i) => jumper(1, 1, `c${i}`))

test('jumpers groups copies by species in order of first hatch', () => {
  const byId = { a: { id: 'a', rarity: 'common' }, b: { id: 'b', rarity: 'legendary' } }
  const history = [{ animal: 'b' }, { animal: 'a' }, { animal: 'b' }, { animal: 'removed-species' }]
  assert.deepEqual(jumpers(history, byId), [
    { id: 'b', value: 10, copies: 2 },
    { id: 'a', value: 1, copies: 1 },
  ])
})

test('every animal rarity has a coin value', () => {
  for (const animal of ANIMALS) assert.ok(COIN_VALUE[animal.rarity] > 0, animal.id)
})

test('no jumpers earns nothing', () => {
  assert.equal(coinsEarned(25 * MIN, []), 0)
})

test('one common over 25 minutes earns 150', () => {
  assert.equal(coinsEarned(25 * MIN, [jumper(1)]), 150)
})

test('copies multiply the payout', () => {
  assert.equal(coinsEarned(25 * MIN, [jumper(1, 3)]), 450)
})

test('rarity values: 10 commons, 2 rares and 1 legendary earn 3,900 in 25 minutes', () => {
  const list = [...commons(10), jumper(3, 1, 'r1'), jumper(3, 1, 'r2'), jumper(10, 1, 'l1')]
  assert.equal(coinsEarned(25 * MIN, list), 3900)
})

test('species take turns: with 5 species one jump has landed at 2 s, none at 1.999 s', () => {
  assert.equal(jumpOffset(0, 5), 2000)
  assert.equal(coinsEarned(1999, commons(5)), 0)
  assert.equal(coinsEarned(2000, commons(5)), 1)
  assert.equal(coinsEarned(JUMP_MS, commons(5)), 5)
})

test('a jump in progress pays nothing until it lands', () => {
  assert.equal(coinsEarned(JUMP_MS - 1, [jumper(10)]), 0)
  assert.equal(coinsEarned(JUMP_MS, [jumper(10)]), 10)
})

test('coinsPerSecond sums value x copies over the jump interval', () => {
  assert.equal(coinsPerSecond([jumper(1, 3), jumper(10)]), 1.3)
  assert.equal(coinsPerSecond([]), 0)
})

test('runElapsedMs for a running focus timer counts from the start of this run', () => {
  const now = 1_000_000
  const fresh = { mode: 'focus', running: true, endAt: now + 20 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 25 * MIN }
  assert.equal(runElapsedMs(fresh, now), 5 * MIN)
  // Resumed after a pause with 15 minutes left: only this run counts.
  const resumed = { ...fresh, endAt: now + 10 * MIN, runStartRemainingMs: 15 * MIN }
  assert.equal(runElapsedMs(resumed, now), 5 * MIN)
})

test('runElapsedMs is 0 when paused, on a break, or saved before coins existed', () => {
  const now = 1_000_000
  const base = { mode: 'focus', running: true, endAt: now + 20 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 25 * MIN }
  assert.equal(runElapsedMs({ ...base, running: false }, now), 0)
  assert.equal(runElapsedMs({ ...base, mode: 'short' }, now), 0)
  const { runStartRemainingMs, ...old } = base
  assert.equal(runElapsedMs(old, now), 0)
})

test('runElapsedMs for an expired timer stops at the end of the session', () => {
  const now = 1_000_000
  const expired = { mode: 'focus', running: true, endAt: now - 5 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 10 * MIN }
  assert.equal(runElapsedMs(expired, now), 10 * MIN)
})

test('jumpPose: waiting, then the arc, then landed, in step with the coins', () => {
  const offset = 5000
  assert.deepEqual(jumpPose(2000, offset), { phase: 'waiting', p: 0 })
  const arc = jumpPose(4400, offset)
  assert.equal(arc.phase, 'jumping')
  assert.equal(arc.p, 0.5)
  assert.deepEqual(jumpPose(5000, offset), { phase: 'landed', p: 0 })
  assert.equal(jumpPose(5500, offset).p, 0.5)
  assert.deepEqual(jumpPose(7000, offset), { phase: 'waiting', p: 0 })
  // Same pose one cycle later.
  assert.deepEqual(jumpPose(5000 + JUMP_MS, offset), { phase: 'landed', p: 0 })
})

test('jumpPose never shows a landing before the first one has paid', () => {
  // Offset 10 s: at 0.5 s the cycle position looks like "just landed", but nothing has landed yet.
  assert.deepEqual(jumpPose(500, 10_000), { phase: 'waiting', p: 0 })
  assert.equal(coinsEarned(500, [jumper(1)]), 0)
})

test('coinBalance is banked coins plus the landed jumps of the run in progress', () => {
  const now = 1_000_000
  const running = { mode: 'focus', running: true, endAt: now + 20 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 25 * MIN }
  // 5 minutes in with one common: 30 jumps have landed.
  assert.equal(coinBalance(100, running, [jumper(1)], now), 130)
  assert.equal(coinBalance(100, { ...running, running: false }, [jumper(1)], now), 100)
})

test('spending live coins takes banked coins below 0, but the balance stays at 0 or more and never drops', () => {
  const start = 1_000_000
  const timer = { mode: 'focus', running: true, endAt: start + 25 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 25 * MIN }
  const list = [jumper(1)]
  const banked = 150 - 200 // had 150 banked, bought a 200-coin item 10 minutes into the run
  assert.equal(coinBalance(banked, timer, list, start + 10 * MIN), 10)
  let last = 0
  for (let now = start + 10 * MIN; now <= start + 30 * MIN; now += 1_000) {
    const balance = coinBalance(banked, timer, list, now)
    assert.ok(balance >= last, `dropped at ${now - start} ms`)
    last = balance
  }
})

test('banking the run (pause, skip, reset or finish) leaves the balance unchanged', () => {
  const start = 1_000_000
  const now = start + 7 * MIN + 4_321
  const timer = { mode: 'focus', running: true, endAt: start + 25 * MIN, totalMs: 25 * MIN, runStartRemainingMs: 25 * MIN }
  const list = [jumper(1, 2), jumper(10)]
  const banked = -40
  const before = coinBalance(banked, timer, list, now)
  // What bank() in useTimer.js does before it stops the run.
  const after = coinBalance(banked + coinsEarned(runElapsedMs(timer, now), list), { ...timer, running: false }, list, now)
  assert.equal(after, before)
})

test('FENCE is a 16x16 sprite whose colours are all in its palette', () => {
  assert.equal(FENCE.px.length, 16)
  for (const row of FENCE.px) {
    assert.equal(row.length, 16, row)
    for (const c of row) if (c !== '.') assert.ok(FENCE.pal[c], `missing colour ${c}`)
  }
})

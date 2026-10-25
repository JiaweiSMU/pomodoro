import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOND_LEVELS, bondLevel, bonds, mood, topHearts } from './buddy.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

test('bonds count only sessions finished with a main pet', () => {
  const history = [{ animal: 'cat' }, { animal: 'cat', buddy: 'shiba' }, { animal: 'dog', buddy: 'shiba' }, { animal: 'fox', buddy: 'cat' }]
  assert.deepEqual(bonds(history), { shiba: 2, cat: 1 })
  assert.deepEqual(bonds([]), {})
})

test('bond level: a heart at each step, and sessions to the next one', () => {
  assert.deepEqual(bondLevel(0), { hearts: 0, toNext: 5 })
  assert.deepEqual(bondLevel(4), { hearts: 0, toNext: 1 })
  assert.deepEqual(bondLevel(5), { hearts: 1, toNext: 10 })
  assert.deepEqual(bondLevel(29), { hearts: 2, toNext: 1 })
  assert.deepEqual(bondLevel(60), { hearts: BOND_LEVELS.length, toNext: null })
  assert.deepEqual(bondLevel(500), { hearts: BOND_LEVELS.length, toNext: null })
})

test('top hearts is the best bond of any species', () => {
  const history = [
    ...Array.from({ length: 16 }, () => ({ animal: 'cat', buddy: 'shiba' })),
    ...Array.from({ length: 6 }, () => ({ animal: 'cat', buddy: 'cat' })),
  ]
  assert.equal(topHearts(history), 2)
  assert.equal(topHearts([]), 0)
})

test('mood: happy today, ready the day after, sleepy after two days', () => {
  const history = [{ t: at(2026, 10, 20, 23) }]
  assert.equal(mood(history, at(2026, 10, 20, 23)), 'happy')
  assert.equal(mood(history, at(2026, 10, 21, 0)), 'ready')
  assert.equal(mood(history, at(2026, 10, 21, 23)), 'ready')
  assert.equal(mood(history, at(2026, 10, 22, 0)), 'sleepy')
  assert.equal(mood(history, at(2026, 11, 30)), 'sleepy')
  assert.equal(mood([], at(2026, 10, 20)), 'sleepy')
})

test('mood counts calendar days across a clock change', () => {
  // London has a 23-hour day on 29 March 2026 and a 25-hour day on 25 October 2026.
  const tz = process.env.TZ
  process.env.TZ = 'Europe/London'
  try {
    assert.equal(mood([{ t: at(2026, 3, 28, 23) }], at(2026, 3, 29, 0)), 'ready')
    assert.equal(mood([{ t: at(2026, 3, 28, 0) }], at(2026, 3, 30, 0)), 'sleepy')
    assert.equal(mood([{ t: at(2026, 10, 24, 0) }], at(2026, 10, 25, 23)), 'ready')
    assert.equal(mood([{ t: at(2026, 10, 25, 0) }], at(2026, 10, 25, 23)), 'happy')
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
})

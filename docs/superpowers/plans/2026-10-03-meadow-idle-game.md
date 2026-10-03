# Meadow Idle Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/meadow` page where every hatched animal takes turns jumping a fence during a running focus session, each landing paying coins that are saved in localStorage.

**Architecture:** Timer, history and coin state move out of `App` into a `useTimer` hook called once by an always-mounted Shell (`App`), which renders `TimerPage` or `MeadowPage` from a ~30-line built-in router. Coin maths and the jump animation timing are pure functions in `coins.js`, so the count and the animation run off the same clock (time since the current focus run started).

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, lucide-react, Node's built-in test runner (`node --test`, Node 25).

**Spec:** `docs/superpowers/specs/2026-10-03-meadow-idle-game-design.md`

## Global Constraints

- No new npm dependencies.
- Coin values: common 1, rare 3, legendary 10. `JUMP_MS = 10_000`.
- Species `i` of `n` lands at run times `(i + 1) × JUMP_MS / n + k × JUMP_MS`; a jump pays `value × copies` when it lands, never part-way.
- Coins are earned only while a **focus** timer is **running**; skip and reset keep coins already earned; pause drops jumps in progress.
- Coins persist in localStorage under `pomodoro.coins` (whole number). Settings > Clear data sets it to 0.
- Only `src/router.jsx` reads or changes the URL to pick a page (Spotify's `/callback` handling in `spotify.js` already exists and notifies the router with a `popstate` event).
- Any path other than `/meadow` shows the Timer page.
- Follow the existing code style: no semicolons, single quotes, 2-space indent, short comments explaining why.

## Review Focus

1. A focus session that ends while the Meadow page is open, or while the tab was closed, must hatch once and bank its coins exactly once (no double banking from `finish` and `goTo`). Pinned by the `runElapsedMs` expired-timer test in Task 1 and manual check 4 in Task 3.
2. Pause and resume several times in one session: each run counts from its own start, not from the session start. Pinned by the "resumed run" `runElapsedMs` test in Task 1.
3. A timer saved by the current version (no `runStartRemainingMs`) must not crash or pay a huge sum. Pinned by the "missing field" test in Task 1 and the migration effect in Task 3.
4. A stored Spotify return path that is missing or not a same-site path (`//evil.example`) must fall back to `/`. Pinned by manual check 5 in Task 4.
5. 42 species at once: the field must not scroll sideways and the page must stay smooth. Pinned by manual check 6 in Task 4.

---

## File map

| File | Task | Responsibility |
| --- | --- | --- |
| `src/coins.js` | 1 | Pure coin maths and jump timing |
| `src/coins.test.js` | 1 | Tests for `coins.js` and the `FENCE` sprite |
| `src/animals.js` | 1 | Add `FENCE` sprite |
| `package.json` | 1 | `"test": "node --test"` |
| `src/Sprite.jsx` | 2 | Shared pixel sprite (moved from `App.jsx`) |
| `src/useTimer.js` | 2, 3 | Timer, history, cycle, parked timers, coins; shared helpers |
| `src/App.jsx` | 2, 3, 4 | Shell + `TimerPage`; `Meadow` renamed `BarCritters` |
| `src/router.jsx` | 4 | `usePath`, `navigate`, `Link` |
| `src/MeadowPage.jsx` | 4 | Meadow page |
| `src/spotify.js` | 4 | Return to the starting page after Spotify login |
| `vercel.json` | 4 | `/meadow` rewrite |
| `README.md` | 5 | Document the Meadow page |
| spec | 5 | Record the implementation choices that differ from the spec |

---

### Task 1: Coin maths and the fence sprite

**Files:**
- Create: `src/coins.js`
- Create: `src/coins.test.js`
- Modify: `src/animals.js` (append `FENCE` after `CRACKS`, before `rollAnimal`)
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `ANIMAL_BY_ID`, `ANIMALS` from `src/animals.js` (each animal has `id`, `rarity` in `'common' | 'rare' | 'legendary'`, `pal`, `px`).
- Produces (all exported from `src/coins.js`):
  - `JUMP_MS: number` (10000), `COIN_VALUE: { common: 1, rare: 3, legendary: 10 }`, `ARC_MS: number` (1200), `LANDED_MS: number` (1000)
  - `jumpers(history: {animal: string}[], byId = ANIMAL_BY_ID): { id: string, value: number, copies: number }[]`, in order of first hatch
  - `jumpOffset(i: number, n: number): number`
  - `landedJumps(elapsedMs: number, offset: number): number`
  - `coinsEarned(elapsedMs: number, list: Jumper[]): number`
  - `coinsPerSecond(list: Jumper[]): number`
  - `runElapsedMs(timer: { mode, running, endAt, totalMs, runStartRemainingMs? }, now: number): number`
  - `jumpPose(elapsedMs: number, offset: number): { phase: 'waiting' | 'jumping' | 'landed', p: number }` (`p` in [0, 1))
  - `FENCE` exported from `src/animals.js`: `{ pal, px }` in the same 16×16 format as `EGG`

- [ ] **Step 1: Add the test script**

In `package.json`, change `"scripts"` to:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `src/coins.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANIMALS, FENCE } from './animals.js'
import {
  COIN_VALUE,
  JUMP_MS,
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

test('FENCE is a 16x16 sprite whose colours are all in its palette', () => {
  assert.equal(FENCE.px.length, 16)
  for (const row of FENCE.px) {
    assert.equal(row.length, 16, row)
    for (const c of row) if (c !== '.') assert.ok(FENCE.pal[c], `missing colour ${c}`)
  }
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` for `./coins.js` (and `FENCE` undefined).

- [ ] **Step 4: Add the fence sprite**

In `src/animals.js`, insert directly before `export function rollAnimal(`:

```js
// Wooden fence for the Meadow page. Same format as the animals.
export const FENCE = {
  pal: { k: '#5A3A1E', w: '#B07A45', W: '#D9A066' },
  px: [
    '................',
    '................',
    '................',
    '.kk..........kk.',
    'kWWk........kWWk',
    'kWwkkkkkkkkkkwWk',
    'kWwWWWWWWWWWWwWk',
    'kWwwwwwwwwwwwwWk',
    'kWwkkkkkkkkkkwWk',
    'kWwk........kwWk',
    'kWwkkkkkkkkkkwWk',
    'kWwWWWWWWWWWWwWk',
    'kWwwwwwwwwwwwwWk',
    'kWwkkkkkkkkkkwWk',
    'kWwk........kwWk',
    'kkkk........kkkk',
  ],
}

```

- [ ] **Step 5: Write `src/coins.js`**

```js
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

// Where a species with this offset is in its jump cycle at this run time.
export function jumpPose(elapsedMs, offset) {
  const sinceFirst = elapsedMs - offset
  const u = ((sinceFirst % JUMP_MS) + JUMP_MS) % JUMP_MS // time since the latest landing slot
  if (sinceFirst >= 0 && u < LANDED_MS) return { phase: 'landed', p: u / LANDED_MS }
  if (u >= JUMP_MS - ARC_MS) return { phase: 'jumping', p: (u - (JUMP_MS - ARC_MS)) / ARC_MS }
  return { phase: 'waiting', p: 0 }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass (`# fail 0`).

- [ ] **Step 7: Commit**

```bash
git add package.json src/animals.js src/coins.js src/coins.test.js
git commit -m "feat: add coin maths and fence sprite for the Meadow idle game"
```

---

### Task 2: Move the timer into `useTimer` and `App` into a Shell (no behaviour change)

**Files:**
- Create: `src/Sprite.jsx`
- Create: `src/useTimer.js`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `rollAnimal`, `ANIMAL_BY_ID` from `src/animals.js`.
- Produces:
  - `src/Sprite.jsx`: `export default memo(Sprite)` with props `{ sprite, size, label?, silhouette?, cracks?, className? }` (unchanged).
  - `src/useTimer.js` exports: `MODES`, `clamp(n, lo, hi)`, `formatTime(ms)`, `usePersistent(key, initial)`, `wakeAudio()`, `chime(kind, volume)`, and `useTimer(s, { onFocusDone, keysEnabled })` returning
    `{ timer, remainingMs, progress, untouched, cycle, lastRound, history, start, pause, toggle, reset, skip, switchTo, setDuration, clearData }`.
    `onFocusDone` receives `{ animal, isNew, count }`. Task 3 adds `coinsBanked` to the returned object.

- [ ] **Step 1: Create `src/Sprite.jsx`**

Move the `Sprite` function from `src/App.jsx` (the "Pixel sprite" section, currently lines 161-211) into a new file, wrapped in `memo` so it skips re-rendering when its props are unchanged (the Meadow page re-renders every animation frame):

```jsx
import { memo, useMemo } from 'react'

// A 16x16 pixel sprite drawn as SVG rectangles.
function Sprite({ sprite, size, label, silhouette = false, cracks, className = '' }) {
  // Merge neighbouring pixels of the same colour into one rectangle per run.
  const runs = useMemo(() => {
    const grid = sprite.px.map((row) => row.split(''))
    for (const [x, y] of cracks || []) grid[y][x] = 'k'
    const out = []
    grid.forEach((row, y) => {
      let x = 0
      while (x < row.length) {
        const c = row[x]
        if (c === '.') {
          x += 1
          continue
        }
        let w = 1
        while (x + w < row.length && row[x + w] === c) w += 1
        out.push({ x, y, w, c })
        x += w
      }
    })
    return out
  }, [sprite, cracks])

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {runs.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fill={silhouette ? 'var(--line)' : sprite.pal[r.c]}
        />
      ))}
    </svg>
  )
}

export default memo(Sprite)
```

- [ ] **Step 2: Create `src/useTimer.js`**

```js
// The timer and finished sessions, shared by every page. The app shell calls
// useTimer() once and hands the result to whichever page is showing, so a
// session that ends on any page still chimes and hatches.
import { useCallback, useEffect, useRef, useState } from 'react'
import { rollAnimal } from './animals.js'

export const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' }

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export function formatTime(ms) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function load(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

// useState that also saves to localStorage.
export function usePersistent(key, initial) {
  const [value, setValue] = useState(() => {
    const saved = load(key)
    if (saved !== undefined) return saved
    return typeof initial === 'function' ? initial() : initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [key, value])
  return [value, setValue]
}

const idleTimer = (mode, minutes) => ({
  mode,
  running: false,
  endAt: 0,
  remainingMs: minutes * 60_000,
  totalMs: minutes * 60_000,
})

// A steady tick that keeps firing when the tab is in the background. Browsers
// slow page timers in hidden tabs to as little as once a minute; timers inside
// a worker are not slowed the same way, so the end-of-session chime stays on time.
function startTicker(onTick) {
  let worker = null
  let url = null
  let interval = null
  const usePageTimer = () => {
    worker?.terminate()
    worker = null
    interval ??= setInterval(onTick, 250)
  }
  try {
    url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250)'], { type: 'text/javascript' }))
    worker = new Worker(url)
    worker.onmessage = onTick
    worker.onerror = usePageTimer // the browser refused the worker: tick from the page instead
  } catch {
    usePageTimer()
  }
  return () => {
    worker?.terminate()
    if (interval) clearInterval(interval)
    if (url) URL.revokeObjectURL(url)
  }
}

/* ----------------------------------------------------------------------------
   Sound: a soft synthesised chime, no audio files
---------------------------------------------------------------------------- */

let audioContext = null

export function wakeAudio() {
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') audioContext.resume()
  } catch {
    /* no audio available */
  }
}

export function chime(kind, volume) {
  if (volume <= 0) return
  wakeAudio()
  if (!audioContext) return
  // Rising for "focus done", falling for "break over".
  const notes = kind === 'focus' ? [523.25, 659.25, 783.99] : [783.99, 587.33]
  notes.forEach((frequency, i) => {
    const at = audioContext.currentTime + i * 0.24
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.4 * volume, at + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1)
    osc.connect(gain).connect(audioContext.destination)
    osc.start(at)
    osc.stop(at + 1.2)
  })
}

/* ----------------------------------------------------------------------------
   The hook
---------------------------------------------------------------------------- */

// `s` is the settings merged with their defaults. `onFocusDone` is called with
// { animal, isNew, count } when a focus session finishes and hatches an animal.
// `keysEnabled` turns Space (start/pause) and Alt+S (skip) on or off.
export function useTimer(s, { onFocusDone, keysEnabled }) {
  // One entry per finished focus session: { t: time, min: length, animal: id }
  const [history, setHistory] = usePersistent('pomodoro.history', [])
  // Focus sessions finished since the last long break.
  const [cycle, setCycle] = usePersistent('pomodoro.cycle', 0)
  const [timer, setTimer] = usePersistent('pomodoro.timer', () => idleTimer('focus', s.focus))
  // Timers left part-way when switching tabs, by mode, so switching back picks up where they were.
  const [parked, setParked] = usePersistent('pomodoro.parked', {})

  const [now, setNow] = useState(Date.now)
  const finishedFor = useRef(0)

  const remainingMs = timer.running ? clamp(timer.endAt - now, 0, timer.totalMs) : timer.remainingMs
  const progress = timer.totalMs ? 1 - remainingMs / timer.totalMs : 0
  const untouched = !timer.running && timer.remainingMs === timer.totalMs
  const volume = s.muted ? 0 : s.volume
  const lastRound = cycle + 1 >= s.interval

  /* --- actions --- */

  const unpark = useCallback(
    (mode) =>
      setParked((p) => {
        const next = { ...p }
        delete next[mode]
        return next
      }),
    [setParked],
  )

  const goTo = useCallback(
    (mode, autostart = false) => {
      const next = idleTimer(mode, s[mode])
      if (autostart) {
        next.running = true
        next.endAt = Date.now() + next.totalMs
      }
      unpark(mode)
      setNow(Date.now())
      setTimer(next)
    },
    [s, setTimer, unpark],
  )

  // Tab switch: pause and park the current timer, bring back the target's parked timer if any.
  const switchTo = (mode) => {
    if (mode === timer.mode) return
    const left = timer.running
      ? { ...timer, running: false, remainingMs: clamp(timer.endAt - Date.now(), 0, timer.totalMs) }
      : timer
    const back = parked[mode]
    setParked((p) => {
      const next = { ...p, [timer.mode]: left }
      if (left.remainingMs === left.totalMs) delete next[timer.mode]
      delete next[mode]
      return next
    })
    setNow(Date.now())
    setTimer(back ?? idleTimer(mode, s[mode]))
  }

  const start = useCallback(() => {
    wakeAudio() // browsers only allow sound after a click or key press
    setNow(Date.now())
    setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remainingMs }))
  }, [setTimer])

  const pause = useCallback(() => {
    setTimer((t) => ({ ...t, running: false, remainingMs: clamp(t.endAt - Date.now(), 0, t.totalMs) }))
  }, [setTimer])

  const toggle = useCallback(() => (timer.running ? pause() : start()), [timer.running, pause, start])
  const reset = useCallback(() => goTo(timer.mode), [goTo, timer.mode])
  // Skipping a focus session moves on without hatching anything.
  const skip = useCallback(() => goTo(timer.mode === 'focus' ? 'short' : 'focus'), [goTo, timer.mode])

  const setDuration = useCallback(
    (mode, minutes) => {
      setTimer((t) => (t.mode === mode && !t.running ? idleTimer(mode, minutes) : t))
      unpark(mode)
    },
    [setTimer, unpark],
  )

  const finish = useCallback(() => {
    chime(timer.mode, volume)
    if (timer.mode !== 'focus') {
      goTo('focus', s.autoFocus)
      return
    }
    const minutes = Math.round(timer.totalMs / 60_000)
    const animal = rollAnimal(minutes, lastRound)
    const owned = history.filter((h) => h.animal === animal.id).length
    // Dated when the timer ran out, which may be earlier if the tab was closed.
    setHistory((list) => [...list, { t: Math.min(timer.endAt, Date.now()), min: minutes, animal: animal.id }])
    setCycle(lastRound ? 0 : cycle + 1)
    onFocusDone?.({ animal, isNew: owned === 0, count: owned + 1 })
    goTo(lastRound ? 'long' : 'short', s.autoBreak)
  }, [timer.mode, timer.totalMs, timer.endAt, volume, goTo, s.autoFocus, s.autoBreak, lastRound, history, setHistory, setCycle, cycle, onFocusDone])

  const clearData = useCallback(() => {
    setHistory([])
    setCycle(0)
  }, [setHistory, setCycle])

  /* --- effects --- */

  useEffect(() => {
    if (!timer.running) return undefined
    return startTicker(() => setNow(Date.now()))
  }, [timer.running])

  useEffect(() => {
    if (timer.running && now >= timer.endAt && finishedFor.current !== timer.endAt) {
      finishedFor.current = timer.endAt
      finish()
    }
  }, [now, timer.running, timer.endAt, finish])

  useEffect(() => {
    document.documentElement.dataset.mode = timer.mode
  }, [timer.mode])

  useEffect(() => {
    document.title = `(${formatTime(remainingMs)}) ${MODES[timer.mode]} - Pomodoro`
  }, [remainingMs, timer.mode])

  // Space starts and pauses; Alt+S skips.
  useEffect(() => {
    if (!keysEnabled) return undefined
    const onKey = (e) => {
      if (e.altKey && e.code === 'KeyS') {
        e.preventDefault()
        skip()
        return
      }
      const el = e.target
      const interactive = el.closest?.('input, textarea, select, button, a, [contenteditable="true"]')
      if (e.code === 'Space' && !interactive && !e.repeat) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keysEnabled, skip, toggle])

  return {
    timer,
    remainingMs,
    progress,
    untouched,
    cycle,
    lastRound,
    history,
    start,
    pause,
    toggle,
    reset,
    skip,
    switchTo,
    setDuration,
    clearData,
  }
}
```

Note: the old `setDuration` in `App` also saved the new length to settings. Settings stay in the Shell, so the Shell wraps it (Step 3). `<a>` is added to the `interactive` list so Space on a focused nav link follows the link instead of toggling the timer.

- [ ] **Step 3: Rewrite `src/App.jsx` as the Shell**

3a. Replace the imports at the top of the file (lines 1-24) with:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  SkipForward,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { ANIMALS, ANIMAL_BY_ID, CRACKS, EGG, RARITY } from './animals.js'
import IconButton from './IconButton.jsx'
import Sprite from './Sprite.jsx'
import { SpotifyBar, useSpotify } from './SpotifyBar.jsx'
import * as spotify from './spotify.js'
import { MODES, chime, clamp, formatTime, usePersistent, useTimer } from './useTimer.js'
```

(Keep `useCallback` in the import only if a remaining component still uses it: run `grep -n useCallback src/App.jsx` after Step 3c and add it back if any match.)

3b. Delete these now-moved blocks from `src/App.jsx`:
- `const MODES = ...` (line 30)
- `const clamp = ...` (line 47)
- `function formatTime` (lines 50-55)
- `function load` and `function usePersistent` (lines 64-88)
- `const idleTimer` (lines 90-96)
- `function startTicker` (lines 98-123)
- the whole "Sound" section: `let audioContext`, `wakeAudio`, `chime` (lines 125-159)
- the whole "Pixel sprite" section with `function Sprite` (lines 161-211)

Keep `DEFAULT_SETTINGS`, `MIN_MINUTES`, `MAX_MINUTES`, `plural`, `formatMinutes` and every component from `NumberField` to `SettingsModal`.

3c. Rename the Spotify-bar component so it does not clash with the Meadow page. Change the section comment and function name:

```jsx
/* ----------------------------------------------------------------------------
   Hatched animals wandering along the top of the Spotify bar
---------------------------------------------------------------------------- */

function BarCritters({ history }) {
```

(The body is unchanged.)

3d. Replace everything from the `App` section comment to the end of the file (the old `export default function App() { ... }`) with:

```jsx
/* ----------------------------------------------------------------------------
   Timer page
---------------------------------------------------------------------------- */

function TimerPage({ t, s, setDuration, tasks, setTasks, activeTaskId, setActiveTaskId }) {
  const { timer, remainingMs, progress, untouched, cycle, lastRound, history } = t
  const latest = history.length ? ANIMAL_BY_ID[history.at(-1).animal] : null
  const activeTask = tasks.find((task) => task.id === activeTaskId && !task.completed)
  const crackStage = Math.min(3, Math.floor(progress * 4))

  let caption
  if (timer.mode === 'focus') {
    caption = lastRound
      ? `Round ${cycle + 1} of ${s.interval}: a rare animal or better`
      : `Round ${cycle + 1} of ${s.interval}`
  } else {
    caption = latest ? `${latest.name} is keeping you company` : 'Step away for a bit'
  }

  return (
    <main className="mx-auto grid max-w-6xl grid-cols-1 gap-x-16 gap-y-12 px-4 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
      <div className="min-w-0">
        <div className="flex justify-center">
          <Segmented
            label="Timer mode"
            options={Object.entries(MODES).map(([value, label]) => ({ value, label }))}
            value={timer.mode}
            onChange={t.switchTo}
          />
        </div>

        <div className="mt-8">
          <Ring progress={progress}>
            {timer.mode === 'focus' || !latest ? (
              <Sprite
                sprite={EGG}
                size={96}
                cracks={timer.mode === 'focus' ? CRACKS[crackStage] : CRACKS[0]}
                label={timer.mode === 'focus' ? 'An egg, waiting to hatch' : 'An egg'}
              />
            ) : (
              <Sprite sprite={latest} size={96} label={latest.name} />
            )}
            <div
              className="mt-1 flex font-pixel text-7xl leading-none sm:text-8xl"
              role="timer"
              aria-label={`${formatTime(remainingMs)} remaining`}
            >
              {/* One fixed-width cell per character, so the digits do not shift as they change. */}
              {formatTime(remainingMs)
                .split('')
                .map((char, i) => (
                  <span key={i} aria-hidden="true" className={`text-center ${char === ':' ? 'w-[0.28em]' : 'w-[0.5em]'}`}>
                    {char}
                  </span>
                ))}
            </div>
            <p className="mt-2 max-w-[13rem] text-center text-sm leading-snug text-muted">{caption}</p>
          </Ring>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <IconButton label="Reset timer" onClick={t.reset} disabled={untouched} size="size-12">
            <RotateCcw size={22} aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            onClick={t.toggle}
            data-pressed={timer.running}
            className="key flex h-14 w-44 items-center justify-center gap-2 font-pixel text-3xl"
          >
            {timer.running ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
            {timer.running ? 'Pause' : untouched ? 'Start' : 'Resume'}
          </button>
          <IconButton label="Skip to the next timer (Alt+S)" onClick={t.skip} size="size-12">
            <SkipForward size={22} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="mt-7 flex min-h-[4.75rem] flex-col items-center gap-2">
          {timer.running ? (
            activeTask && (
              <p className="max-w-full truncate text-sm text-muted">
                Working on <span className="font-medium text-ink">{activeTask.title}</span>
              </p>
            )
          ) : (
            <>
              <div className="flex items-center gap-1">
                <IconButton
                  label="One minute less"
                  disabled={s[timer.mode] <= MIN_MINUTES}
                  onClick={() => setDuration(timer.mode, s[timer.mode] - 1)}
                >
                  <Minus size={18} aria-hidden="true" />
                </IconButton>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <NumberField
                    value={s[timer.mode]}
                    min={MIN_MINUTES}
                    max={MAX_MINUTES}
                    onChange={(n) => setDuration(timer.mode, n)}
                    aria-label={`${MODES[timer.mode]} length in minutes`}
                    className="h-10 w-16 text-base font-medium"
                  />
                  minutes
                </label>
                <IconButton
                  label="One minute more"
                  disabled={s[timer.mode] >= MAX_MINUTES}
                  onClick={() => setDuration(timer.mode, s[timer.mode] + 1)}
                >
                  <Plus size={18} aria-hidden="true" />
                </IconButton>
              </div>
              {timer.mode === 'focus' && (
                <p className="text-center text-sm text-muted">
                  Finish the session to hatch the egg. Longer sessions hatch rarer animals.
                </p>
              )}
            </>
          )}
        </div>

        <Tasks tasks={tasks} setTasks={setTasks} activeId={activeTaskId} setActiveId={setActiveTaskId} />
      </div>

      <div className="min-w-0">
        <History history={history} />
        <Collection history={history} />
      </div>
    </main>
  )
}

/* ----------------------------------------------------------------------------
   App shell: header, the current page, Spotify bar and pop-ups
---------------------------------------------------------------------------- */

export default function App() {
  const [settings, setSettings] = usePersistent('pomodoro.settings', DEFAULT_SETTINGS)
  const s = useMemo(() => ({ ...DEFAULT_SETTINGS, ...settings }), [settings])
  const theme = s.theme ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

  const [tasks, setTasks] = usePersistent('pomodoro.tasks', [])
  const [activeTaskId, setActiveTaskId] = usePersistent('pomodoro.activeTask', null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hatched, setHatched] = useState(null)
  const sp = useSpotify()

  const t = useTimer(s, {
    keysEnabled: !settingsOpen && hatched == null,
    onFocusDone: (result) => {
      setTasks((list) => list.map((task) => (task.id === activeTaskId ? { ...task, done: task.done + 1 } : task)))
      setHatched(result)
    },
  })

  // Changing a length is saved to settings and applied to an idle timer in that mode.
  const setDuration = (mode, minutes) => {
    setSettings((prev) => ({ ...prev, [mode]: minutes }))
    t.setDuration(mode, minutes)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="min-h-dvh pb-32">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Sprite sprite={EGG} size={32} />
          <h1 className="font-pixel text-3xl">Pomodoro</h1>
        </div>
        <div className="flex items-center">
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setSettings((prev) => ({ ...prev, theme: theme === 'dark' ? 'light' : 'dark' }))}
          >
            {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <TimerPage
        t={t}
        s={s}
        setDuration={setDuration}
        tasks={tasks}
        setTasks={setTasks}
        activeTaskId={activeTaskId}
        setActiveTaskId={setActiveTaskId}
      />

      <SpotifyBar sp={sp} onOpenSettings={() => setSettingsOpen(true)}>
        <BarCritters history={t.history} />
      </SpotifyBar>

      {settingsOpen && (
        <SettingsModal
          settings={s}
          setSettings={setSettings}
          setDuration={setDuration}
          sp={sp}
          onClose={() => setSettingsOpen(false)}
          onClearData={() => {
            t.clearData()
            setTasks([])
            setActiveTaskId(null)
          }}
        />
      )}

      {hatched && (
        <HatchModal
          hatched={hatched}
          breakLabel={MODES[t.timer.mode]}
          breakRunning={t.timer.running}
          onClose={() => setHatched(null)}
          onStartBreak={() => {
            setHatched(null)
            t.start()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Check nothing still refers to moved names**

Run: `grep -nE "\b(idleTimer|startTicker|wakeAudio|audioContext|load\(|function Sprite|function Meadow|<Meadow)\b" src/App.jsx`
Expected: no output.

- [ ] **Step 5: Build and test**

Run: `npm run build && npm test`
Expected: build succeeds with no errors; tests pass.

- [ ] **Step 6: Manual check (no behaviour change)**

Run `npm run dev`, open http://127.0.0.1:5173 and check:
1. Start, pause, resume, reset and skip work; Space and Alt+S work; Space does nothing while Settings is open.
2. Switch Focus → Short break → Focus mid-session: the focus timer comes back where it was.
3. Set focus to 1 minute, finish a session: chime plays, hatch pop-up opens, the active task's count goes up, History and Collection update, the animal walks on the Spotify bar.
4. Change a length with the stepper and in Settings: both stay in sync and survive a reload.
5. Settings > Delete all sessions, animals and tasks still clears everything.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/Sprite.jsx src/useTimer.js
git commit -m "refactor: move timer state into useTimer and Sprite into its own file"
```

---

### Task 3: Bank coins from focus runs

**Files:**
- Modify: `src/useTimer.js`
- Modify: `src/App.jsx` (Settings clear-data copy)

**Interfaces:**
- Consumes: `coinsEarned`, `jumpers`, `runElapsedMs` from `src/coins.js` (Task 1).
- Produces: `useTimer(...)` also returns `coinsBanked: number`. The timer object gains `runStartRemainingMs: number` while running. `clearData()` also resets coins.

- [ ] **Step 1: Import the coin functions**

In `src/useTimer.js`, after `import { rollAnimal } from './animals.js'` add:

```js
import { coinsEarned, jumpers, runElapsedMs } from './coins.js'
```

and update the file's top comment to:

```js
// The timer, finished sessions and coins, shared by every page. The app shell
// calls useTimer() once and hands the result to whichever page is showing, so
// a session that ends on any page still chimes, hatches and pays out.
```

- [ ] **Step 2: Add the coins state and `bank`**

In `useTimer`, after the `parked` state line add:

```js
  // Coins from finished focus runs. The run in progress is added on top by the Meadow page.
  const [coinsBanked, setCoinsBanked] = usePersistent('pomodoro.coins', 0)
```

After the line `const lastRound = cycle + 1 >= s.interval` add:

```js
  // Adds the coins of the focus run in progress, if any. Called before anything
  // stops or replaces a running timer, so every run is paid exactly once.
  const bank = useCallback(() => {
    const earned = coinsEarned(runElapsedMs(timer, Date.now()), jumpers(history))
    if (earned) setCoinsBanked((c) => c + earned)
  }, [timer, history, setCoinsBanked])
```

- [ ] **Step 3: Record when each run starts, and bank when it stops**

Replace `goTo` with:

```js
  const goTo = useCallback(
    (mode, autostart = false) => {
      bank()
      const next = idleTimer(mode, s[mode])
      if (autostart) {
        next.running = true
        next.endAt = Date.now() + next.totalMs
        next.runStartRemainingMs = next.totalMs
      }
      unpark(mode)
      setNow(Date.now())
      setTimer(next)
    },
    [bank, s, setTimer, unpark],
  )
```

In `switchTo`, add `bank()` right after `if (mode === timer.mode) return`:

```js
  const switchTo = (mode) => {
    if (mode === timer.mode) return
    bank()
```

Replace `start` and `pause` with:

```js
  const start = useCallback(() => {
    wakeAudio() // browsers only allow sound after a click or key press
    setNow(Date.now())
    setTimer((t) => ({ ...t, running: true, endAt: Date.now() + t.remainingMs, runStartRemainingMs: t.remainingMs }))
  }, [setTimer])

  const pause = useCallback(() => {
    bank()
    setTimer((t) => ({ ...t, running: false, remainingMs: clamp(t.endAt - Date.now(), 0, t.totalMs) }))
  }, [bank, setTimer])
```

In `finish`, replace the final line `goTo(lastRound ? 'long' : 'short', s.autoBreak)` with:

```js
    // goTo banks this session's coins, using the animals owned before this one hatched.
    goTo(lastRound ? 'long' : 'short', s.autoBreak)
```

(`finish` must not call `bank()` itself: `goTo` already does, and calling both would pay twice.)

Replace `clearData` with:

```js
  const clearData = useCallback(() => {
    setHistory([])
    setCycle(0)
    setCoinsBanked(0)
  }, [setHistory, setCycle, setCoinsBanked])
```

- [ ] **Step 4: Migrate a timer saved before coins existed**

Add this effect directly before the ticker effect (`if (!timer.running) return undefined`):

```js
  // A timer saved by a version without coins has no run start: count its run from now.
  useEffect(() => {
    if (timer.running && timer.runStartRemainingMs == null) {
      setTimer((t) => ({ ...t, runStartRemainingMs: clamp(t.endAt - Date.now(), 0, t.totalMs) }))
    }
  }, [timer.running, timer.runStartRemainingMs, setTimer])
```

- [ ] **Step 5: Return the banked coins**

In the returned object, add `coinsBanked,` after `history,`.

- [ ] **Step 6: Mention coins in Clear data**

In `src/App.jsx` `SettingsModal`, change the two clear-data strings:

```jsx
            <span className="flex-1">Delete all sessions, animals, coins and tasks? This cannot be undone.</span>
```

```jsx
            Delete all sessions, animals, coins and tasks
```

- [ ] **Step 7: Build and test**

Run: `npm run build && npm test`
Expected: build succeeds; tests pass.

- [ ] **Step 8: Manual check with the browser console**

Run `npm run dev`, open http://127.0.0.1:5173, open DevTools > Console. Make sure at least one animal is hatched (finish a 1-minute focus session if History is empty).
1. Note `localStorage['pomodoro.coins']` (missing or `0`). Start a focus session, wait 25 s, press Pause. `JSON.parse(localStorage['pomodoro.timer']).runStartRemainingMs` was set, and `pomodoro.coins` grew by the coins for 25 s (`coinsPerSecond × 25`, give or take one jump per species).
2. Resume, wait 15 s, press Skip: coins grow again (only for those 15 s), no animal hatches.
3. Start, wait 5 s, Reset: coins grow by the jumps landed in 5 s (0 if you own only one species).
4. Set focus to 1 minute and let it finish: the hatch pop-up opens and coins grow by exactly one minute's worth (one common alone: +6). Not twice that.
5. Start a 1-minute focus, close the tab, wait over a minute, reopen: the session hatches and coins grow by one minute's worth.
6. Settings > Delete all sessions, animals, coins and tasks: `pomodoro.coins` becomes `0`.

- [ ] **Step 9: Commit**

```bash
git add src/useTimer.js src/App.jsx
git commit -m "feat: bank coins from running focus sessions"
```

---

### Task 4: Router, navigation and the Meadow page

**Files:**
- Create: `src/router.jsx`
- Create: `src/MeadowPage.jsx`
- Modify: `src/App.jsx` (header nav, page switch)
- Modify: `src/spotify.js` (return path)
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `useTimer` result `t` (`timer`, `remainingMs`, `untouched`, `toggle`, `history`, `coinsBanked`), `MODES`, `formatTime` from `src/useTimer.js`; `jumpers`, `jumpOffset`, `jumpPose`, `coinsEarned`, `coinsPerSecond`, `runElapsedMs` from `src/coins.js`; `FENCE`, `ANIMAL_BY_ID` from `src/animals.js`; `Sprite` from `src/Sprite.jsx`.
- Produces: `src/router.jsx` exports `usePath(): string`, `navigate(path: string): void`, `Link({ to, ...anchorProps })`. `src/MeadowPage.jsx` default-exports `MeadowPage({ t })`.

- [ ] **Step 1: Create `src/router.jsx`**

```jsx
// Page switching with the browser's own history. This is the only code that
// reads or changes the URL to pick a page; to move to react-router later,
// replace this file and the page switch in App.jsx.
import { useSyncExternalStore } from 'react'

const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  window.addEventListener('popstate', listener) // Back and Forward
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname)

export function navigate(path) {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  listeners.forEach((listener) => listener())
}

// An <a> that switches page without reloading. Ctrl/Cmd/Shift-click and
// middle-click are left to the browser, so "open in new tab" still works.
export function Link({ to, onClick, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    />
  )
}
```

- [ ] **Step 2: Create `src/MeadowPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Coins, Pause, Play } from 'lucide-react'
import { ANIMAL_BY_ID, FENCE } from './animals.js'
import { coinsEarned, coinsPerSecond, jumpOffset, jumpPose, jumpers, runElapsedMs } from './coins.js'
import Sprite from './Sprite.jsx'
import { MODES, formatTime } from './useTimer.js'

const SPRITE_PX = 40
const ARC_PX = 72 // height of a jump at its top

// Date.now() on every animation frame while `active`. Browsers pause animation
// frames in hidden tabs; every position is worked out from the clock, so the
// animals are back in step the moment the tab is visible again.
function useFrameNow(active) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return undefined
    let id = requestAnimationFrame(function tick() {
      setNow(Date.now())
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [active])
  return now
}

// Waiting spots (centre, % of the field width) spread over the left side; each
// species lands at the mirror of its spot on the right of the fence.
const spotX = (i, n) => (n === 1 ? 25 : 6 + (32 * i) / (n - 1))

function Jumper({ jumper, index, count, elapsed, active, reduced }) {
  const from = spotX(index, count)
  const pose = active ? jumpPose(elapsed, jumpOffset(index, count)) : { phase: 'waiting', p: 0 }
  let x = from
  let y = 0
  let opacity = 1
  if (pose.phase === 'jumping' && !reduced) {
    const p = Math.round(pose.p * 12) / 12 // move in steps, like the pixel art
    x = from + (100 - 2 * from) * p
    y = -4 * ARC_PX * p * (1 - p)
  } else if (pose.phase === 'landed') {
    x = 100 - from
    opacity = 1 - pose.p
  }
  return (
    <div
      className="absolute bottom-6 flex flex-col items-center"
      style={{ left: `${x}%`, transform: `translate(-50%, ${y}px)`, opacity, zIndex: pose.phase === 'waiting' ? 0 : 1 }}
    >
      {pose.phase === 'landed' && (
        <span
          className="font-pixel text-xl text-accent"
          style={{ transform: `translateY(${-pose.p * 16}px)` }}
        >
          +{jumper.value * jumper.copies}
        </span>
      )}
      <Sprite sprite={ANIMAL_BY_ID[jumper.id]} size={SPRITE_PX} />
      {jumper.copies > 1 && <span className="text-xs tabular-nums text-muted">×{jumper.copies}</span>}
    </div>
  )
}

export default function MeadowPage({ t }) {
  const { timer, remainingMs, untouched, toggle, history, coinsBanked } = t
  const list = useMemo(() => jumpers(history), [history])
  const active = timer.mode === 'focus' && timer.running
  const now = useFrameNow(active)
  const elapsed = runElapsedMs(timer, now)
  const coins = coinsBanked + coinsEarned(elapsed, list)
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const total = list.reduce((n, j) => n + j.copies, 0)

  let caption = ''
  if (!list.length) caption = 'Finish a focus session to hatch your first jumper'
  else if (timer.mode !== 'focus') caption = 'Resting during the break'
  else if (!timer.running) caption = 'Start a focus session to get them jumping'

  return (
    <main className="mx-auto max-w-6xl px-4 pt-2 sm:px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="text-sm text-muted">{MODES[timer.mode]}</span>
          <span className="font-pixel text-5xl leading-none tabular-nums" role="timer" aria-label={`${formatTime(remainingMs)} remaining`}>
            {formatTime(remainingMs)}
          </span>
          <button
            type="button"
            onClick={toggle}
            data-pressed={timer.running}
            className="key flex h-12 w-36 items-center justify-center gap-2 font-pixel text-2xl"
          >
            {timer.running ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
            {timer.running ? 'Pause' : untouched ? 'Start' : 'Resume'}
          </button>
        </div>

        <div>
          <p className="flex items-center justify-center gap-3 font-pixel text-6xl leading-none">
            <Coins size={40} aria-hidden="true" className="text-accent" />
            <span className="tabular-nums" aria-hidden="true">{coins.toLocaleString()}</span>
            <span className="sr-only">{coins.toLocaleString()} coins</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            +{coinsPerSecond(list).toFixed(1)} coins/s · {total} {total === 1 ? 'jumper' : 'jumpers'}
          </p>
        </div>
      </div>

      <div className="relative mt-10 h-48 overflow-hidden rounded-xl border border-line bg-surface" aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 h-6 bg-accent-soft" />
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <Sprite sprite={FENCE} size={56} />
        </div>
        {list.map((jumper, i) => (
          <Jumper
            key={jumper.id}
            jumper={jumper}
            index={i}
            count={list.length}
            elapsed={elapsed}
            active={active}
            reduced={reduced}
          />
        ))}
      </div>
      <p className="mt-3 min-h-5 text-center text-sm text-muted">{caption}</p>
    </main>
  )
}
```

- [ ] **Step 3: Add the nav and page switch to the Shell**

In `src/App.jsx`, add to the imports:

```jsx
import MeadowPage from './MeadowPage.jsx'
import { Link, usePath } from './router.jsx'
```

Above the "App shell" section comment, add:

```jsx
const PAGES = [
  { to: '/', label: 'Timer' },
  { to: '/meadow', label: 'Meadow' },
]

function PageNav({ page }) {
  return (
    <nav aria-label="Pages" className="order-last w-full sm:order-none sm:w-auto">
      <div className="mx-auto flex w-fit rounded-lg border border-line bg-surface p-1">
        {PAGES.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            aria-current={page === to ? 'page' : undefined}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              page === to ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
```

In `App`, after `const sp = useSpotify()` add:

```jsx
  // Anything other than /meadow (including /callback) shows the timer.
  const page = usePath() === '/meadow' ? '/meadow' : '/'
```

Change the header's opening tag to wrap on narrow screens, and put the nav between the title and the buttons:

```jsx
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Sprite sprite={EGG} size={32} />
          <h1 className="font-pixel text-3xl">Pomodoro</h1>
        </div>
        <PageNav page={page} />
        <div className="flex items-center">
```

(The rest of the header is unchanged.)

Replace the `<TimerPage ... />` element with:

```jsx
      {page === '/meadow' ? (
        <MeadowPage t={t} />
      ) : (
        <TimerPage
          t={t}
          s={s}
          setDuration={setDuration}
          tasks={tasks}
          setTasks={setTasks}
          activeTaskId={activeTaskId}
          setActiveTaskId={setActiveTaskId}
        />
      )}
```

- [ ] **Step 4: Return to the starting page after Spotify login**

In `src/spotify.js`, after `const CLIENT_ID_KEY = 'pomodoro.spotify.clientId'` add:

```js
// Page to return to after the Spotify login (per tab, so sessionStorage).
const RETURN_KEY = 'pomodoro.spotify.return'
```

In `login()`, directly before `window.location.assign(url.toString())` add:

```js
  sessionStorage.setItem(RETURN_KEY, window.location.pathname)
```

In `finishLogin()`, replace the line `window.history.replaceState(null, '', '/')` with:

```js
    // Back to the page the login started from. Only same-site paths are accepted;
    // the popstate event tells the router the path changed.
    const back = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    const safe = back && back.startsWith('/') && !back.startsWith('//') && back !== '/callback'
    window.history.replaceState(null, '', safe ? back : '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
```

- [ ] **Step 5: Serve `/meadow` on Vercel**

Replace `vercel.json` with:

```json
{
  "rewrites": [
    { "source": "/callback", "destination": "/index.html" },
    { "source": "/meadow", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 6: Build and test**

Run: `npm run build && npm test`
Expected: build succeeds; tests pass.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open http://127.0.0.1:5173:
1. Click **Meadow**: URL becomes `/meadow`, no reload, the link is highlighted. Click **Timer**: back to `/`. Browser Back and Forward move between them. Reloading `/meadow` opens the Meadow page.
2. On Meadow, press Start: animals take turns hopping the fence; each landing shows "+N" and the coin counter rises by N at that moment. Space pauses and resumes.
3. Mid-session, go to Timer and back: the timer kept running and the coin count did not reset.
4. Set focus to 1 minute (Timer page), go to Meadow, start, let it finish: hatch pop-up opens on Meadow; the caption reads "Resting during the break"; the new animal is waiting in line.
5. Spotify: in Settings > Connect Spotify from the Meadow page; after approving you land on `/meadow`. In the console, run `sessionStorage.setItem('pomodoro.spotify.return', '//evil.example')`, then visit `/callback?error=access_denied`: you land on `/` (Timer), not on another site.
6. Many species: in the console run
   `localStorage['pomodoro.history'] = JSON.stringify((await import('/src/animals.js')).ANIMALS.map((a, i) => ({ t: Date.now() - i, min: 25, animal: a.id })))`
   and reload. On Meadow with a running focus timer: 42 animals, no sideways scroll at 360 px width (DevTools device mode), animation smooth. (Back up `pomodoro.history` first if it matters: `copy(localStorage['pomodoro.history'])`.)
7. Switch to dark mode and turn on "Emulate CSS prefers-reduced-motion: reduce" (DevTools > Rendering): no arcs, animals move straight across at landing; coins still count.
8. Hide the tab for 30 s during a focus run, come back: animals are in step with the coin count immediately.

- [ ] **Step 8: Commit**

```bash
git add src/router.jsx src/MeadowPage.jsx src/App.jsx src/spotify.js vercel.json
git commit -m "feat: add Meadow page where animals jump a fence for coins"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-03-meadow-idle-game-design.md`

**Interfaces:**
- Consumes: the finished feature from Tasks 1-4.
- Produces: nothing used by code.

- [ ] **Step 1: README feature list**

In `README.md`, under "## What it does", after the **Rewards** bullet add:

```markdown
- **Meadow**: a second page (`/meadow`). While a focus session runs, every
  animal you have hatched takes turns jumping a fence, and each jump earns
  coins: 1 for a common animal, 3 for a rare, 10 for a legendary, times how
  many of it you have. Coins are earned from focus time, so they keep counting
  on the Timer page, in another tab, or with the browser closed. They are only
  saved for now.
```

Change the local-storage sentence to:

```markdown
Everything (settings, tasks, history, animals, coins) is saved in your browser's
local storage. It stays on that browser and device, and is not synced.
```

- [ ] **Step 2: README "Changing things" table**

Replace the table with:

```markdown
| To change | Edit |
| --- | --- |
| Animals, their pixels and colours, the odds, the fence | `src/animals.js` |
| Coin values and how often animals jump | `src/coins.js` |
| Colours for each mode, light and dark | `src/index.css` |
| The timer and saved sessions | `src/useTimer.js` |
| The timer page, tasks, chart, collection and Settings | `src/App.jsx` |
| The Meadow page | `src/MeadowPage.jsx` |
| The Spotify bar and playlist list | `src/SpotifyBar.jsx` |
| How the site talks to Spotify | `src/spotify.js` |
```

Add after the "Run it on your computer" code block:

```markdown
`npm test` runs the coin tests.
```

- [ ] **Step 3: Record implementation choices in the spec**

Append to `docs/superpowers/specs/2026-10-03-meadow-idle-game-design.md`:

```markdown
## Implementation notes

Choices made while planning that differ from the design above:

- The router is `src/router.jsx` (not `.js`) because it contains JSX.
- The jump animation is driven by `requestAnimationFrame` and the pure `jumpPose()` in `coins.js`, not CSS keyframes with computed delays. Every frame works out each animal's position from the run clock, so no resync on `visibilitychange` is needed, and reduced motion is handled in JS (the global reduced-motion CSS rule would otherwise cut CSS animations to 1 ms). `src/index.css` is unchanged.
- Each species has a fixed waiting spot on the left and lands at its mirror on the right, then fades back to its spot, instead of rejoining the back of a moving line.
```

- [ ] **Step 4: Full check**

Run: `npm run build && npm test`
Expected: build succeeds; tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-03-meadow-idle-game-design.md
git commit -m "docs: describe the Meadow page and coins"
```

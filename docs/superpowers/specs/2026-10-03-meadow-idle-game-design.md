# Meadow idle game: design

Date: 2026-10-03
Branch: `feat/meadow` (based on `fix/keep-timer-on-tab-switch`, which adds the parked-timer logic this design moves)

## Goal

While a focus session runs, every animal you have hatched takes turns jumping over a fence on a new Meadow page, and each jump earns coins. Coins are only collected and shown for now; spending them is a later step.

Success: open `/meadow`, start a focus session, watch the animals hop the fence and the coin count rise in step with the jumps. Switch pages, reload or close the tab, and the coins are still correct when you come back.

Out of scope: spending coins, upgrades, sound effects for jumps, syncing across devices.

## Decisions

| Question | Decision |
| --- | --- |
| Where the game lives | A separate URL, `/meadow`, next to the timer at `/` |
| How routing works | A small built-in router (`history.pushState` and `popstate`), no new dependency |
| When coins are earned | Only while a **focus** timer is **running**, whichever page or tab is open, including while the browser is closed |
| Who jumps | Every hatched animal. Duplicates count: three Shibas pay three times as much |
| What a jump is worth | By rarity: common 1, rare 3, legendary 10 coins |

## Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/router.js` | new | `usePath()` returns the current path and re-renders on navigation and Back/Forward. `navigate(path)` pushes a new path. `<Link to>` renders an `<a>` that navigates without a reload (modifier-clicks and middle-clicks fall through to the browser). The only code that reads or changes the URL for page selection. |
| `src/useTimer.js` | new, moved from `App.jsx` | Timer, history, cycle, parked timers and coins state; `start`, `pause`, `toggle`, `skip`, `reset`, `switchTo`, `setDuration`, `finish`; the ticker, tab title and Space / Alt+S keys. Returns state and actions. Takes the settings and a callback to open the hatch pop-up. |
| `src/coins.js` | new | Pure functions and constants for income and coins. No React, no storage. |
| `src/coins.test.js` | new | Tests for `coins.js`, run with Node's built-in test runner. |
| `src/Sprite.jsx` | moved from `App.jsx` | The `Sprite` component, now shared by both pages. |
| `src/MeadowPage.jsx` | new | The Meadow page: compact timer, coin counter, field with fence and jumping animals. |
| `src/App.jsx` | slimmed | Becomes the Shell: header with Timer / Meadow links, picks the page from `usePath()`, Spotify bar, Settings and hatch pop-ups. The current main content becomes a `TimerPage` component in the same file. The Spotify-bar `Meadow` component is renamed `BarCritters`. |
| `src/animals.js` | edit | Add a `FENCE` sprite in the existing 16×16 text format. |
| `src/index.css` | edit | Keyframes and classes for the field, the jump arc, the "+N" pop-up and the reduced-motion version. |
| `src/spotify.js` | small edit | Remember the current path before redirecting to Spotify; `finishLogin` returns to it instead of `/`. |
| `vercel.json` | edit | Add a rewrite from `/meadow` to `/index.html`. |
| `package.json` | edit | Add `"test": "node --test"`. |

The Shell is always mounted and calls `useTimer()` once. Both pages receive timer state and actions as props. Switching pages never unmounts the timer, so a session that ends on either page chimes, hatches and opens the hatch pop-up. Any path other than `/meadow` (including `/callback` after it is handled) shows the Timer page.

Moving to react-router later means replacing `router.js` and the page switch in the Shell; pages and `useTimer` are unaffected.

## Coin rules

### Constants (top of `coins.js`)

- `JUMP_MS = 10_000`: each species jumps once every 10 seconds of running focus time.
- `COIN_VALUE = { common: 1, rare: 3, legendary: 10 }`.

### Jumpers

`jumpers(history)` returns one entry per owned species, in order of first hatch: `{ id, value, copies }`, where `value` comes from the species' rarity and `copies` is how many times it has hatched. A jump by that species pays `value × copies`.

### Timing

With `n` species, species `i` (0-based) lands its jumps at run times `(i + 1) × JUMP_MS / n + k × JUMP_MS` for k = 0, 1, 2, and so on. So turns are evenly spaced (with 5 species, one landing every 2 seconds) and every species lands exactly once per 10 seconds.

`coinsEarned(elapsedMs, jumpers)` = the sum over species of `value × copies × landedJumps`, where `landedJumps = floor((elapsedMs − offset_i) / JUMP_MS) + 1` when `elapsedMs ≥ offset_i`, else 0, and `offset_i = (i + 1) × JUMP_MS / n`. A jump pays when it lands, never part-way.

Check: one common over 25 minutes = 150 coins. Ten commons, two rares and one legendary over 25 minutes = 150 × (10 + 6 + 10) = 3,900 coins.

### Runs and saving

- A **run** is one stretch of a focus timer running without a pause.
- The timer object gains `runStartRemainingMs`: the `remainingMs` at the moment the run started. It is set by `start` and by `goTo(..., autostart)`.
- `runElapsedMs(timer, now)` = `runStartRemainingMs − remaining`, where `remaining = clamp(endAt − now, 0, totalMs)`. It is 0 when the timer is not running or not in focus mode.
- `pomodoro.coins` (localStorage, whole number) holds the banked total.
- Every action that ends a running focus run (pause, finish, skip, reset, mode switch) first adds `coinsEarned(runElapsedMs(timer, now), jumpers(history))` to `pomodoro.coins`. Because `remaining` is clamped at 0, a session that ran out while the tab was closed pays in full when it is finished on reopen, and never more.
- The coins shown are `banked + coinsEarned(runElapsedMs(timer, now), jumpers(history))`.
- The jumpers used for a run are those owned when the run started. A newly hatched animal starts jumping in the next focus session, because hatching happens at the end of a session. Coins are banked before the new history entry is added.

### Fixed rules

- Skip and reset keep the coins already earned in that session. Only the egg is lost, as today.
- Pausing drops each species' jump in progress (worth at most one jump per species).
- A timer saved before this update has no `runStartRemainingMs`. If it is running when the update first loads, the run counts from page load (`runStartRemainingMs` is set to the current remaining time).
- Settings > Clear data also sets coins to 0.

## Meadow page

```
 [egg] Pomodoro            Timer | Meadow          [sun] [gear]
 ───────────────────────────────────────────────────────────
         Focus  18:42   [ Pause ]
               (coin) 12,480
         +2.6 coins/s · 13 jumpers

   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     (dog)(cat)(fox)(owl)  →  ╫╫╫╫  → (shiba) +3
   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
          Start a focus session to get them jumping
 ───────────────────────────────────────────────────────────
                   [ Spotify bar, as today ]
```

- **Header**: as today, plus Timer / Meadow links in the pixel style; the current page is marked with `aria-current="page"`.
- **Compact timer**: mode name, time left, and one Start / Pause / Resume button wired to the same `toggle` action as the Timer page. Skip, reset and the minute stepper stay on the Timer page.
- **Coin counter**: large pixel-font number with the lucide `Coins` icon, formatted with thousands separators. Below it: coins per second (`sum of value × copies ÷ 10`, one decimal) and the number of jumpers (total copies). The counter has an accessible label and is not an `aria-live` region.
- **Field**: a ground strip with the `FENCE` sprite in the middle.
  - Species wait in a loose line on the left. The line packs tighter as it grows; the field never scrolls sideways.
  - On its turn a species hops over the fence in an arc, lands on the right with a "+N" pop-up (N = value × copies), fades out and rejoins the back of the line.
  - Copies show as "×3" under the sprite.
  - Each species' animation runs on a `JUMP_MS` loop whose `animation-delay` is derived from `runElapsedMs` and its offset, so the landing in the animation happens at the same moment the coin is counted. Delays are recomputed whenever a run starts or the page becomes visible again, so a throttled hidden tab resyncs on return.
  - When the timer is not running in focus mode, animations are paused (`animation-play-state: paused`).
- **Caption under the field**:
  - Focus idle or paused: "Start a focus session to get them jumping".
  - Break: "Resting during the break".
  - No animals yet: the field shows only the fence and "Finish a focus session to hatch your first jumper".
- **Reduced motion**: no arc; the animal moves straight to the other side of the fence at landing time. Coins count as normal.
- Colours, light and dark themes and fonts follow the Timer page.

## Edge cases

- **Up to 42 species**: turns are `JUMP_MS ÷ n` apart (about 0.24 s at 42). The waiting line packs tighter.
- **Hidden tab**: coins never depend on the animation; animation delays are recomputed on `visibilitychange`.
- **Unknown path**: shows the Timer page.
- **Spotify login from Meadow**: the path is stored in `sessionStorage` before the redirect; the callback replaces `/callback` with it (falling back to `/`).
- **Direct load of `/meadow`**: Vercel rewrite in production; Vite's dev server already falls back to `index.html`.
- **Two tabs with a running timer**: both tabs would bank coins, just as both would hatch an egg today. This is an existing limitation and stays out of scope.

## Testing

`src/coins.test.js`, run by `npm test` (`node --test`, no new dependency):

- no jumpers earns 0
- one common over 25 minutes earns 150
- copies multiply the payout
- rarity values are applied (common 1, rare 3, legendary 10)
- with 5 species, exactly one jump has landed at 2 s and none at 1.9 s
- a jump in progress pays nothing until it lands
- `runElapsedMs` for a running, a paused and an expired timer, and for a non-focus timer
- `jumpers` counts copies and orders species by first hatch

`npm run build` must pass.

Manual check in `npm run dev`:

1. Start a focus session on Meadow; the jumps and the count match.
2. Switch to Timer and back mid-session; timer and count continue.
3. Pause, reload, resume; skip.
4. Finish a 1-minute session on Meadow; the hatch pop-up opens and the coins are banked.
5. Connect Spotify from Meadow; you come back to Meadow.
6. Back and Forward buttons move between the pages.
7. Dark mode and reduced motion.

import { useEffect, useMemo, useState } from 'react'
import { Coins, Pause, Play } from 'lucide-react'
import { ANIMAL_BY_ID, FENCE } from './animals.js'
import { coinBalance, coinsPerSecond, jumpOffset, jumpPose, jumpers, runElapsedMs } from './coins.js'
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
      {jumper.copies > 1 && <span className="absolute left-1/2 top-full -translate-x-1/2 text-xs tabular-nums text-muted">×{jumper.copies}</span>}
    </div>
  )
}

export default function MeadowPage({ t }) {
  const { timer, remainingMs, untouched, toggle, history, coinsBanked } = t
  const list = useMemo(() => jumpers(history), [history])
  const active = timer.mode === 'focus' && timer.running
  const now = useFrameNow(active)
  const elapsed = runElapsedMs(timer, now)
  const coins = coinBalance(coinsBanked, timer, list, now)
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

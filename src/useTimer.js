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

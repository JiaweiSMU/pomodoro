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
import MeadowPage from './MeadowPage.jsx'
import Sprite from './Sprite.jsx'
import { Link, usePath } from './router.jsx'
import { SpotifyBar, useSpotify } from './SpotifyBar.jsx'
import * as spotify from './spotify.js'
import { MODES, chime, clamp, formatTime, usePersistent, useTimer } from './useTimer.js'

/* ----------------------------------------------------------------------------
   Constants and small helpers
---------------------------------------------------------------------------- */

const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  interval: 4, // focus sessions before a long break
  autoBreak: false,
  autoFocus: false,
  volume: 0.6,
  muted: false,
  theme: null, // null = follow the system until the toggle is used
}

const MIN_MINUTES = 1
const MAX_MINUTES = 180

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function formatMinutes(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/* ----------------------------------------------------------------------------
   Small shared controls
---------------------------------------------------------------------------- */

// A number box that tolerates half-typed values and only reports valid ones.
function NumberField({ value, min, max, onChange, className = '', ...rest }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (raw) => {
    const n = Math.round(Number(raw))
    if (raw === '' || !Number.isFinite(n)) return setDraft(String(value))
    const next = clamp(n, min, max)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        const n = Number(raw)
        if (raw !== '' && Number.isInteger(n) && n >= min && n <= max && n !== value) onChange(n)
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`rounded-md border border-line bg-surface text-center tabular-nums text-ink ${className}`}
      {...rest}
    />
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>{label}</span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

function Segmented({ options, value, onChange, label, size = 'md' }) {
  const pad = size === 'sm' ? 'px-3 py-1 text-sm' : 'px-3 py-2 text-sm sm:px-4'
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors ${pad} ${
            value === o.value ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Native modal dialog: Escape, focus trapping and the backdrop come with it.
function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current.open) ref.current.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // The content fills the dialog, so a press on the dialog itself is on the backdrop.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="overlay m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface text-ink shadow-2xl backdrop:bg-black/55"
    >
      <div className="p-6">{children}</div>
    </dialog>
  )
}

/* ----------------------------------------------------------------------------
   Timer ring
---------------------------------------------------------------------------- */

const RING_RADIUS = 140
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function Ring({ progress, children }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[20rem]">
      <svg viewBox="0 0 300 300" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="150" cy="150" r={RING_RADIUS} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          className="ring-progress"
          cx="150"
          cy="150"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
   Tasks
---------------------------------------------------------------------------- */

function Tasks({ tasks, setTasks, activeId, setActiveId }) {
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState(1)

  const add = (e) => {
    e.preventDefault()
    const text = title.trim()
    if (!text) return
    const task = { id: crypto.randomUUID(), title: text, est: estimate, done: 0, completed: false }
    setTasks((list) => [...list, task])
    if (!activeId) setActiveId(task.id)
    setTitle('')
    setEstimate(1)
  }

  const update = (id, patch) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  return (
    <section aria-labelledby="tasks-heading" className="mt-12">
      <h2 id="tasks-heading" className="font-pixel text-2xl">
        Tasks
      </h2>

      <form onSubmit={add} className="mt-3 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on?"
          aria-label="Task name"
          maxLength={120}
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-ink placeholder:text-muted"
        />
        <NumberField
          value={estimate}
          min={1}
          max={20}
          onChange={setEstimate}
          aria-label="Estimated pomodoros"
          title="Estimated pomodoros"
          className="h-10 w-12"
        />
        <button
          type="submit"
          aria-label="Add task"
          className="flex h-10 shrink-0 items-center gap-1 rounded-md bg-accent px-3 font-medium text-on-accent disabled:opacity-50"
          disabled={!title.trim()}
        >
          <Plus size={18} aria-hidden="true" />
          Add
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Add a task and pick it. Each finished focus session counts toward the task you picked.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {tasks.map((task) => {
            const active = task.id === activeId
            return (
              <li key={task.id} className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={task.completed}
                  aria-label={`"${task.title}" done`}
                  onChange={() => {
                    update(task.id, { completed: !task.completed })
                    if (!task.completed && active) setActiveId(null)
                  }}
                  className="size-5 shrink-0"
                />

                <button
                  type="button"
                  aria-pressed={active}
                  disabled={task.completed}
                  onClick={() => setActiveId(active ? null : task.id)}
                  title={active ? 'Stop counting sessions toward this task' : 'Count sessions toward this task'}
                  className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left ${
                    task.completed ? 'text-muted line-through' : active ? 'bg-accent-soft font-medium' : 'hover:bg-accent-soft/60'
                  }`}
                >
                  <span className="block truncate">{task.title}</span>
                </button>

                <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums text-muted">
                  <span className="font-medium text-ink">{task.done}</span>
                  <span aria-hidden="true">/</span>
                  <span className="sr-only">of</span>
                  <NumberField
                    value={task.est}
                    min={1}
                    max={20}
                    onChange={(est) => update(task.id, { est })}
                    aria-label={`Estimated pomodoros for "${task.title}"`}
                    className="h-8 w-10"
                  />
                </span>

                <IconButton
                  label={`Delete "${task.title}"`}
                  onClick={() => {
                    setTasks((list) => list.filter((t) => t.id !== task.id))
                    if (active) setActiveId(null)
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ----------------------------------------------------------------------------
   History: today's totals and the day / week / month bar chart
---------------------------------------------------------------------------- */

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]
const BARS = { day: 7, week: 8, month: 6 }
const PLOT_HEIGHT = 132

const dateFormat = (options) => new Intl.DateTimeFormat(undefined, options)
const startOfToday = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// The time slots shown as bars: 7 days, 8 weeks (Monday to Sunday) or 6 months.
// `page` steps back in time by one screenful.
function buildBuckets(view, page) {
  const today = startOfToday()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const short = dateFormat({ day: 'numeric', month: 'short' })
  const count = BARS[view]
  const buckets = []

  for (let i = count - 1; i >= 0; i--) {
    const back = page * count + i
    if (view === 'day') {
      const start = new Date(y, m, d - back)
      buckets.push({
        start,
        end: new Date(y, m, d - back + 1),
        label: dateFormat({ weekday: 'short' }).format(start),
        full: dateFormat({ weekday: 'long', day: 'numeric', month: 'short' }).format(start),
      })
    } else if (view === 'week') {
      const monday = d - ((today.getDay() + 6) % 7)
      const start = new Date(y, m, monday - back * 7)
      const last = new Date(y, m, monday - back * 7 + 6)
      buckets.push({
        start,
        end: new Date(y, m, monday - back * 7 + 7),
        label: short.format(start),
        full: `${short.format(start)} to ${short.format(last)}`,
      })
    } else {
      const start = new Date(y, m - back, 1)
      buckets.push({
        start,
        end: new Date(y, m - back + 1, 1),
        label: dateFormat({ month: 'short' }).format(start),
        full: dateFormat({ month: 'long', year: 'numeric' }).format(start),
      })
    }
  }
  return buckets
}

function History({ history }) {
  const [view, setView] = useState('day')
  const [page, setPage] = useState(0)
  const [hover, setHover] = useState(null)

  const today = useMemo(() => {
    const since = startOfToday().getTime()
    const sessions = history.filter((h) => h.t >= since)
    return { count: sessions.length, minutes: sessions.reduce((sum, h) => sum + h.min, 0) }
  }, [history])

  const buckets = useMemo(() => {
    const now = Date.now()
    return buildBuckets(view, page).map((b) => {
      const sessions = history.filter((h) => h.t >= b.start.getTime() && h.t < b.end.getTime())
      return {
        ...b,
        count: sessions.length,
        minutes: sessions.reduce((sum, h) => sum + h.min, 0),
        current: now >= b.start.getTime() && now < b.end.getTime(),
      }
    })
  }, [history, view, page])

  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  const totalMinutes = buckets.reduce((sum, b) => sum + b.minutes, 0)
  // Keep a little headroom so one pomodoro is not drawn as a full-height bar.
  const max = Math.max(4, ...buckets.map((b) => b.count))
  const oldest = history[0]?.t ?? Infinity // history is kept in time order
  const canGoBack = oldest < buckets[0].start.getTime()

  const range =
    view === 'month'
      ? `${buckets[0].label} to ${dateFormat({ month: 'short', year: 'numeric' }).format(buckets.at(-1).start)}`
      : `${dateFormat({ day: 'numeric', month: 'short' }).format(buckets[0].start)} to ${dateFormat({
          day: 'numeric',
          month: 'short',
        }).format(new Date(buckets.at(-1).end.getTime() - 1))}`

  const tip = hover == null ? null : buckets[hover]
  // Pin the tooltip to the edge for the outer bars so it stays inside the chart.
  const tipX =
    hover === 0
      ? { left: 0 }
      : hover === buckets.length - 1
        ? { right: 0 }
        : { left: `${((hover + 0.5) / buckets.length) * 100}%`, translate: '-50%' }

  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="font-pixel text-2xl">
        Completed pomodoros
      </h2>

      <dl className="mt-3 flex gap-8">
        <div>
          <dt className="text-sm text-muted">Today</dt>
          <dd className="font-pixel text-4xl leading-tight">{today.count}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Focused today</dt>
          <dd className="font-pixel text-4xl leading-tight">{formatMinutes(today.minutes)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          label="Group by"
          options={VIEWS}
          value={view}
          onChange={(v) => {
            setView(v)
            setPage(0)
            setHover(null)
          }}
        />
        <div className="flex items-center">
          <IconButton label="Earlier" disabled={!canGoBack} onClick={() => setPage((p) => p + 1)} size="size-8">
            <ChevronLeft size={18} aria-hidden="true" />
          </IconButton>
          <IconButton label="Later" disabled={page === 0} onClick={() => setPage((p) => p - 1)} size="size-8">
            <ChevronRight size={18} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted" aria-live="polite">
        <span className="font-medium text-ink">{plural(total, 'pomodoro')}</span>
        {totalMinutes > 0 && `, ${formatMinutes(totalMinutes)}`} from {range}
      </p>

      <div className="relative mt-2" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-0.5 border-b border-line" style={{ height: PLOT_HEIGHT + 24 }}>
          {buckets.map((b, i) => (
            <button
              key={b.start.getTime()}
              type="button"
              aria-label={`${b.full}: ${plural(b.count, 'pomodoro')}, ${formatMinutes(b.minutes)} focused`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end rounded-t-md"
            >
              <span className="mb-1 text-xs font-medium tabular-nums text-ink">{b.count > 0 ? b.count : ''}</span>
              <span
                className="w-full max-w-6 rounded-t bg-accent transition-[height,filter] duration-300 group-hover:brightness-110 group-focus-visible:brightness-110"
                style={{ height: Math.round((b.count / max) * PLOT_HEIGHT) }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-0.5" aria-hidden="true">
          {buckets.map((b) => (
            <span
              key={b.start.getTime()}
              className={`min-w-0 flex-1 truncate text-center text-xs ${b.current ? 'font-semibold text-ink' : 'text-muted'}`}
            >
              {b.label}
            </span>
          ))}
        </div>

        {tip && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{ ...tipX, bottom: Math.round((tip.count / max) * PLOT_HEIGHT) + 62 }}
          >
            <div className="font-semibold text-ink">{plural(tip.count, 'pomodoro')}</div>
            <div className="text-muted">
              {tip.minutes > 0 ? `${formatMinutes(tip.minutes)} focused, ` : ''}
              {tip.full}
            </div>
          </div>
        )}
      </div>

      {history.length === 0 && (
        <p className="mt-3 text-sm text-muted">Finish a focus session and it shows up here.</p>
      )}

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Completed pomodoros, {range}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Pomodoros</th>
            <th scope="col">Minutes focused</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start.getTime()}>
              <th scope="row">{b.full}</th>
              <td>{b.count}</td>
              <td>{b.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/* ----------------------------------------------------------------------------
   Hatched animals wandering along the top of the Spotify bar
---------------------------------------------------------------------------- */

function BarCritters({ history }) {
  const animals = useMemo(
    () => [...new Set(history.map((h) => h.animal))].map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    [history],
  )
  if (!animals.length) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-8 overflow-hidden">
      {animals.map((animal, i) => (
        // Speed, start point and resting spot are spread out by index so the animals do not move in step.
        <div
          key={animal.id}
          className="critter"
          style={{ '--dur': `${16 + ((i * 7) % 13)}s`, '--start': `${-i * 3.7}s`, '--x': `${(i * 37) % 90}%` }}
        >
          <Sprite sprite={animal} size={32} />
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------------------
   Collection of hatched animals
---------------------------------------------------------------------------- */

function Collection({ history }) {
  const counts = useMemo(() => {
    const map = {}
    for (const h of history) map[h.animal] = (map[h.animal] || 0) + 1
    return map
  }, [history])
  const found = ANIMALS.filter((a) => counts[a.id]).length

  return (
    <section aria-labelledby="collection-heading" className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="collection-heading" className="font-pixel text-2xl">
          Your animals
        </h2>
        <p className="text-sm text-muted">
          {found} of {ANIMALS.length} found
        </p>
      </div>

      {Object.entries(RARITY).map(([rarity, info]) => (
        <div key={rarity} className="mt-4">
          <h3 className="text-sm text-muted">{info.label}</h3>
          <ul className="mt-2 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">
            {ANIMALS.filter((a) => a.rarity === rarity).map((animal) => {
              const n = counts[animal.id] || 0
              return (
                <li key={animal.id} className="flex flex-col items-center text-center">
                  <Sprite
                    sprite={animal}
                    size={48}
                    silhouette={n === 0}
                    label={n ? animal.name : 'Not found yet'}
                  />
                  <span className={`mt-1 text-xs ${n ? 'text-ink' : 'text-muted'}`}>{n ? animal.name : '???'}</span>
                  {n > 0 && <span className="text-xs tabular-nums text-muted">×{n}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

/* ----------------------------------------------------------------------------
   Hatch reveal
---------------------------------------------------------------------------- */

function HatchModal({ hatched, breakLabel, breakRunning, onStartBreak, onClose }) {
  const { animal, isNew, count } = hatched
  return (
    <Modal title={`${animal.name} hatched`} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="relative grid size-40 place-items-center">
          <Sprite sprite={EGG} size={128} cracks={CRACKS[3]} className="hatch-egg absolute" />
          <Sprite sprite={animal} size={160} className="hatch-animal" />
        </div>
        <div className="hatch-text">
          <p className="mt-4 text-sm text-muted">{RARITY[animal.rarity].label}</p>
          <h2 className="font-pixel text-4xl">{animal.name} hatched</h2>
          <p className="mt-1 text-muted">{isNew ? 'New to your collection.' : `You have ${count} now.`}</p>
        </div>
        <div className="mt-6 flex w-full flex-col gap-2">
          {!breakRunning && (
            <button type="button" autoFocus onClick={onStartBreak} className="key h-12 font-pixel text-2xl">
              Start {breakLabel.toLowerCase()}
            </button>
          )}
          <button
            type="button"
            autoFocus={breakRunning}
            onClick={onClose}
            className="h-10 rounded-md text-muted hover:bg-accent-soft hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ----------------------------------------------------------------------------
   Settings
---------------------------------------------------------------------------- */

function SettingsModal({ settings, setSettings, setDuration, sp, onClearData, onClose }) {
  const [clientIdDraft, setClientIdDraft] = useState(sp.clientId)
  const [copied, setCopied] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))
  const redirect = spotify.redirectUri()
  const onLocalhost = window.location.hostname === 'localhost'

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-3xl">Settings</h2>
        <IconButton label="Close settings" onClick={onClose} autoFocus>
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>

      <h3 className="mt-4 text-sm text-muted">Timer length, in minutes</h3>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {Object.entries(MODES).map(([mode, label]) => (
          <label key={mode} className="text-sm">
            {label}
            <NumberField
              value={settings[mode]}
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              onChange={(n) => setDuration(mode, n)}
              className="mt-1 h-10 w-full"
            />
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-4 text-sm">
        Focus sessions before a long break
        <NumberField
          value={settings.interval}
          min={2}
          max={12}
          onChange={(interval) => set({ interval })}
          className="h-10 w-16"
        />
      </label>

      <div className="mt-3 border-t border-line pt-2 text-sm">
        <Toggle label="Start breaks automatically" checked={settings.autoBreak} onChange={(autoBreak) => set({ autoBreak })} />
        <Toggle label="Start focus sessions automatically" checked={settings.autoFocus} onChange={(autoFocus) => set({ autoFocus })} />
      </div>

      <div className="mt-2 border-t border-line pt-3 text-sm">
        <h3 className="text-muted">Chime</h3>
        <div className="mt-1 flex items-center gap-3">
          <IconButton label={settings.muted ? 'Unmute chime' : 'Mute chime'} aria-pressed={settings.muted} onClick={() => set({ muted: !settings.muted })}>
            {settings.muted ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
          </IconButton>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            disabled={settings.muted}
            aria-label="Chime volume"
            onChange={(e) => set({ volume: Number(e.target.value) })}
            onPointerUp={() => chime('focus', settings.volume)}
            onKeyUp={() => chime('focus', settings.volume)}
            className="flex-1 disabled:opacity-40"
          />
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3 text-sm">
        <h3 className="text-muted">Spotify</h3>
        {onLocalhost && (
          <p className="mt-2 rounded-md bg-accent-soft p-2">
            Spotify does not accept "localhost". Open this page at http://127.0.0.1:{window.location.port} instead.
          </p>
        )}
        <label className="mt-2 block">
          Client ID, from your app at developer.spotify.com/dashboard
          <input
            value={clientIdDraft}
            onChange={(e) => setClientIdDraft(e.target.value)}
            onBlur={() => sp.saveClientId(clientIdDraft)}
            placeholder="32 letters and numbers"
            spellCheck="false"
            autoComplete="off"
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 font-mono text-xs"
          />
        </label>
        <p className="mt-3">Add this redirect URI to your Spotify app:</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-bg px-3 py-2 text-xs">{redirect}</code>
          <IconButton
            label="Copy redirect URI"
            onClick={() => navigator.clipboard?.writeText(redirect).then(() => setCopied(true))}
          >
            {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          </IconButton>
        </div>
        {sp.connected ? (
          <button type="button" onClick={sp.disconnect} className="mt-3 h-10 rounded-md border border-line px-3 font-medium hover:bg-accent-soft">
            Disconnect Spotify
          </button>
        ) : (
          <button
            type="button"
            disabled={!clientIdDraft.trim() && !spotify.hasBuiltInClientId()}
            onClick={() => {
              sp.saveClientId(clientIdDraft)
              sp.connect()
            }}
            className="mt-3 h-10 rounded-md bg-accent px-3 font-medium text-on-accent disabled:opacity-50"
          >
            Connect Spotify
          </button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3 text-sm">
        {confirmClear ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">Delete all sessions, animals, coins and tasks? This cannot be undone.</span>
            <button type="button" onClick={() => setConfirmClear(false)} className="h-9 rounded-md border border-line px-3">
              Keep
            </button>
            <button
              type="button"
              onClick={() => {
                onClearData()
                setConfirmClear(false)
              }}
              className="h-9 rounded-md bg-ink px-3 text-surface"
            >
              Delete
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} className="text-muted underline underline-offset-2 hover:text-ink">
            Delete all sessions, animals, coins and tasks
          </button>
        )}
      </div>
    </Modal>
  )
}

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

const PAGES = [
  { to: '/', label: 'Timer' },
  { to: '/meadow', label: 'Meadow' },
]

function PageNav({ page }) {
  return (
    <nav aria-label="Pages" className="order-last w-full sm:order-0 sm:w-auto">
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
  // Anything other than /meadow (including /callback) shows the timer.
  const page = usePath() === '/meadow' ? '/meadow' : '/'

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
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Sprite sprite={EGG} size={32} />
          <h1 className="font-pixel text-3xl">Pomodoro</h1>
        </div>
        <PageNav page={page} />
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

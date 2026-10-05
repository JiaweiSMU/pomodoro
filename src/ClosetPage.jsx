import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Coins } from 'lucide-react'
import { ANIMALS, RARITY } from './animals.js'
import { coinBalance, jumpers } from './coins.js'
import { Link } from './router.jsx'
import Sprite from './Sprite.jsx'
import { ITEMS, ITEM_BY_ID, SLOTS, SLOT_LABEL, wear } from './wardrobe.js'

const choice = (selected) =>
  `rounded-lg border transition-colors ${selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent'}`

function Tile({ animal, outfit, itemId, name, note, pressed, onClick }) {
  return (
    <button
      type="button"
      data-item={itemId}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full flex-col items-center px-2 pb-2 pt-4 text-center ${choice(pressed)}`}
    >
      <Sprite sprite={animal} size={56} outfit={outfit} />
      <span className="mt-1 text-sm">{name}</span>
      <span className="text-xs text-muted">{note}</span>
    </button>
  )
}

// Dress up your animals. Buying spends coins; items you do not own yet can be
// tried on first. Outfits belong to a species: every copy wears the same one.
export default function ClosetPage({ t, owned, setOwned, worn, setWorn }) {
  const { history, timer, coinsBanked, spend } = t
  const species = useMemo(() => {
    const hatched = new Set(history.map((h) => h.animal))
    return ANIMALS.filter((a) => hatched.has(a.id))
  }, [history])
  const list = useMemo(() => jumpers(history), [history])
  const [pickedId, setPickedId] = useState(null)
  const [slot, setSlot] = useState('head')
  const [tryingId, setTryingId] = useState(null) // an item being tried on, not saved
  const previewRef = useRef(null)

  const animal = species.find((a) => a.id === pickedId) ?? species[0]
  if (!animal) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-10 text-center sm:px-6">
        <p className="text-muted">Hatch an animal to start dressing it up.</p>
        <Link to="/" className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-medium text-on-accent">
          Go to the timer
        </Link>
      </main>
    )
  }

  // Same balance as the Meadow. The app re-renders on every timer tick, so this stays
  // current, and it never drops between a render and a click (see coinBalance).
  const balance = coinBalance(coinsBanked, timer, list, Date.now())
  const outfit = worn[animal.id] ?? {}
  const trying = ITEM_BY_ID[tryingId]
  const preview = trying ? { ...outfit, [trying.slot]: trying.id } : outfit
  const wearing = SLOTS.map((s) => ITEM_BY_ID[preview[s]]?.name).filter(Boolean)
  const short = trying ? trying.price - balance : 0

  const pickAnimal = (id) => {
    setPickedId(id)
    setTryingId(null)
  }
  const pickSlot = (s) => {
    setSlot(s)
    setTryingId(null)
  }
  // Owned items (and None) are worn at once; anything else is only tried on.
  const choose = (itemId) => {
    if (itemId == null || owned.includes(itemId)) {
      setTryingId(null)
      setWorn(wear(worn, animal.id, slot, itemId))
    } else {
      setTryingId(itemId)
      // On a phone the grid sits below the preview: bring the preview and Buy bar into view.
      previewRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }
  const buy = () => {
    if (!trying || owned.includes(trying.id) || balance < trying.price) return
    // The Buy button unmounts once bought. Commit now and move focus to the bought tile,
    // or focus falls to <body>, where the Space shortcut would start or pause the timer.
    flushSync(() => {
      spend(trying.price)
      setOwned([...owned, trying.id])
      setWorn(wear(worn, animal.id, trying.slot, trying.id))
      setTryingId(null)
    })
    document.querySelector(`[data-item="${trying.id}"]`)?.focus()
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-2 sm:px-6">
      <p className="flex items-center justify-center gap-3 font-pixel text-5xl leading-none">
        <Coins size={32} aria-hidden="true" className="text-accent" />
        <span className="tabular-nums" aria-hidden="true">{balance.toLocaleString()}</span>
        <span className="sr-only">{balance.toLocaleString()} coins</span>
      </p>

      <div role="group" aria-label="Animals" className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {species.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={a.id === animal.id}
            onClick={() => pickAnimal(a.id)}
            className={`flex shrink-0 flex-col items-center px-2 pb-1 pt-3 text-xs ${choice(a.id === animal.id)}`}
          >
            <Sprite sprite={a} size={40} outfit={worn[a.id]} />
            <span className="mt-1 max-w-20 truncate">{a.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
        <div ref={previewRef} className="flex flex-col items-center">
          <div className="flex size-56 items-end justify-center rounded-xl border border-line bg-surface pb-6">
            <Sprite
              sprite={animal}
              size={160}
              outfit={preview}
              label={wearing.length ? `${animal.name} wearing ${wearing.join(', ')}` : animal.name}
            />
          </div>
          {/* The bar keeps its space when empty, so trying items on never moves the page. */}
          <div className="mt-4 h-12 w-full">
            {trying && (
              <button
                type="button"
                onClick={buy}
                disabled={short > 0}
                className="key h-12 w-full px-3 font-pixel text-xl disabled:opacity-50"
              >
                {short > 0 ? `Need ${short.toLocaleString()} more` : `Buy ${trying.name} · ${trying.price.toLocaleString()}`}
              </button>
            )}
          </div>
        </div>

        <div role="group" aria-label="Slots" className="flex w-full max-w-xs flex-col gap-2">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === slot}
              onClick={() => pickSlot(s)}
              className={`flex items-center justify-between px-4 py-3 text-left ${choice(s === slot)}`}
            >
              <span className="font-medium">{SLOT_LABEL[s]}</span>
              <span className="text-sm text-muted">{ITEM_BY_ID[outfit[s]]?.name ?? 'None'}</span>
            </button>
          ))}
        </div>
      </div>

      <h2 className="mt-8 font-pixel text-2xl">{SLOT_LABEL[slot]}</h2>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        <li>
          <Tile animal={animal} name="None" note="Take it off" pressed={!preview[slot]} onClick={() => choose(null)} />
        </li>
        {ITEMS.filter((item) => item.slot === slot).map((item) => (
          <li key={item.id}>
            <Tile
              animal={animal}
              outfit={{ [slot]: item.id }}
              itemId={item.id}
              name={item.name}
              note={owned.includes(item.id) ? 'Owned' : `${item.price.toLocaleString()} · ${RARITY[item.tier].label}`}
              pressed={preview[slot] === item.id}
              onClick={() => choose(item.id)}
            />
          </li>
        ))}
      </ul>
    </main>
  )
}

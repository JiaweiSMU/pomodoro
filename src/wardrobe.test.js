import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANIMALS, ANIMAL_BY_ID, EGG, FENCE } from './animals.js'
import { FIT, ITEMS, ITEM_BY_ID, SLOTS, TIER_PRICE, dress, eyeBoxes, wear } from './wardrobe.js'

// Colour at sprite pixel (x, y) of a dress() result; y may be above 0.
const at = ({ y0, rows }, x, y) => rows[y - y0]?.[x] ?? null
const plain = (sprite) => sprite.px.map((row) => [...row].map((ch) => (ch === '.' ? null : sprite.pal[ch])))
const { dog, unicorn, elephant, dragon, crocodile, goat, fox, shiba } = ANIMAL_BY_ID

test('dress with nothing worn gives the plain sprite, egg and fence included', () => {
  for (const sprite of [...ANIMALS, EGG, FENCE]) {
    assert.deepEqual(dress(sprite), { y0: 0, rows: plain(sprite) }, sprite.id ?? 'egg or fence')
    assert.deepEqual(dress(sprite, {}), dress(sprite))
  }
})

test('unknown item ids and items in the wrong slot are ignored', () => {
  assert.deepEqual(dress(dog, { head: 'no-such-item', face: 'tophat' }), dress(dog))
  assert.deepEqual(dress(dog, null), dress(dog)) // hand-edited storage
  assert.deepEqual(dress(dog, 'junk'), dress(dog))
})

test('top hat on the dog: brim on the head-top row, crown rises above the box', () => {
  const hat = ITEM_BY_ID.tophat
  const d = dress(dog, { head: 'tophat' })
  assert.equal(d.y0, -3) // 5 rows tall, bottom row on row 1
  assert.equal(d.rows.length, 19)
  for (let x = 5; x <= 10; x++) assert.equal(at(d, x, 1), hat.pal.k, `brim at ${x}`)
  assert.equal(at(d, 7, 0), hat.pal.r) // the band row '.krrk.'
  assert.equal(at(d, 6, -3), hat.pal.k) // the top row '.kkkk.'
  assert.equal(at(d, 4, -3), null)
})

test('every animal wears every item without breaking the grid', () => {
  for (const animal of ANIMALS) {
    for (const item of ITEMS) {
      const d = dress(animal, { [item.slot]: item.id })
      assert.ok(d.y0 <= 0 && d.y0 >= -5, `${animal.id} + ${item.id}: y0 ${d.y0}`)
      assert.equal(d.rows.length, 16 - d.y0)
      for (const row of d.rows) assert.equal(row.length, 16)
    }
  }
})

test('no hat rises more than 3 rows above any animal: the pages leave room for 3', () => {
  for (const animal of ANIMALS) {
    for (const item of ITEMS.filter((i) => i.slot === 'head')) {
      assert.ok(dress(animal, { head: item.id }).y0 >= -3, `${animal.id} + ${item.id}`)
    }
  }
})

test('every animal has fit data, with every point on the 16x16 grid', () => {
  const inside = (x, y) => x >= 0 && x <= 15 && y >= 0 && y <= 15
  for (const animal of ANIMALS) {
    const fit = FIT[animal.base ?? animal.id]
    assert.ok(fit, animal.id)
    assert.ok(inside(...fit.head), `${animal.id} head`)
    if (fit.neck) {
      assert.ok(inside(...fit.neck), `${animal.id} neck`)
      const [x, y] = fit.neck
      assert.notEqual(animal.px[y][x], '.', `${animal.id} neck point is on the animal`)
    }
    if (fit.body) {
      const [y0, y1, x0, x1] = fit.body
      assert.ok(inside(x0, y0) && inside(x1, y1) && y0 <= y1 && x0 <= x1, `${animal.id} body`)
    }
  }
})

test('FIT has exactly one entry per drawn shape', () => {
  const drawn = ANIMALS.filter((a) => !a.base).map((a) => a.id).sort()
  assert.deepEqual(Object.keys(FIT).sort(), drawn)
})

test('variants use their base shape', () => {
  assert.equal(shiba.base, 'fox')
  const hat = ITEM_BY_ID.tophat
  const onShiba = dress(shiba, { head: 'tophat' })
  assert.equal(onShiba.y0, dress(fox, { head: 'tophat' }).y0)
  assert.equal(at(onShiba, 6, -1), hat.pal.k)
})

test('eyes: two groups on every animal except the side-on crocodile', () => {
  for (const animal of ANIMALS) {
    assert.equal(eyeBoxes(animal).length, animal.id === 'crocodile' ? 1 : 2, animal.id)
  }
  assert.deepEqual(eyeBoxes(dog), [{ x0: 5, x1: 5, y0: 5, y1: 6 }, { x0: 10, x1: 10, y0: 5, y1: 6 }])
})

test('round glasses: a frame round each eye without corners, and a bridge', () => {
  const frame = ITEM_BY_ID.round.frame
  const d = dress(dog, { face: 'round' }) // eyes at x 5 and 10, rows 5-6
  assert.equal(at(d, 5, 4), frame) // above the left eye
  assert.equal(at(d, 4, 5), frame) // left of it
  assert.equal(at(d, 4, 4), at(dress(dog), 4, 4)) // corner left alone
  assert.equal(at(d, 5, 5), at(dress(dog), 5, 5)) // the eye still shows
  assert.equal(at(d, 7, 5), frame) // bridge
})

test('a single eye gets a single lens (monocle on the crocodile)', () => {
  const { lens, frame } = ITEM_BY_ID.shades
  const d = dress(crocodile, { face: 'shades' }) // eye at (9, 9)
  assert.equal(at(d, 9, 9), lens)
  assert.equal(at(d, 9, 8), frame)
})

test('keep: the unicorn horn shows through a hat', () => {
  const d = dress(unicorn, { head: 'tophat' })
  for (let y = 0; y <= 3; y++) {
    for (let x = 6; x <= 9; x++) {
      const ch = unicorn.px[y][x]
      if (ch !== '.') assert.equal(at(d, x, y), unicorn.pal[ch], `horn at ${x},${y}`)
    }
  }
})

test('skip: scarf and sweater leave the elephant trunk alone', () => {
  const bare = dress(elephant)
  const d = dress(elephant, { neck: 'scarf', body: 'sweater' })
  for (let y = 9; y <= 12; y++) for (let x = 6; x <= 9; x++) assert.equal(at(d, x, y), at(bare, x, y), `trunk at ${x},${y}`)
  assert.equal(at(d, 3, 9), ITEM_BY_ID.scarf.band[0])
  assert.equal(at(d, 3, 10), ITEM_BY_ID.sweater.paint(3, 10))
})

test('a band only wraps the pixels joined to the neck point', () => {
  const [main, end] = ITEM_BY_ID.scarf.band
  const d = dress(dragon, { neck: 'scarf' }) // row 9 is 'kk.kggggggggk.kk'; the outer pixels are wing tips
  assert.equal(at(d, 0, 9), dragon.pal.k)
  assert.equal(at(d, 15, 9), dragon.pal.k)
  assert.equal(at(d, 3, 9), end)
  assert.equal(at(d, 8, 9), main)
  assert.equal(at(d, 12, 9), end)
})

test('body items keep the outline and the eyes', () => {
  const d = dress(dog, { body: 'robe' }) // body rows 11-13
  assert.equal(at(d, 2, 12), dog.pal.k)
  assert.equal(at(d, 3, 12), '#6A3FB0')
  assert.equal(at(d, 7, 12), '#F5C842')
})

test('no neck or no body: those items are left off', () => {
  assert.deepEqual(dress(crocodile, { neck: 'scarf' }), dress(crocodile))
  assert.deepEqual(dress(goat, { body: 'robe' }), dress(goat))
})

test('items: unique ids, a known slot and tier, a price inside the tier band', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length)
  for (const item of ITEMS) {
    assert.ok(SLOTS.includes(item.slot), item.id)
    const band = TIER_PRICE[item.tier]
    assert.ok(band, item.id)
    assert.ok(item.price >= band[0] && item.price <= band[1], `${item.id} price ${item.price}`)
  }
})

test('drawings: rows of equal width, every colour in the palette', () => {
  for (const item of ITEMS.filter((i) => i.px)) {
    for (const row of item.px) {
      assert.equal(row.length, item.px[0].length, item.id)
      for (const ch of row) if (ch !== '.') assert.ok(item.pal[ch], `${item.id} colour ${ch}`)
    }
  }
})

test('wear sets a slot, null takes it off, and an empty outfit is removed', () => {
  const one = wear({}, 'dog', 'head', 'tophat')
  assert.deepEqual(one, { dog: { head: 'tophat' } })
  const two = wear(one, 'dog', 'neck', 'scarf')
  assert.deepEqual(two, { dog: { head: 'tophat', neck: 'scarf' } })
  assert.deepEqual(one, { dog: { head: 'tophat' } }) // not changed in place
  assert.deepEqual(wear(two, 'dog', 'head', null), { dog: { neck: 'scarf' } })
  assert.deepEqual(wear(wear(two, 'dog', 'head', null), 'dog', 'neck', null), {})
  assert.deepEqual(wear(two, 'cat', 'face', 'round'), { dog: { head: 'tophat', neck: 'scarf' }, cat: { face: 'round' } })
  assert.deepEqual(wear(null, 'dog', 'head', 'cap'), { dog: { head: 'cap' } }) // hand-edited storage
  assert.deepEqual(wear({ dog: null }, 'dog', 'head', 'cap'), { dog: { head: 'cap' } })
})

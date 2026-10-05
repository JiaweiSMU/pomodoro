// Accessories and outfits. Each item is drawn once; FIT says where items go on
// each animal shape, so the same top hat sits on a bunny and an elephant.
// Pure functions only (no React, no storage), like coins.js.

export const SLOTS = ['head', 'face', 'neck', 'body']
export const SLOT_LABEL = { head: 'Head', face: 'Face', neck: 'Neck', body: 'Body' }
// Inclusive price range for each tier.
export const TIER_PRICE = { common: [200, 500], rare: [2000, 5000], legendary: [15000, 30000] }

const GOLD = '#F5C842'
const GOLD_D = '#C8961E'

// Head and neck drawings use the animal format: one string per row, "." is transparent.
// Face items are fitted to the eye pixels. Body items repaint the body:
// paint(x, y, firstRow, lastRow) returns a colour, or null to leave that pixel alone.
// Order: by slot, then by price. This is the order on the Closet page.
export const ITEMS = [
  { id: 'bow', name: 'Bow', slot: 'head', tier: 'common', price: 200, pal: { p: '#F27AB8', P: '#C2457E' }, px: ['p...p', 'ppPpp', 'p...p'] },
  { id: 'beanie', name: 'Beanie', slot: 'head', tier: 'common', price: 300, pal: { k: '#1F3F36', c: '#3F8F7A', C: '#2F6E5E', w: '#F4EFE6' }, px: ['...ww...', '..kcck..', '.kccCck.', 'kcCccCck', 'kwwwwwwk'] },
  { id: 'cap', name: 'Cap', slot: 'head', tier: 'common', price: 400, pal: { k: '#1C2F5E', b: '#3A6FD8', w: '#FFFFFF' }, px: ['.kkkkk..', 'kbbwbbk.', 'kkkkkkkk'] },
  { id: 'party', name: 'Party hat', slot: 'head', tier: 'rare', price: 2000, pal: { y: '#FFD84A', c: '#4AB0E8', m: '#F27AB8' }, px: ['..y..', '..c..', '.cmc.', '.mcm.', 'cmcmc'] },
  { id: 'tophat', name: 'Top hat', slot: 'head', tier: 'rare', price: 3000, pal: { k: '#141216', b: '#34303D', r: '#C8414B' }, px: ['.kkkk.', '.kbbk.', '.kbbk.', '.krrk.', 'kkkkkk'] },
  { id: 'crown', name: 'Crown', slot: 'head', tier: 'legendary', price: 25000, pal: { y: GOLD, Y: GOLD_D, r: '#D8434E', b: '#4A7BD0' }, px: ['y.yy.y', 'yyyyyy', 'yrybyr', 'YYYYYY'] },

  { id: 'round', name: 'Round glasses', slot: 'face', tier: 'common', price: 250, style: 'ring', frame: '#1A1A22' },
  { id: 'shades', name: 'Sunglasses', slot: 'face', tier: 'rare', price: 2500, style: 'lens', frame: '#1A1A22', lens: '#22222E', glint: '#6A6A80' },
  { id: 'rose', name: 'Rose shades', slot: 'face', tier: 'rare', price: 3500, style: 'lens', frame: '#C2457E', lens: '#F27AB8', glint: '#FFD0E6' },
  { id: 'goldshades', name: 'Gold shades', slot: 'face', tier: 'legendary', price: 15000, style: 'lens', frame: GOLD, lens: '#2A2030', glint: '#FFF2B0' },

  // band: [colour, colour at both ends] painted along the neck row; charm: [dx, dy, colour] from the neck point.
  { id: 'collar', name: 'Bell collar', slot: 'neck', tier: 'common', price: 200, band: ['#3A6FD8', '#1C2F5E'], charm: [[0, 1, GOLD], [-1, 1, GOLD], [0, 2, GOLD_D]] },
  { id: 'scarf', name: 'Red scarf', slot: 'neck', tier: 'common', price: 300, band: ['#D8434E', '#9E2A35'], charm: [[2, 1, '#D8434E'], [2, 2, '#D8434E'], [3, 1, '#9E2A35']] },
  { id: 'bowtie', name: 'Bow tie', slot: 'neck', tier: 'rare', price: 2000, pal: { r: '#D8434E', R: '#9E2A35' }, px: ['r...r', 'rrRrr', 'r...r'] },
  { id: 'medal', name: 'Gold medal', slot: 'neck', tier: 'legendary', price: 20000, band: ['#3A6FD8', '#1C2F5E'], charm: [[-1, 1, GOLD], [0, 1, GOLD], [-1, 2, GOLD], [0, 2, GOLD_D]] },

  { id: 'sweater', name: 'Striped sweater', slot: 'body', tier: 'common', price: 400, paint: (x, y) => (y % 2 ? '#4A7BD0' : '#EDEFF5') },
  { id: 'raincoat', name: 'Raincoat', slot: 'body', tier: 'common', price: 500, paint: (x, y) => (x === 8 && y % 2 ? '#9C7410' : '#F2C230') },
  {
    id: 'overalls', name: 'Overalls', slot: 'body', tier: 'rare', price: 3000,
    paint: (x, y, y0) => {
      const strap = x === 5 || x === 10
      if (y === y0) return strap ? '#3F6FB0' : null
      if (y === y0 + 1 && strap) return GOLD
      return '#3F6FB0'
    },
  },
  { id: 'tux', name: 'Tuxedo', slot: 'body', tier: 'rare', price: 5000, paint: (x, y) => (x === 7 || x === 8 ? (x === 8 && y % 2 ? '#22222E' : '#F4F4F8') : '#22222E') },
  {
    id: 'robe', name: 'Royal robe', slot: 'body', tier: 'legendary', price: 30000,
    paint: (x, y, y0, y1) => {
      if (y === y1) return x % 3 ? '#F8F8F8' : '#22222E'
      return x === 7 || x === 8 ? GOLD : '#6A3FB0'
    },
  },
]

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((item) => [item.id, item]))

// Where items go on each drawn shape. Breeds and colour variants use their base's entry.
//   head: [centre x, row the bottom of a hat sits on]
//   neck: [centre x, row], or null when there is no neck
//   body: [first row, last row, first column, last column], or null when there is no body
//   keep: [x0, x1, y0, y1] shape pixels drawn back over every item (horns, tusks)
//   skip: [x0, x1, y0, y1] pixels that neck and body items leave alone (the trunk)
export const FIT = {
  chick: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 15] },
  bunny: { head: [8, 5], neck: [8, 11], body: [12, 13, 0, 15] },
  cat: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 12] },
  frog: { head: [8, 4], neck: [8, 10], body: [11, 13, 0, 15] },
  pig: { head: [8, 3], neck: [8, 11], body: [12, 13, 0, 15] },
  mouse: { head: [8, 4], neck: [8, 10], body: [11, 13, 0, 15] },
  dog: { head: [8, 1], neck: [8, 10], body: [11, 13, 0, 15] },
  cow: { head: [8, 2], neck: [8, 11], body: [12, 13, 0, 15] },
  sheep: { head: [8, 1], neck: [8, 9], body: [10, 13, 0, 15] },
  duck: { head: [8, 1], neck: [8, 10], body: [11, 13, 0, 15] },
  hamster: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 15] },
  turtle: { head: [8, 1], neck: [8, 7], body: [8, 12, 0, 15] },
  fox: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 12] },
  panda: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 15] },
  penguin: { head: [8, 1], neck: [8, 9], body: [10, 13, 0, 15] },
  owl: { head: [8, 3], neck: [8, 9], body: [10, 12, 0, 15] },
  koala: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 15] },
  raccoon: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 12] },
  hedgehog: { head: [8, 1], neck: [8, 9], body: [10, 12, 0, 15] },
  tiger: { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 15] },
  axolotl: { head: [8, 2], neck: [8, 10], body: [11, 13, 0, 11] },
  capybara: { head: [8, 1], neck: [8, 11], body: [12, 13, 0, 15] },
  unicorn: { head: [8, 4], neck: [8, 10], body: [11, 13, 0, 15], keep: [6, 9, 0, 3] },
  dragon: { head: [8, 2], neck: [8, 9], body: [10, 13, 4, 11] },
  silkie: { head: [8, 1], neck: [8, 9], body: [10, 13, 0, 15] },
  goat: { head: [8, 3], neck: [8, 12], body: null, keep: [0, 15, 0, 2] },
  seal: { head: [8, 2], neck: [8, 9], body: [10, 13, 0, 15] },
  crocodile: { head: [11, 8], neck: null, body: [10, 12, 0, 8] },
  sloth: { head: [8, 1], neck: [8, 11], body: [12, 14, 3, 12] },
  'red-panda': { head: [8, 3], neck: [8, 10], body: [11, 13, 0, 12] },
  lion: { head: [8, 1], neck: [8, 11], body: [12, 13, 0, 15] },
  elephant: { head: [8, 1], neck: [8, 9], body: [10, 13, 0, 15], skip: [6, 9, 9, 12] },
  narwhal: { head: [8, 4], neck: [8, 9], body: [10, 13, 0, 15], keep: [6, 9, 0, 3] },
}

const inBox = (box, x, y) => box != null && x >= box[0] && x <= box[1] && y >= box[2] && y <= box[3]

// Bounding box of the eye ("e") pixels on each side of the face. Two boxes for
// a front-facing animal, one for a side-on animal (the crocodile).
export function eyeBoxes(sprite) {
  const sides = [[], []]
  sprite.px.forEach((row, y) => [...row].forEach((ch, x) => ch === 'e' && sides[x < 8 ? 0 : 1].push([x, y])))
  return sides
    .filter((side) => side.length)
    .map((side) => {
      const xs = side.map((p) => p[0])
      const ys = side.map((p) => p[1])
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
    })
}

// The item worn in this slot, if `worn` names a real item for it. `worn` may be
// null or junk when storage was edited by hand.
function pick(worn, slot) {
  const item = ITEM_BY_ID[worn?.[slot]]
  return item?.slot === slot ? item : null
}

// The sprite as a grid of colours with the worn items drawn on.
// Returns { y0, rows }: rows[i][x] is a colour, or null for transparent, for
// sprite row y0 + i. y0 is below 0 when a hat rises above the 16x16 box.
// With nothing worn this is the plain sprite, so the egg and fence work too.
export function dress(sprite, worn = {}) {
  const grid = new Map() // row -> 16 colours
  const set = (x, y, colour) => {
    if (x < 0 || x > 15 || y > 15 || colour == null) return
    if (!grid.has(y)) grid.set(y, Array(16).fill(null))
    grid.get(y)[x] = colour
  }
  const drawing = (item, left, top) =>
    item.px.forEach((row, dy) => [...row].forEach((ch, dx) => ch !== '.' && set(left + dx, top + dy, item.pal[ch])))
  const base = (x, y) => sprite.px[y][x]

  sprite.px.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && set(x, y, sprite.pal[ch])))
  const fit = FIT[sprite.base ?? sprite.id] ?? {}

  const body = pick(worn, 'body')
  if (body && fit.body) {
    const [y0, y1, x0, x1] = fit.body
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ch = base(x, y)
        if (ch !== '.' && ch !== 'k' && ch !== 'e' && !inBox(fit.skip, x, y)) set(x, y, body.paint(x, y, y0, y1))
      }
    }
  }

  const neck = pick(worn, 'neck')
  if (neck && fit.neck) {
    const [nx, ny] = fit.neck
    if (neck.band) {
      // Only the run of pixels joined to the neck point, so wing tips and tails stay bare.
      let a = nx
      let b = nx
      while (a > 0 && base(a - 1, ny) !== '.') a -= 1
      while (b < 15 && base(b + 1, ny) !== '.') b += 1
      for (let x = a; x <= b; x++) {
        if (!inBox(fit.skip, x, ny)) set(x, ny, x === a || x === b ? neck.band[1] : neck.band[0])
      }
      for (const [dx, dy, colour] of neck.charm) set(nx + dx, ny + dy, colour)
    } else {
      drawing(neck, nx - Math.floor(neck.px[0].length / 2), ny - Math.floor(neck.px.length / 2))
    }
  }

  const face = pick(worn, 'face')
  if (face) {
    const boxes = eyeBoxes(sprite)
    for (const { x0, x1, y0, y1 } of boxes) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (face.style === 'ring') {
          // The frame goes round the eye, leaving out the four corners.
          for (let y = y0 - 1; y <= y1 + 1; y++) {
            const edgeX = x === x0 - 1 || x === x1 + 1
            const edgeY = y === y0 - 1 || y === y1 + 1
            if (edgeX !== edgeY) set(x, y, face.frame)
          }
        } else {
          set(x, y0 - 1, face.frame)
          for (let y = y0; y <= y1; y++) set(x, y, x === x0 - 1 && y === y0 ? face.glint : face.lens)
        }
      }
    }
    if (boxes.length === 2) {
      const [l, r] = boxes
      const y = face.style === 'ring' ? l.y0 : l.y0 - 1
      for (let x = l.x1 + 2; x <= r.x0 - 2; x++) set(x, y, face.frame)
    }
  }

  const head = pick(worn, 'head')
  if (head && fit.head) {
    const [cx, top] = fit.head
    drawing(head, cx - Math.floor(head.px[0].length / 2), top - head.px.length + 1)
  }

  if (fit.keep) {
    const [x0, x1, y0, y1] = fit.keep
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (base(x, y) !== '.') set(x, y, sprite.pal[base(x, y)])
    }
  }

  const y0 = Math.min(0, ...grid.keys())
  return { y0, rows: Array.from({ length: 16 - y0 }, (_, i) => grid.get(y0 + i) ?? Array(16).fill(null)) }
}

// `worn` with one slot of one species changed. itemId null takes the slot off;
// a species with nothing left is removed.
export function wear(worn, speciesId, slot, itemId) {
  const outfit = { ...worn?.[speciesId] }
  if (itemId == null) delete outfit[slot]
  else outfit[slot] = itemId
  const next = { ...worn }
  if (Object.keys(outfit).length) next[speciesId] = outfit
  else delete next[speciesId]
  return next
}

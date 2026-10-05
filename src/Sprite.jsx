import { memo, useMemo } from 'react'
import { dress } from './wardrobe.js'

// A 16x16 pixel sprite drawn as SVG rectangles. `outfit` ({ head, face, neck, body }
// item ids, see wardrobe.js) dresses an animal. A hat can rise above the 16x16 box:
// the SVG lets it overflow, so the sprite keeps its size and place in the layout.
function Sprite({ sprite, size, label, silhouette = false, cracks, outfit, className = '' }) {
  // Merge neighbouring pixels of the same colour into one rectangle per run.
  const runs = useMemo(() => {
    const { y0, rows } = dress(sprite, silhouette ? undefined : outfit)
    for (const [x, y] of cracks || []) rows[y - y0][x] = sprite.pal.k
    const out = []
    rows.forEach((row, i) => {
      let x = 0
      while (x < row.length) {
        const c = row[x]
        if (c == null) {
          x += 1
          continue
        }
        let w = 1
        while (x + w < row.length && row[x + w] === c) w += 1
        out.push({ x, y: y0 + i, w, c })
        x += w
      }
    })
    return out
  }, [sprite, cracks, outfit, silhouette])

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      overflow="visible"
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
          fill={silhouette ? 'var(--line)' : r.c}
        />
      ))}
    </svg>
  )
}

export default memo(Sprite)

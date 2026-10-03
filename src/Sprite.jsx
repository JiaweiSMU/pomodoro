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

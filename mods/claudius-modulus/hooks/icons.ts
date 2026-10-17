// Five square pixel-art icons, 12 by 12, one flat colour each, for the desktop (where the
// band can draw an SVG image). They show how well the session is pacing toward using every
// token: a moon, a cup, speed chevrons, a lightning bolt and a flame.
//
// Each icon is a short loop of frames. The band draws it as one SVG that runs the loop by
// itself (SMIL, in the desktop's interactive SVG frame), so the band never redraws for it.

const MOON = [
  '...XXXXXX...',
  '..XXXX...XXX',
  '.XXXX.....X.',
  '.XXX.....XXX',
  'XXXX........',
  'XXXX........',
  'XXXX........',
  'XXXX........',
  '.XXX........',
  '.XXXX.......',
  '..XXXXX.....',
  '...XXXXXX...',
]

const CUP = [
  '............',
  '...X..X.....',
  '..X..X......',
  '...X..X.....',
  '............',
  '.XXXXXXXX...',
  '.XXXXXXXXXX.',
  '.XXXXXXXX..X',
  '.XXXXXXXX..X',
  '..XXXXXXX.XX',
  '..XXXXXXXXX.',
  '...XXXXXX...',
]

const CHEVRONS = [
  '............',
  '............',
  '.XX....XX...',
  '..XX....XX..',
  '...XX....XX.',
  '....XX....XX',
  '....XX....XX',
  '...XX....XX.',
  '..XX....XX..',
  '.XX....XX...',
  '............',
  '............',
]

const BOLT = [
  '.....XXXXX..',
  '....XXXXX...',
  '...XXXXX....',
  '..XXXXX.....',
  '.XXXXXXXX...',
  '.XXXXXXX....',
  '......XXX...',
  '.....XXX....',
  '....XXX.....',
  '...XXX......',
  '..XX........',
  '..X.........',
]

const FLAME = [
  '.....X......',
  '....XX......',
  '....XXX..X..',
  '...XXXXX.X..',
  '...XXXXXXXX.',
  '..XXXXXXXXX.',
  '..XXXXXXXXX.',
  '..XXXX.XXXX.',
  '..XXX...XXX.',
  '..XXXX.XXXX.',
  '...XXXXXXX..',
  '....XXXXX...',
]

type Grid = readonly string[]

// Lights extra pixels on a copy of a grid: [x, y] pairs.
function lit(grid: Grid, pixels: [number, number][]): string[] {
  const rows = grid.map(r => [...r])
  for (const [x, y] of pixels) rows[y]![x] = 'X'
  return rows.map(r => r.join(''))
}

// Moves every row's pixels right by `n`, wrapping round, so a repeating pattern marches.
function rolled(grid: Grid, n: number): string[] {
  return grid.map(r => r.slice(r.length - n) + r.slice(0, r.length - n))
}

// Asleep: a star beside the moon twinkles, slowly.
const MOON_FRAMES: Grid[] = [
  MOON,
  lit(MOON, [[9, 6]]),
  lit(MOON, [[9, 6], [8, 6], [10, 6], [9, 5], [9, 7]]),
  lit(MOON, [[9, 6]]),
]

// Warming up: the steam rises off the cup, the three wisps cycling upward.
const STEAM = [CUP[1]!, CUP[2]!, CUP[3]!]
const cupWith = (wisps: string[]) => [CUP[0]!, ...wisps, ...CUP.slice(4)]
const CUP_FRAMES: Grid[] = [
  cupWith([STEAM[0]!, STEAM[1]!, STEAM[2]!]),
  cupWith([STEAM[1]!, STEAM[2]!, STEAM[0]!]),
  cupWith([STEAM[2]!, STEAM[0]!, STEAM[1]!]),
]

// Tokenizing: the chevrons march to the right (the pattern repeats every six columns).
const CHEVRON_FRAMES: Grid[] = [CHEVRONS, rolled(CHEVRONS, 2), rolled(CHEVRONS, 4)]

// Tokenmaxxing: the bolt throws sparks, first one side then the other.
const BOLT_FRAMES: Grid[] = [
  BOLT,
  lit(BOLT, [[0, 2], [11, 7]]),
  BOLT,
  lit(BOLT, [[2, 0], [10, 9]]),
]

// Tokenzilla: the flame flickers, its tip and its spark never still.
const FLAME_FRAMES: Grid[] = [
  FLAME,
  [
    '......X.....',
    '.....XX.....',
    '....XXX.....',
    '...XXXXX..X.',
    '...XXXXXXXX.',
    '..XXXXXXXXX.',
    '..XXXXXXXXX.',
    '..XXXX.XXXX.',
    '..XXX...XXX.',
    '..XXXX.XXXX.',
    '...XXXXXXX..',
    '....XXXXX...',
  ],
  [
    '....X.......',
    '....XX......',
    '...XXX...X..',
    '...XXXX..X..',
    '..XXXXXXXXX.',
    '..XXXXXXXXX.',
    '..XXXXXXXXX.',
    '..XXXX.XXXX.',
    '..XXX...XXX.',
    '..XXXX.XXXX.',
    '...XXXXXXX..',
    '....XXXXX...',
  ],
]

export const FRAMES: readonly (readonly Grid[])[] = [
  MOON_FRAMES,
  CUP_FRAMES,
  CHEVRON_FRAMES,
  BOLT_FRAMES,
  FLAME_FRAMES,
]

// How long each frame holds, per level: the calmer the level, the slower the loop.
export const FRAME_MS: readonly number[] = [800, 400, 200, 200, 200]

// The resting frame of each level.
export const ICONS: readonly Grid[] = FRAMES.map(f => f[0]!)

// Which frame of the level's loop the clock lands on.
export function iconFrame(level: 1 | 2 | 3 | 4 | 5, now: number): number {
  const frames = FRAMES[level - 1]!
  return Math.floor(now / FRAME_MS[level - 1]!) % frames.length
}

// How far the glyph sits to the right of its box's middle, in grid units.
export const ICON_NUDGE = 1

// The centre of a grid's lit pixels, in grid units: the middle of their bounding box.
export function litCentre(grid: Grid): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  })
  return [(minX + maxX + 1) / 2, (minY + maxY + 1) / 2]
}

// A grid's lit pixels as rectangles, one per run in a row, so the image stays small and the
// pixels stay hard-edged.
function gridRects(grid: Grid): string {
  const rects: string[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (row[x] !== 'X') {
        x++
        continue
      }
      let end = x
      while (end < row.length && row[end] === 'X') end++
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1"/>`)
      x = end
    }
  })
  return rects.join('')
}

// A frame of the level's icon as an SVG. `now` picks the frame; left out, the resting one.
export function iconSvg(level: 1 | 2 | 3 | 4 | 5, color: string, now?: number): string {
  const frames = FRAMES[level - 1]!
  const rows = frames[now === undefined ? 0 : iconFrame(level, now)]!
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${iconViewBox(level)}" shape-rendering="crispEdges">` +
    `<g fill="${color}">${gridRects(rows)}</g></svg>`
  )
}

// The level's whole loop as one SVG: each frame is a group shown in its turn by a discrete
// SMIL animation, so the picture moves without the band redrawing. Where SMIL does not run,
// the resting frame shows alone.
export function iconLoopSvg(level: 1 | 2 | 3 | 4 | 5, color: string): string {
  const frames = FRAMES[level - 1]!
  const n = frames.length
  const dur = `${n * FRAME_MS[level - 1]!}ms`
  const keyTimes = frames.map((_, i) => String(Math.round((i / n) * 10000) / 10000)).join(';')
  const groups = frames.map((grid, k) => {
    const values = frames.map((_, i) => (i === k ? 'visible' : 'hidden')).join(';')
    return (
      `<g visibility="${k === 0 ? 'visible' : 'hidden'}">${gridRects(grid)}` +
      `<animate attributeName="visibility" calcMode="discrete" values="${values}" keyTimes="${keyTimes}" ` +
      `dur="${dur}" repeatCount="indefinite"/></g>`
    )
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${iconViewBox(level)}" shape-rendering="crispEdges">` +
    `<g fill="${color}">${groups.join('')}</g></svg>`
  )
}

function iconViewBox(level: 1 | 2 | 3 | 4 | 5): string {
  const frames = FRAMES[level - 1]!
  // Centre the glyph on its resting frame, so it sits in the middle of its box whatever its
  // own shape is (the bolt leans, say), and the picture holds still while the loop runs.
  // The loop's sparks can reach past the resting frame, so the box is made wide enough to
  // hold every frame, measured out from that same centre.
  const [cx, cy] = litCentre(frames[0]!)
  let half = 0
  for (const frame of frames) {
    frame.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'X') continue
        half = Math.max(half, Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy))
      }
    })
  }
  // The box is centred ICON_NUDGE to the left of the glyph, so the glyph sits that far right.
  const reach = half + ICON_NUDGE
  const side = reach * 2
  const vx = cx - ICON_NUDGE - reach
  const vy = cy - reach
  return `${vx} ${vy} ${side} ${side}`
}

// Five square pixel-art icons, 12 by 12, one flat colour each, for the desktop (where the
// band can draw an SVG image). They show how well the session is pacing toward using every
// token: a moon, a cup, speed chevrons, a lightning bolt and a flame.

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

export const ICONS: readonly (readonly string[])[] = [MOON, CUP, CHEVRONS, BOLT, FLAME]

// A grid as an SVG: each run of lit pixels in a row is one rectangle, so the image stays
// small and the pixels stay hard-edged.
export function iconSvg(level: 1 | 2 | 3 | 4 | 5, color: string): string {
  const rows = ICONS[level - 1]!
  const rects: string[] = []
  rows.forEach((row, y) => {
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
  // Crop the viewBox to the lit pixels, then make it square and centre the glyph in it, so each
  // icon sits in the middle of its box whatever its own shape is (the bolt leans left, say).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'X') continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  })
  const side = Math.max(maxX - minX + 1, maxY - minY + 1)
  const vx = minX + (maxX - minX + 1) / 2 - side / 2
  const vy = minY + (maxY - minY + 1) / 2 - side / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${side} ${side}" shape-rendering="crispEdges">` +
    `<g fill="${color}">${rects.join('')}</g></svg>`
  )
}

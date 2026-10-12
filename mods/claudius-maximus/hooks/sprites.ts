import type { ForecastState } from './logic'

// The mascot: a blocky little Claude, one solid shape in one flat colour, drawn in 6 by 4
// pixels. Four pixels share a text cell (quadrant blocks), so it is 3 cells wide and 2
// rows tall. Eyes and mouth are cut-outs. Five levels show how well the session is pacing
// toward using every token; the shape and the colour change, nothing is shaded.

export const LEVEL_NAMES = ['Napping', 'Warming up', 'Cruising', 'Maxxing', 'Inferno'] as const

const SPRITES: readonly (readonly string[])[] = [
  // 1 Napping: lying flat, eyes shut, a snore
  ['.....X', '.XXXX.', 'XXXXXX', 'XXXXXX'],
  // 2 Warming up: eyes open, a yawn
  ['.XXXX.', 'X.XX.X', 'XX..XX', '.XXXX.'],
  // 3 Cruising: eyes open, standing on its feet
  ['.XXXX.', 'X.XX.X', 'XXXXXX', '.X..X.'],
  // 4 Maxxing: sparks up on both sides
  ['X....X', 'X.XX.X', 'XXXXXX', '.X..X.'],
  // 5 Inferno: flames, eyes, mouth wide open
  ['X.XX.X', 'X.XX.X', 'XX..XX', '.XXXX.'],
]

const COLORS = ['#7f869e', '#bd7a55', '#d97757', '#f58f5f', '#ff5a36']

// top-left, top-right, bottom-left, bottom-right
const QUADRANTS: Record<string, string> = {
  '0000': ' ',
  '1000': '▘',
  '0100': '▝',
  '0010': '▖',
  '0001': '▗',
  '1100': '▀',
  '0011': '▄',
  '1010': '▌',
  '0101': '▐',
  '1001': '▚',
  '0110': '▞',
  '1110': '▛',
  '1101': '▜',
  '1011': '▙',
  '0111': '▟',
  '1111': '█',
}

export type PixelCell = { ch: string; color: string }

// 1 to 5. Idle is asleep, an unread pace is warming up, a pace that will not last to
// the reset is the top level, and in between it follows where the pace ends the window.
export function pacingLevel(state: ForecastState, projected: number): 1 | 2 | 3 | 4 | 5 {
  if (state === 'danger' || state === 'limit') return 5
  if (state === 'idle') return 1
  if (state === 'none' || state === 'calibrating') return 2
  if (projected < 25) return 1
  if (projected < 50) return 2
  if (projected < 80) return 3
  return 4
}

export function spriteCells(level: 1 | 2 | 3 | 4 | 5): PixelCell[][] {
  const px = SPRITES[level - 1]!
  const color = COLORS[level - 1]!
  const on = (r: number, c: number) => (px[r]![c] === 'X' ? '1' : '0')
  const rows: PixelCell[][] = []
  for (let r = 0; r < 2; r++) {
    const row: PixelCell[] = []
    for (let c = 0; c < 3; c++) {
      const key = on(2 * r, 2 * c) + on(2 * r, 2 * c + 1) + on(2 * r + 1, 2 * c) + on(2 * r + 1, 2 * c + 1)
      row.push({ ch: QUADRANTS[key]!, color })
    }
    rows.push(row)
  }
  return rows
}

// The collapsed band's tiny sprite: one block, taller the better the pacing, in the level's colour.
const GLYPHS = ['▂', '▃', '▄', '▆', '█']
export function levelGlyph(level: 1 | 2 | 3 | 4 | 5): PixelCell {
  return { ch: GLYPHS[level - 1]!, color: COLORS[level - 1]! }
}

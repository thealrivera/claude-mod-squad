import { lerp } from './logic'
import type { ForecastState } from './logic'

// The mascot: a blocky little Claude, drawn in 8 by 6 pixels. Two pixels share a text
// cell (half blocks), so a sprite is 8 cells wide and 3 rows tall. Five levels show how
// well the session is pacing toward using every token.
//   O body  D shade  K eye/mouth  Y spark  R flame/brow  Z snore  W glint  . backdrop

export const LEVEL_NAMES = ['Napping', 'Warming up', 'Cruising', 'Maxxing', 'Inferno'] as const

const SPRITES: readonly (readonly string[])[] = [
  // 1 Napping: eyes shut, a snore, grey and low
  ['..OOOOZ.', '.OOOOOO.', 'OODOODOO', '.OOOOOO.', '.OOOOOO.', '.D.DD.D.'],
  // 2 Warming up: eyes open, a yawn
  ['..OOOO..', '.OOOOOO.', 'OOKOOKOO', '.OOKKOO.', '.OOOOOO.', '.D.DD.D.'],
  // 3 Cruising: eyes open, a smile
  ['..OOOO..', '.OOOOOO.', 'OOKOOKOO', '.OKOOKO.', '.OOKKOO.', '.D.DD.D.'],
  // 4 Maxxing: sparks, glinting eyes, a big grin
  ['Y.OOOO.Y', '.OOOOOO.', 'OKWOOWKO', '.OKKKKO.', '.OOKKOO.', '.D.DD.D.'],
  // 5 Inferno: flames, angry brows, mouth wide open
  ['.R.YY.R.', '.OROORO.', 'OOKOOKOO', '.OKKKKO.', '.OOKKOO.', '.D.DD.D.'],
]

const BODY = ['#7f869e', '#bd7a55', '#d97757', '#f58f5f', '#ff5a36']
const BACKDROP = '#262932'

export type PixelCell = { ch: string; color: string; bg?: string }

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
  const body = BODY[level - 1]!
  const palette: Record<string, string> = {
    O: body,
    D: lerp(body, '#000000', 0.3),
    K: '#17181d',
    Y: '#ffd166',
    R: '#ef4444',
    Z: '#9fb3ff',
    W: '#ffffff',
    '.': BACKDROP,
  }
  const at = (r: number, c: number) => palette[px[r]![c]!]!
  const rows: PixelCell[][] = []
  for (let r = 0; r < 3; r++) {
    const row: PixelCell[] = []
    for (let c = 0; c < 8; c++) {
      const top = at(2 * r, c)
      const bottom = at(2 * r + 1, c)
      row.push(top === bottom ? { ch: '█', color: top } : { ch: '▀', color: top, bg: bottom })
    }
    rows.push(row)
  }
  return rows
}

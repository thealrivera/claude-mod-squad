import type { ForecastState } from './logic'

// How well the session is pacing toward using every token, in five levels. The symbol is
// a five-bar meter, like signal strength: one bar lit is the lowest level, five the top.

export const LEVEL_NAMES = ['You have work to do', 'Warming Up', 'Tokenizing', 'Tokenmaxxing', 'Tokenzilla'] as const

const COLORS = ['#7f869e', '#bd7a55', '#d97757', '#f58f5f', '#ff5a36']
const UNLIT = '#343950'
const BARS = ['▂', '▃', '▅', '▇', '█']

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

export const levelColor = (level: 1 | 2 | 3 | 4 | 5) => COLORS[level - 1]!

// Five bars, rising; the first `level` are lit in the level's colour, the rest are dark.
export function levelMeter(level: 1 | 2 | 3 | 4 | 5): PixelCell[] {
  return BARS.map((ch, i) => ({ ch, color: i < level ? COLORS[level - 1]! : UNLIT }))
}

// The collapsed band's tiny symbol: one bar, as tall as the level.
export function levelGlyph(level: 1 | 2 | 3 | 4 | 5): PixelCell {
  return { ch: BARS[level - 1]!, color: COLORS[level - 1]! }
}

// The blinking cursor before the brand: a thin block that fades in and out on a cosine,
// so it eases like a calm blink rather than snapping on and off.
export const CURSOR = '▌'
export const CURSOR_MS = 200
const CURSOR_FRAMES = 6

// 1 = fully lit, 0 = faded into the background.
export function cursorGlow(now: number): number {
  const i = Math.floor(now / CURSOR_MS) % CURSOR_FRAMES
  return (1 + Math.cos((2 * Math.PI * i) / CURSOR_FRAMES)) / 2
}

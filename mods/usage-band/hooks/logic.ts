import type { Limit, Sample } from '../types'

const MINUTE = 60_000
const HOUR = 3_600_000
const WINDOW = 5 * HOUR
const LOOKBACK = 45 * MINUTE
const IDLE_AFTER = 20 * MINUTE
const MIN_SPAN = 15 * MINUTE
const MIN_ELAPSED = 10 * MINUTE
const KEEP = 90

export const FIVE_HOUR = 'five_hour'
export const SEVEN_DAY = 'seven_day'

export function resetMs(limit: Limit | undefined): number | undefined {
  if (!limit?.resetsAt) return undefined
  const ms = Date.parse(limit.resetsAt)
  return Number.isNaN(ms) ? undefined : ms
}

// Appends a reading of the five-hour window; a falling percentage or a moved
// reset time means the window rolled over, so the old readings are dropped.
export function pushSample(prev: Sample[], now: number, limit: Limit): Sample[] {
  const r = resetMs(limit)
  const last = prev.at(-1)
  let kept = prev
  if (last) {
    const isRolled =
      limit.percentUsed < last.p - 0.5 ||
      (r !== undefined && last.r !== undefined && Math.abs(r - last.r) > 10 * MINUTE)
    if (isRolled) kept = []
  }
  const tail = kept.at(-1)
  const isNew = !tail || tail.p !== limit.percentUsed || now - tail.t >= 5 * MINUTE
  if (!isNew) return kept
  return [...kept, { t: now, p: limit.percentUsed, r }].slice(-KEEP)
}

export type ForecastState = 'none' | 'calibrating' | 'idle' | 'ok' | 'tight' | 'danger' | 'limit'

export type Forecast = {
  state: ForecastState
  percent: number
  ratePerHour: number
  projected: number
  msToReset: number | undefined
  msToEmpty: number | undefined
}

// Projects the five-hour window to its reset. The pace blends two readings so one
// big turn cannot swing it: the window's own average (used so far, over the time
// since it opened) and the last 45 minutes of readings, each over at least 15
// minutes. Nothing new for 20 minutes counts as idle.
export function forecast(samples: Sample[], limit: Limit | undefined, now: number): Forecast {
  const percent = limit?.percentUsed ?? 0
  const reset = resetMs(limit)
  const msToReset = reset === undefined ? undefined : Math.max(0, reset - now)
  const base: Forecast = {
    state: 'none',
    percent,
    ratePerHour: 0,
    projected: percent,
    msToReset,
    msToEmpty: undefined,
  }
  if (!limit) return base
  if (percent >= 100) return { ...base, state: 'limit', projected: percent }

  const last = samples.at(-1)
  if (last && now - last.t >= IDLE_AFTER) return { ...base, state: 'idle' }

  const elapsed = msToReset === undefined ? undefined : Math.min(WINDOW, WINDOW - msToReset)
  const avg =
    elapsed !== undefined && elapsed >= MIN_ELAPSED
      ? percent / (Math.max(elapsed, MIN_SPAN) / HOUR)
      : undefined

  const recent = samples.filter(s => now - s.t <= LOOKBACK)
  const first = recent[0]
  const burst =
    first && recent.length >= 2
      ? Math.max(0, percent - first.p) / (Math.max(now - first.t, MIN_SPAN) / HOUR)
      : undefined

  const ratePerHour =
    avg !== undefined && burst !== undefined ? (avg + burst) / 2 : (avg ?? burst)
  if (ratePerHour === undefined) return { ...base, state: 'calibrating' }
  if (ratePerHour < 0.05) return { ...base, state: 'idle', ratePerHour }

  const hoursToReset = (msToReset ?? 0) / HOUR
  const projected = percent + ratePerHour * hoursToReset
  const msToEmpty = ((100 - percent) / ratePerHour) * HOUR
  const common = { ...base, ratePerHour, projected, msToEmpty }

  if (msToReset !== undefined && msToEmpty < msToReset) return { ...common, state: 'danger' }
  return { ...common, state: projected >= 80 ? 'tight' : 'ok' }
}

export function fmtDur(ms: number | undefined): string {
  if (ms === undefined) return '?'
  const mins = Math.round(ms / MINUTE)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h >= 48) return `${Math.round(h / 24)}d`
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function fmtPct(p: number): string {
  return `${p >= 10 || Number.isInteger(p) ? Math.round(p) : p.toFixed(1)}%`
}

// claude-sonnet-5-5 -> "Sonnet 5.5"; claude-opus-5-5[1m] -> "Opus 5.5 1M".
export function prettyModel(id: string | null): string {
  if (!id) return 'model ?'
  const is1m = /\[1m\]/i.test(id)
  const m = id.replace(/\[.*?\]/g, '').match(/^(?:claude-)?([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/)
  if (!m) return id.replace(/^claude-/, '') + (is1m ? ' 1M' : '')
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}${is1m ? ' 1M' : ''}`
}

export type WarnKind = 'extra' | 'max' | 'ultracode' | 'overage'
export type Warning = { kind: WarnKind; label: string; detail: string }

export const WARN_RANK: Record<WarnKind, number> = { extra: 1, max: 2, overage: 3, ultracode: 4 }

export function warnings(
  effort: string | null,
  isUltracode: boolean,
  limits: Limit[],
): Warning[] {
  const out: Warning[] = []
  if (isUltracode) {
    out.push({
      kind: 'ultracode',
      label: 'ULTRACODE',
      detail: 'multi-agent run, usage can spike fast',
    })
  }
  if (effort === 'max') {
    out.push({ kind: 'max', label: 'MAX EFFORT', detail: 'maximum thinking, uses your limit fastest' })
  } else if (effort === 'xhigh') {
    out.push({ kind: 'extra', label: 'EXTRA EFFORT', detail: 'xhigh thinking, uses your limit faster' })
  }
  const hit = limits.find(l => l.percentUsed >= 100)
  if (hit) {
    out.push({
      kind: 'overage',
      label: 'EXTRA USAGE',
      detail: `${hit.kind === SEVEN_DAY ? '7-day' : hit.kind === FIVE_HOUR ? '5-hour' : 'spend'} limit reached, further use may bill as extra`,
    })
  }
  return out.sort((a, b) => WARN_RANK[b.kind] - WARN_RANK[a.kind])
}

export function worstRank(list: Warning[]): number {
  return list.reduce((n, w) => Math.max(n, WARN_RANK[w.kind]), 0)
}

// ---- colour -------------------------------------------------------------

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]

export function lerp(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  const k = Math.min(1, Math.max(0, t))
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`
}

// Colour at position t (0..1) across several stops.
export function ramp(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0]!
  const x = Math.min(0.999999, Math.max(0, t)) * (stops.length - 1)
  const i = Math.floor(x)
  return lerp(stops[i]!, stops[i + 1]!, x - i)
}

export const PAL = {
  violet: '#7d66ff',
  indigo: '#5b6cff',
  blue: '#3b82f6',
  cyan: '#22d3ee',
  mint: '#34d399',
  lime: '#e6ff65',
  amber: '#fbbf24',
  orange: '#fb923c',
  red: '#f43f5e',
  magenta: '#e879f9',
  ink: '#0b1020',
  text: '#e5e7f5',
  mute: '#8b93b5',
  track: '#2b3150',
} as const

export const TRACK = '#3a3f55'

const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

export type BarCell = { ch: string; kind: 'used' | 'projected' | 'track' }

// One bar, three shades: solid for what is used, dim for where the current pace
// ends the window, a dark track for the rest. Eighth blocks smooth the used tip.
export function barCells(used: number, projected: number, width: number): BarCell[] {
  const units = (p: number) => (Math.min(100, Math.max(0, p)) / 100) * width
  const u = units(used)
  const full = Math.floor(u)
  const part = Math.floor((u - full) * 8)
  const end = Math.round(Math.max(u, units(projected)))
  const cells: BarCell[] = []
  for (let i = 0; i < width; i++) {
    if (i < full) cells.push({ ch: '█', kind: 'used' })
    else if (i === full && part > 0) cells.push({ ch: PARTIALS[part]!, kind: 'used' })
    else if (i < end) cells.push({ ch: '█', kind: 'projected' })
    else cells.push({ ch: '█', kind: 'track' })
  }
  return cells
}

// The same hue, pulled toward the track: what "projected" is drawn in.
export function dim(color: string): string {
  return lerp(color, TRACK, 0.62)
}

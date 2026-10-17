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

const WEEK = 7 * 24 * HOUR
const WEEK_MIN_ELAPSED = 12 * HOUR

export type WeekPace = { projected: number; msToReset: number; msToEmpty: number; runsOut: boolean }

// The seven-day window at the pace of the week so far: what it has used over the time since
// it opened. Half a day in, the pace means something; before then, or with nothing used,
// there is none.
export function weekPace(limit: Limit | undefined, now: number): WeekPace | undefined {
  const reset = resetMs(limit)
  if (!limit || reset === undefined) return undefined
  const msToReset = Math.max(0, reset - now)
  const elapsed = WEEK - msToReset
  if (elapsed < WEEK_MIN_ELAPSED || limit.percentUsed <= 0) return undefined
  const perMs = limit.percentUsed / elapsed
  const msToEmpty = Math.max(0, (100 - limit.percentUsed) / perMs)
  return { projected: limit.percentUsed + perMs * msToReset, msToReset, msToEmpty, runsOut: msToEmpty < msToReset }
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

// Collapsed band: Sonnet 5.5 -> "S 5.5", Opus 5.5 1M -> "O 5.5 1M".
export function shortModel(id: string | null): string {
  if (!id) return '?'
  const [first, ...rest] = prettyModel(id).split(' ')
  if (!first || rest.length === 0) return '?'
  return `${first[0]!.toUpperCase()} ${rest.join(' ')}`
}

const SHORT_EFFORT: Record<string, string> = { low: 'Low', medium: 'Med', high: 'High', xhigh: 'XHi', max: 'Max' }
export const shortEffort = (e: string): string => SHORT_EFFORT[e] ?? e.slice(0, 4)

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

// ---- overkill ------------------------------------------------------------
// A heuristic, not a verdict: a short prompt with no code, paths or work verbs reads as a
// quick back and forth. Running ultracode, xhigh or max effort on it burns the limit for
// nothing, so the band says so, once per streak.
export const OVERKILL_MAX_CHARS = 160
export const OVERKILL_STREAK = 2
const WORK_WORD =
  /\b(implement|refactor|build|migrate|rewrite|debug|deploy|audit|review|investigate|fix|write|create|add|remove|rename|test|plan|design|analy[sz]e)\b/i
const CODE_SIGN = /```|`[^`]+`|\S+\.[a-z]{1,5}\b|[/\\]\w|[{}();=<>]/i

export function isSimplePrompt(text: string): boolean {
  const t = text.trim()
  if (t.length === 0 || t.length > OVERKILL_MAX_CHARS) return false
  if (t.includes('\n')) return false
  return !WORK_WORD.test(t) && !CODE_SIGN.test(t)
}

// What is running hot, in words, or null when the settings are fine for any task.
export function heavySetting(effort: string | null, isUltracode: boolean): string | null {
  if (isUltracode) return 'Ultracode'
  if (effort === 'max') return 'Max effort'
  if (effort === 'xhigh') return 'XHigh effort'
  return null
}

// The run of simple prompts under heavy settings. It toasts once, when the run reaches
// OVERKILL_STREAK, and starts over after any other prompt.
export function nextStreak(prev: number, simple: boolean, heavy: boolean): { streak: number; toast: boolean } {
  if (!simple || !heavy) return { streak: 0, toast: false }
  const streak = prev + 1
  return { streak, toast: streak === OVERKILL_STREAK }
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

export const TRACK = '#2b3048'

// One gradient across the whole bar, so a fuller bar shows more of the ramp.
export const BAR_GRADIENT = [PAL.mint, '#a3e635', PAL.amber, PAL.orange, PAL.red]

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

export type BarCell = { ch: string; color: string; bg?: string }

// The same hue, pulled toward the track: what "projected" is drawn in.
export function dim(color: string): string {
  return lerp(color, TRACK, 0.62)
}

// A bar in eighths of a cell. Solid is used, a ghost of the same gradient runs on to
// where the current pace ends the window, and a dark track holds the rest. A cell that
// holds an edge is a thin block over the colour that follows it, so the tip is smooth.
export function barCells(used: number, projected: number, width: number): BarCell[] {
  const eighths = (p: number) => Math.round((Math.min(100, Math.max(0, p)) / 100) * width * 8)
  const u = eighths(used)
  const pr = Math.max(u, eighths(projected))
  const cells: BarCell[] = []
  for (let i = 0; i < width; i++) {
    const hue = ramp(BAR_GRADIENT, (i + 0.5) / width)
    const ghost = dim(hue)
    const usedFill = Math.min(8, Math.max(0, u - i * 8))
    const projFill = Math.min(8, Math.max(0, pr - i * 8))
    if (usedFill === 8) {
      cells.push({ ch: '█', color: hue })
    } else if (usedFill > 0) {
      cells.push({ ch: EIGHTHS[usedFill]!, color: hue, bg: projFill - usedFill >= 4 ? ghost : TRACK })
    } else if (projFill === 8) {
      cells.push({ ch: '█', color: ghost })
    } else if (projFill > 0) {
      cells.push({ ch: EIGHTHS[projFill]!, color: ghost, bg: TRACK })
    } else {
      cells.push({ ch: '█', color: TRACK })
    }
  }
  return cells
}

// The cell that holds the edge at p percent: where a marker goes.
export function markerIdx(p: number, width: number): number {
  return Math.min(width - 1, Math.max(0, Math.floor((Math.min(100, Math.max(0, p)) / 100) * width)))
}

// A thick half-block line, and two colours that are neither the bar's gradient nor alike.
export const MARK = '▌'
export const BURN_MARK = '#38bdf8'
export const PACE_MARK = '#f472b6'
export const POTENTIAL = 'POTENTIAL'

// The bar with two vertical markers: "Burned" where usage stands now and, when a pace
// is known, "Pace Burn" where that pace ends the window. A marker is a line glyph that
// takes the place of the cell holding the edge. If the gray section after the pace
// marker has room, a tiny POTENTIAL is written across it.
export function barWithMarkers(
  used: number,
  projected: number,
  width: number,
  showPace: boolean,
): BarCell[] {
  const cells = barCells(used, showPace ? projected : used, width)
  const idx = (p: number) => markerIdx(p, width)
  const mark = (i: number, color: string) => {
    const base = cells[i]!
    cells[i] = { ch: MARK, color, bg: base.ch === '█' ? base.color : (base.bg ?? TRACK) }
  }

  const burned = idx(used)
  const pace = idx(projected)
  const hasPace = showPace && pace > burned

  if (hasPace) {
    const room = width - 1 - pace
    if (room >= POTENTIAL.length + 3) {
      const start = pace + 1 + Math.floor((room - POTENTIAL.length) / 2)
      for (let k = 0; k < POTENTIAL.length; k++) {
        const base = cells[start + k]!
        cells[start + k] = { ch: POTENTIAL[k]!, color: lerp(base.color, '#ffffff', 0.4), bg: base.color }
      }
    }
    mark(pace, PACE_MARK)
  }
  mark(burned, BURN_MARK)
  return cells
}

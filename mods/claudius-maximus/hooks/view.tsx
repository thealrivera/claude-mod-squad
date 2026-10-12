import type { ElementTable, RenderElement } from 'claude-code'

import type { Limit, Sample } from '../types'
import {
  FIVE_HOUR,
  PAL,
  SEVEN_DAY,
  barCells,
  fmtDur,
  fmtPct,
  forecast,
  prettyModel,
  ramp,
  warnings,
} from './logic'
import type { Forecast, WarnKind } from './logic'
import { QUIPS, rowFor } from './quips'
import { BRAND, versionLabel } from './version'

export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text'>

export type BandData = {
  model: string | null
  effort: string | null
  isUltracode: boolean
  isPlan: boolean
  limits: Limit[]
  samples: Sample[]
  costUsd: number | null
  ctxPercent: number | null
  now: number
  phase: number
  cols: number
}

// Colour carries meaning only: green fine, amber watch, red act, blue neutral.
const GOOD = PAL.mint
const WATCH = PAL.amber
const BAD = PAL.red
const NEUTRAL = '#8fb4ff'

const STATUS: Record<Forecast['state'], string> = {
  none: NEUTRAL,
  calibrating: NEUTRAL,
  idle: NEUTRAL,
  ok: GOOD,
  tight: WATCH,
  danger: BAD,
  limit: BAD,
}

const WARN_COLOR: Record<WarnKind, string> = {
  extra: PAL.amber,
  max: PAL.orange,
  overage: PAL.red,
  ultracode: PAL.magenta,
}

const EFFORT_GRADIENT: Record<string, string[]> = {
  low: ['#475569', '#64748b'],
  medium: ['#3b5bdb', PAL.blue],
  high: [PAL.blue, PAL.cyan],
  xhigh: [PAL.amber, PAL.orange],
  max: [PAL.orange, PAL.red],
}

const EFFORT_GLYPH: Record<string, string> = {
  low: '◔',
  medium: '◑',
  high: '◕',
  xhigh: '◉',
  max: '⬤',
}

const LABEL = 'Session'

export function band(ui: Ui, d: BandData) {
  const { Box, Text } = ui

  // The two chips are the only backgrounds in the band.
  const chip = (label: string, stops: string[], fg: string = PAL.ink) => (
    <Text bold>
      {[...` ${label} `].map((c, i, a) => (
        <Text key={String(i)} color={fg} backgroundColor={ramp(stops, i / (a.length - 1))}>
          {c}
        </Text>
      ))}
    </Text>
  )

  const five = d.limits.find(l => l.kind === FIVE_HOUR)
  const week = d.limits.find(l => l.kind === SEVEN_DAY)
  const fc = forecast(d.samples, five, d.now)
  const warns = warnings(d.effort, d.isUltracode, d.limits)

  const vLabel = versionLabel()
  const budget = d.cols

  // ---- the chips: which model, how hard it is thinking -------------------

  const model = prettyModel(d.model)
  const chips: RenderElement[] = [chip(`◆ ${model}`, [PAL.violet, PAL.blue], '#ffffff')]
  let chipsWidth = model.length + 4
  if (d.effort) {
    const stops = EFFORT_GRADIENT[d.effort] ?? EFFORT_GRADIENT.medium!
    const glyph = EFFORT_GLYPH[d.effort] ?? '◑'
    chips.push(chip(`${glyph} ${d.effort}`, stops, d.effort === 'low' ? '#e2e8f0' : PAL.ink))
    chipsWidth += d.effort.length + 5 + 1
  }

  // ---- the one line: session usage and whether it will last --------------

  // Things that only show up when they matter, so the line stays quiet.
  const extras: { text: string; color: string }[] = []
  if (week && week.percentUsed >= 80) {
    extras.push({
      text: `week ${fmtPct(week.percentUsed)}`,
      color: week.percentUsed >= 95 ? BAD : WATCH,
    })
  }
  if (d.ctxPercent !== null && d.ctxPercent >= 85) {
    extras.push({
      text: `context ${fmtPct(d.ctxPercent)} full`,
      color: d.ctxPercent >= 95 ? BAD : WATCH,
    })
  }

  let usage: RenderElement
  let verdict = ''
  let verdictColor: string = PAL.mute
  if (!five) {
    // No plan limits: say so plainly, and show cost only for API billing.
    const showCost = !d.isPlan && d.costUsd !== null && d.costUsd > 0
    usage = (
      <Text wrap="truncate" color={PAL.mute}>
        {showCost ? `$${d.costUsd!.toFixed(2)} this session` : 'usage shows after your first response'}
      </Text>
    )
  } else {
    const color = STATUS[fc.state]
    const pct = fmtPct(five.percentUsed)
    const resets = fc.msToReset === undefined ? '' : `resets ${fmtDur(fc.msToReset)}`
    const projected = fmtPct(Math.min(100, fc.projected))
    switch (fc.state) {
      case 'ok':
        verdict = `▸ ${projected} by reset`
        verdictColor = GOOD
        break
      case 'tight':
        verdict = `▸ ${projected} by reset`
        verdictColor = WATCH
        break
      case 'danger':
        verdict = `▸ out in ~${fmtDur(fc.msToEmpty)}`
        verdictColor = BAD
        break
      case 'limit':
        verdict = '▸ limit reached'
        verdictColor = BAD
        break
      case 'idle':
        verdict = '▸ idle'
        break
      default:
        break
    }

    // Rare extras come before the bar shrinks below a readable size.
    const fixed = chipsWidth + 2 + LABEL.length + 1 + 1 + pct.length + 2 + resets.length
    const tail = (n: number) => extras.slice(0, n).reduce((sum, x) => sum + x.text.length + 3, 0)
    let keep = extras.length
    while (keep > 0 && budget - fixed - tail(keep) < 10) keep--
    const width = Math.max(8, Math.min(36, budget - fixed - tail(keep)))
    const cells = barCells(five.percentUsed, fc.projected, width, d.phase)

    usage = (
      <Text wrap="truncate">
        <Text color={PAL.mute}>{LABEL} </Text>
        {cells.map((cell, i) => (
          <Text
            key={String(i)}
            color={cell.color}
            {...(cell.bg ? { backgroundColor: cell.bg } : {})}
          >
            {cell.ch}
          </Text>
        ))}
        <Text color={color} bold>
          {' '}
          {pct}
        </Text>
        <Text color={PAL.mute}>  {resets}</Text>
        {extras.slice(0, keep).map(x => (
          <Text key={x.text}>
            <Text color={PAL.mute}> · </Text>
            <Text color={x.color} bold>
              {x.text}
            </Text>
          </Text>
        ))}
      </Text>
    )
  }

  // ---- row 2: the verdict, then the warning and the quips taking turns ---

  const top = warns[0]
  const pick = rowFor(d.now, warns.length > 0)
  const rest: RenderElement =
    pick.kind === 'alert' && top ? (
      <Text color={WARN_COLOR[top.kind]}>
        <Text bold>⚠ {warns.map(w => w.label).join(' + ')}</Text>
        <Text>  {top.detail}</Text>
      </Text>
    ) : (
      <Text>
        <Text color={PAL.violet}>✦ </Text>
        <Text color={PAL.mute} italic>
          {QUIPS[pick.kind === 'quip' ? pick.index : 0]}
        </Text>
      </Text>
    )
  const second: RenderElement = (
    <Text wrap="truncate">
      {verdict ? (
        <Text>
          <Text color={verdictColor} bold>
            {verdict}
          </Text>
          <Text color={PAL.mute}>  ·  </Text>
        </Text>
      ) : null}
      {rest}
    </Text>
  )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {chips}
        <Box flexShrink={1}>{usage}</Box>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexShrink={1}>{second}</Box>
        <Box flexDirection="row" gap={1}>
          <Text>
            {[...BRAND].map((c, i, a) => (
              <Text key={String(i)} color={ramp([PAL.violet, PAL.cyan], i / (a.length - 1))}>
                {c}
              </Text>
            ))}
          </Text>
          <Text color={PAL.mute} dimColor>
            {vLabel}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

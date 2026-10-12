import type { ElementTable, RenderElement } from 'claude-code'

import type { Limit, Sample } from '../types'
import {
  BURN_MARK,
  FIVE_HOUR,
  MARK,
  PAL,
  SEVEN_DAY,
  barWithMarkers,
  fmtDur,
  fmtPct,
  forecast,
  markerIdx,
  prettyModel,
  ramp,
  warnings,
} from './logic'
import type { Forecast, WarnKind } from './logic'
import { QUIPS, rowFor } from './quips'
import { LEVEL_NAMES, levelGlyph, pacingLevel, spriteCells } from './sprites'
import { pieGlyph, ringSvg } from './work'
import type { Work } from './work'
import { BRAND, versionLabel } from './version'

export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

export type BandData = {
  model: string | null
  effort: string | null
  isUltracode: boolean
  isPlan: boolean
  isCollapsed: boolean
  work: Work | null
  onToggle: () => void | Promise<void>
  limits: Limit[]
  samples: Sample[]
  costUsd: number | null
  ctxPercent: number | null
  now: number
  surface: string
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

// The label column. Every row that sits against the bar starts after it, so the
// rows stay aligned whatever the label says.
const LABEL = 'Session'

export function band(ui: Ui, d: BandData) {
  const { Box, Text, Button } = ui
  const Svg = (ui as unknown as { Svg?: ElementTable<'desktop'>['Svg'] }).Svg

  // The block glyphs of the bar draw two text columns wide in the desktop app and one
  // in a terminal. Everything positioned against the bar is counted in text columns.
  const cellCols = d.surface === 'terminal' ? 1 : 2

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

  // The mascot and how well the session is pacing.
  const level = pacingLevel(fc.state, fc.projected)
  const icon = (
    <Box flexDirection="column">
      {spriteCells(level).map((row, r) => (
        <Text key={String(r)}>
          {row.map((cell, c) => (
            <Text key={String(c)} color={cell.color}>
              {cell.ch}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )

  // The ring of background work: on the desktop an SVG, in a terminal a pie and a count.
  let ring: RenderElement | null = null
  if (d.work) {
    const w = d.work
    const eta = w.running === 0 ? 'done' : w.etaMs === undefined ? 'working' : `~${fmtDur(w.etaMs)}`
    const top = `${w.done}/${w.total}`
    ring = Svg ? (
      <Svg
        source={ringSvg(w.fraction, top, eta)}
        alt={`${w.running} agents running, ${w.done} of ${w.total} done, ${eta}`}
        width={64}
        height={64}
      />
    ) : (
      <Text>
        <Text color={PAL.cyan} bold>
          {pieGlyph(w.fraction)}
        </Text>
        <Text color={PAL.text}> {top} agents</Text>
        <Text color={PAL.mute}> · {eta}</Text>
      </Text>
    )
  }

  // The forecast, in words.
  const early = (fc.msToReset ?? 0) - (fc.msToEmpty ?? 0)
  let verdict = ''
  let verdictColor: string = PAL.mute
  if (five) {
    switch (fc.state) {
      case 'danger':
        verdict = `You'll hit the limit in ~${fmtDur(fc.msToEmpty)}, ${fmtDur(early)} before it resets.`
        verdictColor = BAD
        break
      case 'ok':
      case 'tight':
        verdict = `On track to end the session near ${fmtPct(Math.min(100, fc.projected))}.`
        verdictColor = fc.state === 'ok' ? GOOD : WATCH
        break
      case 'limit':
        verdict = 'Limit reached. It resets when the timer runs out.'
        verdictColor = BAD
        break
      case 'idle':
        verdict = 'Quiet right now, nothing is burning.'
        break
      default:
        verdict = 'Still learning your pace.'
    }
  }

  // ---- row 1: what is running, and who is running it ---------------------

  const model = prettyModel(d.model)
  const chips: RenderElement[] = [chip(`◆ ${model}`, [PAL.violet, PAL.blue], '#ffffff')]
  if (d.effort) {
    const stops = EFFORT_GRADIENT[d.effort] ?? EFFORT_GRADIENT.medium!
    const glyph = EFFORT_GLYPH[d.effort] ?? '◑'
    chips.push(chip(`${glyph} ${d.effort}`, stops, d.effort === 'low' ? '#e2e8f0' : PAL.ink))
  }
  // Text columns the chips take, so the session block beside them gets the rest.
  const chipsWidth = model.length + 4 + (d.effort ? 1 + d.effort.length + 5 : 0)
  const leftCols = chipsWidth
  // The toggle takes 5 columns at the right edge. Collapsed, the block shares the one
  // line with a one-character sprite, the chips and the toggle.
  const ringCols = d.work && !d.isCollapsed ? (Svg ? 6 : 16) : 0
  const blockCols = d.isCollapsed
    ? d.cols - 2 - chipsWidth - 2 - 5
    : d.cols - 3 * cellCols - leftCols - 4 - ringCols
  const toggle = (
    <Button key="toggle" label={d.isCollapsed ? ' + ' : ' − '} onPress={d.onToggle} />
  )

  const brand = (
    <Box flexDirection="row" gap={1}>
      <Text>
        {[...BRAND].map((c, i, a) => (
          <Text key={String(i)} color={ramp([PAL.violet, PAL.cyan], i / (a.length - 1))}>
            {c}
          </Text>
        ))}
      </Text>
      <Text color={PAL.mute} dimColor>
        {versionLabel()}
      </Text>
    </Box>
  )

  // ---- rows 2 and 3: the session bar, and the labels under its markers ---

  // Things that only show up when they matter, so the row stays quiet.
  const extras: { text: string; color: string }[] = []
  if (week && week.percentUsed >= 80) {
    extras.push({ text: `week ${fmtPct(week.percentUsed)}`, color: week.percentUsed >= 95 ? BAD : WATCH })
  }
  if (d.ctxPercent !== null && d.ctxPercent >= 85) {
    extras.push({ text: `context ${fmtPct(d.ctxPercent)} full`, color: d.ctxPercent >= 95 ? BAD : WATCH })
  }

  let barRow: RenderElement
  let usedLine: RenderElement | null = null
  let labelRow: RenderElement | null = null

  if (!five) {
    // No plan limits: say so plainly, and show cost only for API billing.
    const showCost = !d.isPlan && d.costUsd !== null && d.costUsd > 0
    barRow = (
      <Text wrap="truncate" color={PAL.mute}>
        {showCost ? `$${d.costUsd!.toFixed(2)} this session` : 'usage shows after your first response'}
      </Text>
    )
  } else {
    const color = STATUS[fc.state]
    const pct = fmtPct(five.percentUsed)
    usedLine = (
      <Text>
        <Text color={PAL.mute}>{LABEL} </Text>
        <Text color={color} bold>
          {pct}
        </Text>
        <Text color={PAL.mute}> used  ·  {LEVEL_NAMES[level - 1]}</Text>
      </Text>
    )
    const resets = fc.msToReset === undefined ? '' : `resets in ${fmtDur(fc.msToReset)}`
    // Room for the bar, in text columns, after everything else on its row.
    const tailCols =
      2 + resets.length + extras.reduce((n, x) => n + x.text.length + 3, 0)
    let keep = extras.length
    const room = (k: number) =>
      blockCols - tailCols + extras.slice(k).reduce((n, x) => n + x.text.length + 3, 0)
    while (keep > 0 && room(keep) < 8 * cellCols) keep--
    const width = Math.max(8, Math.min(cellCols === 2 ? 30 : 40, Math.floor(room(keep) / cellCols)))
    const cells = barWithMarkers(five.percentUsed, five.percentUsed, width, false)

    barRow = (
      <Box flexDirection="row">
        <Box flexShrink={1}>
          <Text wrap="truncate">
            {cells.map((cell, i) => (
              <Text key={String(i)} color={cell.color} {...(cell.bg ? { backgroundColor: cell.bg } : {})}>
                {cell.ch}
              </Text>
            ))}
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
        </Box>
      </Box>
    )

    // The one marker's label and the forecast, starting at the bar's left edge.
    labelRow = (
      <Box flexDirection="row">
        <Box flexShrink={1}>
          <Text wrap="truncate">
            {usedLine}
            {verdict ? (
              <Text>
                <Text color={BURN_MARK} bold>
                  {'  ▌  '}
                </Text>
                <Text color={verdictColor} bold>
                  {verdict}
                </Text>
              </Text>
            ) : null}
          </Text>
        </Box>
      </Box>
    )
  }

  // ---- row 4: the warning and the quips take turns, always on their own line ---

  const top = warns[0]
  const pick = rowFor(d.now, warns.length > 0)
  const last: RenderElement =
    pick.kind === 'alert' && top ? (
      <Text wrap="truncate" color={WARN_COLOR[top.kind]}>
        <Text bold>⚠ {warns.map(w => w.label).join(' + ')}</Text>
        <Text>  {top.detail}</Text>
      </Text>
    ) : (
      <Text wrap="truncate">
        <Text color={PAL.violet}>✦ </Text>
        <Text color={PAL.mute} italic>
          {QUIPS[pick.kind === 'quip' ? pick.index : 0]}
        </Text>
      </Text>
    )

  if (d.isCollapsed) {
    const g = levelGlyph(level)
    return (
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexDirection="row" gap={1}>
          <Text color={g.color}>{g.ch}</Text>
          {chips}
        </Box>
        <Box flexShrink={1}>{barRow}</Box>
        {toggle}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="flex-end">
        {toggle}
      </Box>
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexDirection="row" gap={2} alignSelf="flex-start">
          {icon}
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              {chips}
            </Box>
          </Box>
        </Box>
        {ring}
        <Box flexDirection="column" flexShrink={1}>
          {barRow}
          {labelRow}
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexShrink={1}>{last}</Box>
        {brand}
      </Box>
    </Box>
  )
}

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
  shortEffort,
  shortModel,
  ramp,
  warnings,
  weekPace,
} from './logic'
import type { Forecast, WarnKind } from './logic'
import { QUIPS, rowFor } from './quips'
import { CURSOR, cursorGlow, LEVEL_NAMES, levelColor, levelGlyph, levelMeter, pacingLevel } from './sprites'
import { iconLoopSvg } from './icons'
import { modelFamily } from './cycle'
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
  isQuiet: boolean
  focused: boolean
  servers: { count: number; port: number | null } | null
  work: Work | null
  onToggle: () => void | Promise<void>
  onOpenServer: () => void | Promise<void>
  onCycleModel: () => void | Promise<void>
  onCycleEffort: () => void | Promise<void>
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

// The cursor's own colours: the bottom-left rule breathes between them, as the cursor does.
const CURSOR_DIM = '#2b3050'
// The band's focus colour, bright orange, and its dim end for the breathing rule.
const FOCUS_ORANGE = '#ff7a00'
const FOCUS_DIM = '#7a3b00'

// The band's own buttons, by the key each one is drawn under.
const BAND_KEYS = ['toggle', 'modelChip', 'effortChip']

// The collapse toggle's labels. It sits at the band's top right in both shapes, so one spot
// folds the band and the same spot opens it again. The desktop draws a native button no wider than its label, so there a
// word beside the sign makes a target a click can find; the terminal's `[ + ]` is already
// five cells wide, and a narrow band needs the room.
const TOGGLE_LABEL = {
  terminal: { expanded: '−', collapsed: '+' },
  wide: { expanded: '− Less', collapsed: '+ More' },
} as const

const DAY = 24 * 3_600_000

// True when the keyboard ring sits on one of the band's buttons (ctrl+x tab, then the arrows).
export function onBandButton(e: { element?: string; plugin?: string }): boolean {
  return (
    e.element !== undefined &&
    BAND_KEYS.includes(e.element) &&
    (e.plugin === undefined || e.plugin === 'claudius-modulus')
  )
}

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

// Background shades, lightest at the lowest step and darkest at the highest: haiku to fable
// for the model (by capability), low to max for the effort. Each runs as a slight gradient.
const MODEL_GRADIENT: Record<string, { stops: string[]; glyph: string }> = {
  haiku: { stops: ['#b3a7ff', '#9d8dff'], glyph: '○' },
  sonnet: { stops: ['#9d8dff', '#8a74ff'], glyph: '◇' },
  opus: { stops: ['#7d66ff', '#6a50ec'], glyph: '◆' },
  fable: { stops: ['#5f45e0', '#4a31c4'], glyph: '✦' },
}

const EFFORT_GRADIENT: Record<string, { stops: string[]; glyph: string; ink: string }> = {
  low: { stops: ['#cbd5e1', '#b4c0d0'], glyph: '▂', ink: '#0f172a' },
  medium: { stops: ['#94a3b8', '#7f8ea5'], glyph: '▃', ink: '#0f172a' },
  high: { stops: ['#64748b', '#536176'], glyph: '▅', ink: PAL.ink },
  xhigh: { stops: ['#475569', '#3b4a5f'], glyph: '▇', ink: PAL.ink },
  max: { stops: ['#334155', '#1e293b'], glyph: '█', ink: '#e2e8f0' },
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

  // How well the session is pacing, as a five-bar meter and a name.
  const level = pacingLevel(fc.state, fc.projected)
  const meter = (
    <Text>
      {levelMeter(level).map((cell, i) => (
        <Text key={String(i)} color={cell.color}>
          {cell.ch}
        </Text>
      ))}
      <Text color={levelColor(level)} bold>
        {' '}
        Level {level} - {LEVEL_NAMES[level - 1]}
      </Text>
    </Text>
  )

  // On the desktop: a square pixel icon for the level beside the chips, and the name under
  // them. In a terminal there is no square image, so the five-bar meter and the name stay.
  // The icon loops inside its own SVG frame, so its source holds still between redraws.
  const sprite = Svg ? (
    <Svg
      source={iconLoopSvg(level, levelColor(level))}
      alt={`Pacing level ${level} of 5: ${LEVEL_NAMES[level - 1]}`}
      width={30}
      height={30}
      isInteractive
    />
  ) : null
  const levelLine = Svg ? (
    <Text color={levelColor(level)} bold>
      Level {level} - {LEVEL_NAMES[level - 1]}
    </Text>
  ) : (
    meter
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
        verdict = `Limit in ~${fmtDur(fc.msToEmpty)}, ${fmtDur(early)} before reset.`
        verdictColor = BAD
        break
      case 'ok':
      case 'tight':
        verdict = `Projecting you hit ${fmtPct(Math.min(100, fc.projected))}.`
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

  // Collapsed, the chips are short ("S 5.5", "Low") and drop their symbols.
  const model = d.isCollapsed ? shortModel(d.model) : prettyModel(d.model)
  // Each chip is a button too: a click cycles the model or the effort.
  const modelShade = MODEL_GRADIENT[modelFamily(d.model) ?? ''] ?? MODEL_GRADIENT.opus!
  const chips: RenderElement[] = [
    <Button key="modelChip" plain onPress={d.onCycleModel}>
      {chip(
        d.isCollapsed ? model : `${modelShade.glyph} ${model}`,
        modelShade.stops,
        '#ffffff',
      )}
    </Button>,
  ]
  const effortText = d.effort ? (d.isCollapsed ? shortEffort(d.effort) : d.effort) : ''
  if (d.effort) {
    const shade = EFFORT_GRADIENT[d.effort] ?? EFFORT_GRADIENT.medium!
    chips.push(
      <Button key="effortChip" plain onPress={d.onCycleEffort}>
        {chip(d.isCollapsed ? effortText : `${shade.glyph} ${effortText}`, shade.stops, shade.ink)}
      </Button>,
    )
  }
  // Text columns the chips take, so the session block beside them gets the rest.
  const chipsWidth = d.isCollapsed
    ? model.length + 2 + (d.effort ? 1 + effortText.length + 2 : 0)
    : model.length + 4 + (d.effort ? 1 + d.effort.length + 5 : 0)
  const leftCols = Math.max(chipsWidth, 5 * cellCols + 36) + (Svg ? 4 : 0)
  const toggleLabel = d.surface === 'terminal' ? TOGGLE_LABEL.terminal : TOGGLE_LABEL.wide
  // Text columns the toggle takes: the terminal draws it `[ label ]`.
  const toggleCols = toggleLabel.expanded.length + 4
  // Collapsed, the block shares the one line with the toggle, a one-character sprite and
  // the chips.
  const ringCols = d.work && !d.isCollapsed ? (Svg ? 6 : 16) : 0
  const blockCols = d.isCollapsed
    ? d.cols - toggleCols - 1 - 2 - chipsWidth - 2
    : d.cols - leftCols - 4 - ringCols
  // The bottom border of the left block: a rule in the cursor's colours,
  // fading from left to right, its brightness breathing with the cursor. Orange while the
  // band has the focus.
  const ruleGlow = cursorGlow(d.now)
  const ruleStops = d.focused ? [FOCUS_DIM, FOCUS_ORANGE] : [CURSOR_DIM, PAL.violet]
  const ruleCols = Math.max(1, leftCols)
  const rule = (
    <Text wrap="truncate">
      {Array.from({ length: ruleCols }, (_, i) => (
        <Text key={String(i)} color={ramp(ruleStops, ruleGlow * (0.3 + (0.7 * i) / Math.max(1, ruleCols - 1)))}>
          ▔
        </Text>
      ))}
    </Text>
  )

  const toggle = (
    <Box flexShrink={0}>
      <Button
        key="toggle"
        label={d.isCollapsed ? toggleLabel.collapsed : toggleLabel.expanded}
        onPress={d.onToggle}
      />
    </Box>
  )
  const brand = (
    <Box flexDirection="row" gap={2}>
      {d.servers !== null ? (
        d.servers.port !== null ? (
          <Button key="servers" plain onPress={d.onOpenServer}>
            <Text color={PAL.mute} dimColor underline>
              {d.servers.count} dev {d.servers.count === 1 ? 'server' : 'servers'}
            </Text>
          </Button>
        ) : (
          <Text color={PAL.mute} dimColor>
            {d.servers.count} dev servers
          </Text>
        )
      ) : null}
      <Text color={PAL.mute} dimColor>
        {versionLabel()}
      </Text>
    </Box>
  )

  // ---- rows 2 and 3: the session bar, and the labels under its markers ---

  // Things that only show up when they matter, so the row stays quiet.
  const extras: { text: string; color: string }[] = []
  // The week shows when its pace runs out before it resets, in whole hours under a day, or
  // once it is nearly used.
  const wk = weekPace(week, d.now)
  if (week && wk?.runsOut && week.percentUsed < 100) {
    const left = wk.msToEmpty < DAY ? `${Math.max(1, Math.round(wk.msToEmpty / 3_600_000))}h` : fmtDur(wk.msToEmpty)
    extras.push({
      text: `week out ~${left}`,
      color: wk.msToEmpty < DAY || week.percentUsed >= 95 ? BAD : WATCH,
    })
  } else if (week && week.percentUsed >= 80) {
    extras.push({ text: `week ${fmtPct(week.percentUsed)}`, color: week.percentUsed >= 95 ? BAD : WATCH })
  }
  if (d.ctxPercent !== null && d.ctxPercent >= 85) {
    extras.push({ text: `context ${fmtPct(d.ctxPercent)} full, /compact`, color: d.ctxPercent >= 95 ? BAD : WATCH })
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
        <Text color={PAL.mute}> used</Text>
      </Text>
    )
    const resets = fc.msToReset === undefined ? '' : `resets in ${fmtDur(fc.msToReset)}`
    // Room for the bar, in text columns, after everything else on its row.
    const tailCols =
      (d.isCollapsed ? pct.length + 1 : 0) + 2 + resets.length + extras.reduce((n, x) => n + x.text.length + 3, 0)
    let keep = extras.length
    const room = (k: number) =>
      blockCols - tailCols + extras.slice(k).reduce((n, x) => n + x.text.length + 3, 0)
    while (keep > 0 && room(keep) < 8 * cellCols) keep--
    // The collapsed bar is shorter, to leave room for a short forecast beside it.
    const cap = d.isCollapsed ? (cellCols === 2 ? 12 : 18) : cellCols === 2 ? 30 : 40
    const short =
      fc.state === 'danger'
        ? { text: `Projected: ~${fmtDur(fc.msToEmpty)}`, color: BAD }
        : fc.state === 'ok' || fc.state === 'tight'
          ? { text: `Projected: ~${fmtPct(Math.min(100, fc.projected))}`, color: fc.state === 'ok' ? GOOD : WATCH }
          : fc.state === 'limit'
            ? { text: 'limit hit', color: BAD }
            : fc.state === 'idle'
              ? { text: 'idle', color: PAL.mute }
              : undefined
    // Collapsed: the message takes its room first and the bar shrinks, down to 6 cells.
    const msgCols = d.isCollapsed && short ? short.text.length + 3 : 0
    const minBar = d.isCollapsed ? 6 : 8
    const width = Math.max(minBar, Math.min(cap, Math.floor((room(keep) - msgCols) / cellCols)))
    const showShort = msgCols > 0 && room(keep) - width * cellCols >= msgCols
    const cells = barWithMarkers(five.percentUsed, five.percentUsed, width, false)

    barRow = (
      <Box flexDirection="row">
        <Box flexShrink={1}>
          <Text wrap="truncate">
            {d.isCollapsed ? (
              <Text color={color} bold>
                {pct}{' '}
              </Text>
            ) : null}
            {cells.map((cell, i) => (
              <Text key={String(i)} color={cell.color} {...(cell.bg ? { backgroundColor: cell.bg } : {})}>
                {cell.ch}
              </Text>
            ))}
            <Text color={PAL.mute}>  {resets}</Text>
            {showShort && short ? (
              <Text>
                <Text color={PAL.mute}> · </Text>
                <Text color={short.color} bold>
                  {short.text}
                </Text>
              </Text>
            ) : null}
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
  const glow = cursorGlow(d.now)
  const last: RenderElement =
    pick.kind === 'alert' && top ? (
      <Text wrap="truncate" color={WARN_COLOR[top.kind]}>
        <Text bold>⚠ {warns.map(w => w.label).join(' + ')}</Text>
        <Text>  {top.detail}</Text>
      </Text>
    ) : (
      <Text wrap="truncate">
        {[...BRAND].map((c, i, a) =>
          d.focused ? (
            <Text key={String(i)} bold color={FOCUS_ORANGE}>
              {c}
            </Text>
          ) : (
            <Text key={String(i)} dimColor color={ramp([PAL.violet, PAL.cyan], i / (a.length - 1))}>
              {c}
            </Text>
          ),
        )}
        <Text color={ramp(['#2b3050', PAL.violet], glow)}>{CURSOR}</Text>
        {d.isQuiet ? null : (
          <Text>
            <Text color={PAL.mute} dimColor>
              {' - '}
            </Text>
            <Text color={PAL.mute} italic>
              {'“'}
              {QUIPS[pick.kind === 'quip' ? pick.index : 0]}
              {'”'}
            </Text>
          </Text>
        )}
      </Text>
    )

  if (d.isCollapsed) {
    const g = levelGlyph(level)
    return (
      <Box flexDirection="row" justifyContent="space-between" gap={2}>
        <Box flexDirection="row" gap={1} flexShrink={0}>
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
        <Box flexDirection="row" gap={2} alignSelf="flex-start" alignItems="center">
          {sprite}
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              {chips}
            </Box>
            {levelLine}
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
      <Box flexDirection="row">{rule}</Box>
    </Box>
  )
}

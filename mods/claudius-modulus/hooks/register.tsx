import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
} from 'claude-code'

import type { Limit, Override } from '../types'
import { CM_USAGE, nextEffort, nextModel, parseCm, resolveModel } from './cycle'
import type { Dir } from './cycle'
import { FIVE_HOUR, prettyModel, pushSample, warnings, worstRank } from './logic'
import { recordDone, recordSpawn, summarize } from './work'
import { band, onBandButton } from './view'
import { LSOF_ARGS, SERVERS_EVERY_MS, countDevServers } from './servers'

const model = atom({ plugin: 'claudius-modulus', key: 'model' } as const, null)
const effort = atom({ plugin: 'claudius-modulus', key: 'effort' } as const, null)
const override = atom({ plugin: 'claudius-modulus', key: 'override' } as const, null)
const isUltracode = atom({ plugin: 'claudius-modulus', key: 'isUltracode' } as const, false)
const isPlan = atom({ plugin: 'claudius-modulus', key: 'isPlan' } as const, false)
const isCollapsed = atom({ plugin: 'claudius-modulus', key: 'isCollapsed' } as const, false)
const agents = atom({ plugin: 'claudius-modulus', key: 'agents' } as const, [])
const limits = atom({ plugin: 'claudius-modulus', key: 'limits' } as const, [])
const samples = atom({ plugin: 'claudius-modulus', key: 'samples' } as const, [])
const costUsd = atom({ plugin: 'claudius-modulus', key: 'costUsd' } as const, null)
const ctxPercent = atom({ plugin: 'claudius-modulus', key: 'ctxPercent' } as const, null)
const tick = atom({ plugin: 'claudius-modulus', key: 'tick' } as const, 0)
const bandFocus = atom({ plugin: 'claudius-modulus', key: 'bandFocus' } as const, false)
const servers = atom({ plugin: 'claudius-modulus', key: 'servers' } as const, null)

type Measured = {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}

const ULTRACODE_WORD = /\bultracode\b/i
const REDRAW_EVERY_MS = 200 // one frame of the blinking cursor and the level icon; also keeps the ring's seconds fresh

// Highest warning rank already toasted, so each level toasts once.
let toasted = 0
const PLAN_KEY = 'claudius-modulus:isPlan'
const COLLAPSE_KEY = 'claudius-modulus:isCollapsed'
let lastStep = ''

// The engine's own model and effort, as the last main-loop step named them. An override
// from the band stands until the person changes one of these themselves (/model, the
// picker, the effort slider): then the engine's choice wins and the override clears.
let engineModel: string | null = null
let engineEffort: string | null = null

async function ingest($: EngineInterface, u: Measured) {
  const now = await $.clock.now()
  const next: Limit[] = u.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    resetsAt: l.resetsAt,
  }))
  await update($, limits, () => next)
  // Rate-limit windows only come with a Claude plan; remember that across sessions.
  if (next.length > 0 && !(await read($, isPlan))) {
    await update($, isPlan, () => true)
    await $.store.set(PLAN_KEY, true)
  }
  await update($, costUsd, () => u.cost?.usd ?? null)
  await update($, ctxPercent, () => u.context.percent ?? null)
  const five = next.find(l => l.kind === FIVE_HOUR)
  if (five) await update($, samples, prev => pushSample(prev, now, five))
}

// The local dev servers listening now, or null when lsof cannot say.
async function countServers($: EngineInterface): Promise<number | null> {
  try {
    const { stdout } = await $.process.run([...LSOF_ARGS], { timeoutMs: 5000 })
    return countDevServers(stdout)
  } catch {
    return null
  }
}

async function alertIfWorse($: EngineInterface) {
  const list = warnings(await read($, effort), await read($, isUltracode), await read($, limits))
  const rank = worstRank(list)
  if (rank > toasted && list[0]) {
    $.ui.toast(`⚠ ${list[0].label}: ${list[0].detail}`, { timeoutMs: 7000 })
  }
  toasted = rank
}

// Sets the model or effort the next request uses, shows it on the chips at once, and says so.
async function setOverride($: EngineInterface, patch: { model?: string; effort?: string }) {
  const prev = (await read($, override)) ?? { model: null, effort: null, sawModel: null, sawEffort: null }
  const next: Override = {
    model: patch.model ?? prev.model,
    effort: patch.effort ?? prev.effort,
    sawModel: engineModel,
    sawEffort: engineEffort,
  }
  await update($, override, () => next)
  if (patch.model !== undefined) await update($, model, () => patch.model!)
  if (patch.effort !== undefined) await update($, effort, () => patch.effort!)
  await alertIfWorse($)
  const said =
    patch.model !== undefined ? `Model: ${prettyModel(patch.model)}` : `Effort: ${patch.effort}`
  $.ui.toast(`${said} from the next request`)
  return said
}

async function cycleModel($: EngineInterface, dir: Dir) {
  return setOverride($, { model: nextModel(await read($, model), dir) })
}

async function cycleEffort($: EngineInterface, dir: Dir) {
  return setOverride($, { effort: nextEffort(await read($, effort), dir) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, model, () => null)
    const m = await $.session.model()
    engineModel = m
    await update($, model, () => m)
    const plan = (await $.store.get(PLAN_KEY)) === true
    await update($, isPlan, () => plan)
    const collapsed = (await $.store.get(COLLAPSE_KEY)) === true
    await update($, isCollapsed, () => collapsed)
    await ingest($, await $.session.usage())
    await $.command.register({
      name: 'cm',
      description: 'claudius-modulus: cycle the model or effort for the next request',
      argumentHint: 'model|effort [next|prev|name] | off',
      immediate: true,
    })
    $.clock.every(REDRAW_EVERY_MS, async () => {
      await update($, tick, n => n + 1)
    })
    $.clock.every(SERVERS_EVERY_MS, async () => {
      const n = await countServers($)
      await update($, servers, () => n)
    })
    void countServers($).then(n => update($, servers, () => n))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await ingest($, e)
    await alertIfWorse($)
    return next(e)
  })

  // The model and effort the main loop is using right now, with the band's override laid
  // over the engine's own choice on each request.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const stepEffort = e.effort === undefined ? null : String(e.effort)
    let o = await read($, override)
    if (o) {
      const changed =
        (o.sawModel !== null && e.model !== o.sawModel) ||
        (o.sawEffort !== null && stepEffort !== o.sawEffort)
      if (changed) {
        o = null
        await update($, override, () => null)
      }
    }
    engineModel = e.model
    engineEffort = stepEffort

    const usedModel = o?.model ?? e.model
    const usedEffort = o?.effort ?? stepEffort
    const key = `${usedModel}|${usedEffort ?? ''}`
    if (key !== lastStep) {
      lastStep = key
      await update($, model, () => usedModel)
      await update($, effort, () => usedEffort)
      await alertIfWorse($)
    }
    if (!o) return yield* next(e)
    const rewritten = { ...e }
    if (o.model !== null) rewritten.model = o.model
    if (o.effort !== null) rewritten.effort = o.effort as typeof e.effort
    return yield* next(rewritten)
  })

  // /cm model next, /cm effort max, /cm off.
  on('command.run', { command: 'cm' }, async ($, e) => {
    const req = parseCm(e.args)
    switch (req.kind) {
      case 'model': {
        const said =
          req.value === 'next' || req.value === 'prev'
            ? await cycleModel($, req.value)
            : await setOverride($, { model: resolveModel(req.value) })
        return { text: said }
      }
      case 'effort': {
        const said =
          req.value === 'next' || req.value === 'prev'
            ? await cycleEffort($, req.value)
            : await setOverride($, { effort: req.value })
        return { text: said }
      }
      case 'off': {
        await update($, override, () => null)
        if (engineModel !== null) await update($, model, () => engineModel)
        await update($, effort, () => engineEffort)
        lastStep = ''
        return { text: 'Override cleared: the session model and effort are back.' }
      }
      default:
        return { text: CM_USAGE }
    }
  })

  // Agents, workflow agents and background agents: when each starts and when it finishes.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = 'agentId' in started ? started.agentId : undefined
    if (id) {
      const now = await $.clock.now()
      await update($, agents, prev => recordSpawn(prev, id, now))
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const now = await $.clock.now()
      await update($, agents, prev => recordDone(prev, id, now))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Ultracode is a turn-level mode: the word in a prompt, or a Workflow run.
  on('prompt.submit', async ($, e, next) => {
    await update($, isUltracode, () => ULTRACODE_WORD.test(e.text))
    await alertIfWorse($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    await update($, isUltracode, () => true)
    await alertIfWorse($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The keyboard ring moving over the band: lit while it sits on one of the band's buttons.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    await update($, bandFocus, () => onBandButton(e))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Read so the countdowns, the icon loop and the second row redraw on each tick.
    await read($, tick)

    const collapsed = await read($, isCollapsed)
    const ui = $.ui.resolve(e)
    return band(ui, {
      model: await read($, model),
      effort: await read($, effort),
      isUltracode: await read($, isUltracode),
      isPlan: await read($, isPlan),
      isCollapsed: collapsed,
      focused: await read($, bandFocus),
      servers: await read($, servers),
      work: summarize(await read($, agents), await $.clock.now()),
      onToggle: async () => {
        await update($, isCollapsed, () => !collapsed)
        await $.store.set(COLLAPSE_KEY, !collapsed)
      },
      onCycleModel: async () => {
        await cycleModel($, 'next')
      },
      onCycleEffort: async () => {
        await cycleEffort($, 'next')
      },
      limits: await read($, limits),
      samples: await read($, samples),
      costUsd: await read($, costUsd),
      ctxPercent: await read($, ctxPercent),
      now: await $.clock.now(),
      surface: e.surface,
      cols: Math.max(30, e.props.bodyColumns),
    })
  })
}

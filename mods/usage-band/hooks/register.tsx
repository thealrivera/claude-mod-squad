import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
} from 'claude-code'

import type { Limit } from '../types'
import { FIVE_HOUR, pushSample, warnings, worstRank } from './logic'
import { band } from './view'

const model = atom({ plugin: 'usage-band', key: 'model' } as const, null)
const effort = atom({ plugin: 'usage-band', key: 'effort' } as const, null)
const isUltracode = atom({ plugin: 'usage-band', key: 'isUltracode' } as const, false)
const isPlan = atom({ plugin: 'usage-band', key: 'isPlan' } as const, false)
const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [])
const samples = atom({ plugin: 'usage-band', key: 'samples' } as const, [])
const costUsd = atom({ plugin: 'usage-band', key: 'costUsd' } as const, null)
const ctxPercent = atom({ plugin: 'usage-band', key: 'ctxPercent' } as const, null)
const tick = atom({ plugin: 'usage-band', key: 'tick' } as const, 0)

type Measured = {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}

const ULTRACODE_WORD = /\bultracode\b/i
const REDRAW_EVERY_MS = 60_000

// Highest warning rank already toasted, so each level toasts once.
let toasted = 0
const PLAN_KEY = 'usage-band:isPlan'
let lastStep = ''

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

async function alertIfWorse($: EngineInterface) {
  const list = warnings(await read($, effort), await read($, isUltracode), await read($, limits))
  const rank = worstRank(list)
  if (rank > toasted && list[0]) {
    $.ui.toast(`⚠ ${list[0].label}: ${list[0].detail}`, { timeoutMs: 7000 })
  }
  toasted = rank
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, model, () => null)
    const m = await $.session.model()
    await update($, model, () => m)
    const plan = (await $.store.get(PLAN_KEY)) === true
    await update($, isPlan, () => plan)
    await ingest($, await $.session.usage())
    $.clock.every(REDRAW_EVERY_MS, () => {
      update($, tick, n => n + 1).catch(() => {})
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await ingest($, e)
    await alertIfWorse($)
    return next(e)
  })

  // The model and effort the main loop is using right now.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const key = `${e.model}|${e.effort ?? ''}`
      if (key !== lastStep) {
        lastStep = key
        await update($, model, () => e.model)
        await update($, effort, () => (e.effort === undefined ? null : String(e.effort)))
        await alertIfWorse($)
      }
    }
    return yield* next(e)
  })

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Read so the countdowns redraw when the minute timer ticks.
    await read($, tick)

    const ui = $.ui.resolve(e)
    return band(ui, {
      model: await read($, model),
      effort: await read($, effort),
      isUltracode: await read($, isUltracode),
      isPlan: await read($, isPlan),
      limits: await read($, limits),
      samples: await read($, samples),
      costUsd: await read($, costUsd),
      ctxPercent: await read($, ctxPercent),
      now: await $.clock.now(),
      cols: Math.max(30, e.props.bodyColumns),
    })
  })
}

import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const

test('the band draws on the terminal and the desktop before any reading arrives', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'claudius-maximus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })
    expect(await ui.find({ type: 'Text', text: /usage shows after your first response/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^v1\.1$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /claudius-maximus/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✦/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeUndefined()
    await ui.unmount()
  }
})

const T0 = Date.parse('2026-10-11T20:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const reading = (five: number, week: number) => ({
  context: { window: 200000, tokens: 76000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: iso(T0 + 120 * 60_000) },
    { kind: 'seven_day', percentUsed: week, resetsAt: iso(T0 + 3 * 86_400_000) },
  ],
  cost: { usd: 1.84 },
  changed: ['rateLimits', 'cost', 'context'] as ('rateLimits' | 'cost' | 'context')[],
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`readings fill the band, a hot pace forecasts the run-out, and max effort warns (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    mock.store(on)
    const toasts: string[] = []
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.toast', (_$, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    on('turn.step', async function* () {
      return {
        turnId: 't1',
        index: 0,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: null,
      }
    })

    const ui = await $.ui.mount({
      plugin: 'claudius-maximus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })

    await $.session.measure(reading(20, 90))
    await clock.advance(30 * 60_000)
    await $.session.measure(reading(50, 90))
    await ui.redraw()

    expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets in 1h 30m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Burned 50%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pace Burn 100%/ })).toBeDefined()
    // a plan never shows cost, and context only shows once it is nearly full
    expect(await ui.find({ type: 'Text', text: /\$1\.84/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /out in ~/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /week 90%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeUndefined()
    expect(toasts.length).toBe(0)

    for await (const _chunk of $.turn.step({
      turnId: 't1',
      index: 0,
      model: 'claude-opus-5-5',
      effort: 'max',
      messageCount: 3,
    })) {
      // drain the stream
    }
    await ui.redraw()

    // T0 sits on an even switch, and 30 minutes is a whole number of them
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()

    // the next switch is a quip's turn, the one after is the warning's again
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /✦/ })).toBeDefined()
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^v1\.1$/ })).toBeDefined()
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toMatch(/MAX EFFORT/)
    await ui.unmount()
  })
}

test('API billing has no plan limits, so it shows cost instead of a bar', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  const ui = await $.ui.mount({
    plugin: 'claudius-maximus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.measure({
    context: { window: 200000, tokens: 1000, percent: 1 },
    rateLimits: [],
    cost: { usd: 3.89 },
    changed: ['cost'],
  })
  await ui.redraw()

  expect(await ui.find({ type: 'Text', text: /\$3\.89 this session/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  await ui.unmount()
})

test('a plan is remembered, so cost stays hidden before the first reading of a later session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { 'claudius-maximus:isPlan': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  const ui = await $.ui.mount({
    plugin: 'claudius-maximus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

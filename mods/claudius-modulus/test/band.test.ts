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
      plugin: 'claudius-modulus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })
    expect(await ui.find({ type: 'Text', text: /usage shows after your first response/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^v1\.4\.0$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /claudius-modulus/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeDefined()
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
      plugin: 'claudius-modulus',
      surface,
      component: 'AbovePrompt',
      props: PROPS,
    })

    await $.session.measure(reading(20, 90))
    await clock.advance(30 * 60_000)
    await $.session.measure(reading(50, 90))
    await ui.redraw()

    expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Burned 50%/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /resets in 1h 30m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pace Burn/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /50% *used|^50%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Tokenzilla/ })).toBeDefined()
    // a plan never shows cost, and context only shows once it is nearly full
    expect(await ui.find({ type: 'Text', text: /\$1\.84/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Limit in ~/ })).toBeDefined()
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
    // the quip has its own line, so it shows even in a normal-width band
    expect(await ui.find({ type: 'Text', text: /Limit in ~/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeDefined()
    await clock.advance(30_000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /MAX EFFORT/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^v1\.4\.0$/ })).toBeDefined()
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
    plugin: 'claudius-modulus',
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
  mock.store(on, { 'claudius-modulus:isPlan': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('the quip and the verdict both show, in a wide band too', async ($, on) => {
  mock.clock(on, { now: T0 + 30_000 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...PROPS, bodyColumns: 240 },
  })
  await $.session.measure(reading(20, 30))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Projecting you hit|Limit in/ })).toBeDefined()
  await ui.unmount()
})

test('the toggle collapses the band to one line and remembers it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.measure(reading(20, 30))
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()

  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /resets in/ })).toBeDefined()
  // there is room, so the short forecast shows beside the bar, and the session % leads the bar
  expect(await ui.find({ type: 'Text', text: /^\d+(\.\d)?% $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Projected/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ ?\?? $| \? |S 5/ })).toBeDefined()

  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeDefined()
  await ui.unmount()
})

test('a collapsed band stays collapsed in the next session', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, { 'claudius-modulus:isCollapsed': true })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('session.usage', () =>
    ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
  )
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: PROPS,
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^▌ $/ })).toBeUndefined()
  await ui.unmount()
})

for (const [cols, hasMessage] of [
  [62, true],
  [34, false],
] as const) {
  test(`a ${cols}-column collapsed band ${hasMessage ? 'keeps the projected message and shrinks the bar' : 'drops the message but keeps the bar and the reset time'}`, async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on, { 'claudius-modulus:isCollapsed': true })
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
    on('session.usage', () =>
      ({ value: { startedAt: T0, context: { window: 200000 }, rateLimits: [] } }) as never,
    )
    const ui = await $.ui.mount({
      plugin: 'claudius-modulus',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...PROPS, bodyColumns: cols },
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await $.session.measure(reading(20, 30))
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: /resets/ })).toBeDefined()
    const message = await ui.find({ type: 'Text', text: /Projected/ })
    expect(message !== undefined).toBe(hasMessage)
    await ui.unmount()
  })
}

test('the cursor before the brand blinks on its own as the clock runs', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'claudius-modulus',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: PROPS,
  })
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    const el = await ui.find({ type: 'Text', text: /^▌ $/ })
    seen.add(JSON.stringify(el))
    await clock.advance(200)
    await ui.redraw()
  }
  expect(seen.size).toBeGreaterThan(1)
  await ui.unmount()
})

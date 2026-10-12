import { expect, test } from 'claude-code/testing'

import type { Limit, Sample } from '../types'
import {
  barCells,
  dim,
  fmtDur,
  fmtPct,
  forecast,
  prettyModel,
  pushSample,
  ramp,
  warnings,
} from '../hooks/logic'
import { VERSION, versionLabel } from '../hooks/version'

const MIN = 60_000
const NOW = Date.parse('2026-10-11T20:00:00Z')
const at = (mins: number) => NOW + mins * MIN
const five = (percentUsed: number, resetInMin = 120): Limit => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt: new Date(at(resetInMin)).toISOString(),
})
const sample = (minsAgo: number, p: number): Sample => ({ t: at(-minsAgo), p })

test('no reading means no forecast', () => {
  expect(forecast([], undefined, NOW).state).toBe('none')
})

test('a window that just opened has no pace yet', () => {
  // 5 minutes in: too early for the window average, one reading is no trend.
  expect(forecast([sample(1, 10)], five(10, 295), NOW).state).toBe('calibrating')
})

test('the window average gives a forecast from the very first reading', () => {
  // 28% used, window opened 59 minutes ago: about 28.5%/h.
  const f = forecast([sample(0, 28)], five(28, 241), NOW)
  expect(Math.round(f.ratePerHour * 10) / 10).toBe(28.5)
  expect(f.state).toBe('danger')
})

test('one big turn cannot swing the pace: the burst is spread over at least 15 minutes', () => {
  // 21% -> 28% in 5 minutes would read 84%/h; spread over 15 minutes it is 28%/h,
  // and the blend with the 28.5%/h window average stays near 28%/h.
  const f = forecast([sample(5, 21), sample(0, 28)], five(28, 241), NOW)
  expect(Math.round(f.ratePerHour)).toBe(28)
  expect(Math.round((f.msToEmpty ?? 0) / MIN)).toBe(153)
})

test('a fast pace that cannot last to the reset says it runs out, and when', () => {
  // Window average 16.7%/h, last 30 minutes 60%/h: blend 38.3%/h, dry in 78 minutes.
  const f = forecast([sample(30, 20), sample(0, 50)], five(50, 120), NOW)
  expect(f.state).toBe('danger')
  expect(Math.round(f.ratePerHour * 10) / 10).toBe(38.3)
  expect(Math.round((f.msToEmpty ?? 0) / MIN)).toBe(78)
})

test('a gentle pace lands under the limit and is on pace', () => {
  // Average 5.3%/h, recent 12%/h: blend 8.7%/h, two hours left adds 17 points.
  const f = forecast([sample(30, 10), sample(0, 16)], five(16, 120), NOW)
  expect(f.state).toBe('ok')
  expect(Math.round(f.projected)).toBe(33)
})

test('a pace that finishes the window near the limit is tight', () => {
  // Average 16.7%/h, recent 20%/h: blend 18.3%/h, projected about 87%.
  const f = forecast([sample(30, 40), sample(0, 50)], five(50, 120), NOW)
  expect(f.state).toBe('tight')
  expect(Math.round(f.projected)).toBe(87)
})

test('nothing new for twenty minutes is idle', () => {
  expect(forecast([sample(25, 30)], five(30), NOW).state).toBe('idle')
  expect(forecast([sample(5, 30)], five(30), NOW).state).not.toBe('idle')
})

test('a full window is the limit', () => {
  expect(forecast([], five(100), NOW).state).toBe('limit')
})

test('a window that rolls over drops the old readings', () => {
  const old: Sample[] = [{ t: at(-200), p: 90, r: at(-30) }]
  const next = pushSample(old, NOW, five(3, 300))
  expect(next.length).toBe(1)
  expect(next[0]?.p).toBe(3)
})

test('an unchanged reading is not stored again within five minutes', () => {
  const first = pushSample([], NOW, five(10))
  expect(pushSample(first, at(2), five(10)).length).toBe(1)
  expect(pushSample(first, at(6), five(10)).length).toBe(2)
})

test('extra effort warns, max effort outranks it, ultracode outranks both', () => {
  expect(warnings('high', false, [])).toEqual([])
  expect(warnings('xhigh', false, [])[0]?.kind).toBe('extra')
  expect(warnings('max', false, [])[0]?.kind).toBe('max')
  const all = warnings('max', true, [])
  expect(all.map(w => w.kind)).toEqual(['ultracode', 'max'])
})

test('a full usage window warns that further use may be extra', () => {
  expect(warnings('medium', false, [five(100)])[0]?.kind).toBe('overage')
  expect(warnings('medium', false, [five(60)])).toEqual([])
})

test('durations read short', () => {
  expect(fmtDur(20 * 1000)).toBe('<1m')
  expect(fmtDur(14 * MIN)).toBe('14m')
  expect(fmtDur(134 * MIN)).toBe('2h 14m')
  expect(fmtDur(120 * MIN)).toBe('2h')
  expect(fmtDur(30 * 60 * MIN)).toBe('1d 6h')
})

test('percentages drop the decimal once they are two digits', () => {
  expect(fmtPct(43.2)).toBe('43%')
  expect(fmtPct(7.4)).toBe('7.4%')
  expect(fmtPct(7)).toBe('7%')
})

test('model ids read as names', () => {
  expect(prettyModel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(prettyModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(prettyModel(null)).toBe('model ?')
})

test('a bar shows used, then projected, then the empty track', () => {
  const cells = barCells(30, 70, 10)
  expect(cells.map(c => c.kind[0]).join('')).toBe('uuuppppttt')
  expect(barCells(0, 0, 8).every(c => c.kind === 'track')).toBe(true)
  expect(barCells(100, 100, 8).every(c => c.kind === 'used')).toBe(true)
  expect(barCells(25, 25, 8).filter(c => c.kind === 'used').length).toBe(2)
  // the used tip gets a thin eighth block rather than rounding up
  expect(barCells(35, 35, 10)[3]?.ch).toBe('▌')
  expect(ramp(['#000000', '#ffffff'], 0.5)).toBe('#808080')
  expect(dim('#34d399')).not.toBe('#34d399')
})

test('the version label drops a zero patch', () => {
  expect(versionLabel('1.0.0')).toBe('v1.0')
  expect(versionLabel('1.2.0')).toBe('v1.2')
  expect(versionLabel('1.0.1')).toBe('v1.0.1')
  expect(versionLabel(VERSION)).toBe('v1.0')
})

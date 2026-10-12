import type { AgentRec } from '../types'
import { PAL } from './logic'

const SECOND = 1000
const KEEP = 60
const STALE = 30 * 60 * SECOND // a "running" agent we never saw finish stops counting
const LINGER = 15 * SECOND // a finished wave stays up this long, full

export function recordSpawn(list: AgentRec[], id: string, now: number): AgentRec[] {
  if (list.some(a => a.id === id)) return list
  return [...list, { id, t0: now }].slice(-KEEP)
}

export function recordDone(list: AgentRec[], id: string, now: number): AgentRec[] {
  return list.map(a => (a.id === id && a.t1 === undefined ? { ...a, t1: now } : a))
}

export type Work = {
  running: number
  done: number
  total: number
  // 0..1: finished agents, plus a share for each one still running
  fraction: number
  // how long until the wave is expected to finish; unknown until one agent has finished
  etaMs: number | undefined
}

// The agents, workflow agents and background agents running together: those still
// running, and those that finished after the earliest of them began. The pace comes
// from how long the agents that did finish took, so the ETA is an estimate.
export function summarize(list: AgentRec[], now: number): Work | null {
  const live = list.filter(a => a.t1 === undefined && now - a.t0 < STALE)
  const finished = list.filter(a => a.t1 !== undefined)
  const durations = finished.slice(-30).map(a => a.t1! - a.t0)
  const avg = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : undefined

  if (live.length === 0) {
    const recent = finished.filter(a => now - a.t1! < LINGER)
    if (recent.length === 0) return null
    return { running: 0, done: recent.length, total: recent.length, fraction: 1, etaMs: 0 }
  }

  const since = Math.min(...live.map(a => a.t0))
  const wave = finished.filter(a => a.t1! >= since)
  const total = live.length + wave.length
  const partial = live.reduce((s, a) => s + (avg ? Math.min(0.9, (now - a.t0) / avg) : 0), 0)
  const fraction = Math.min(0.99, (wave.length + partial) / total)
  const etaMs =
    avg === undefined
      ? undefined
      : Math.max(...live.map(a => Math.max(avg - (now - a.t0), avg * 0.2)))
  return { running: live.length, done: wave.length, total, fraction, etaMs }
}

const PIES = ['○', '◔', '◑', '◕', '●']
export const pieGlyph = (fraction: number) => PIES[Math.round(Math.min(1, Math.max(0, fraction)) * 4)]!

// The desktop's ring, an SVG image: a gradient arc over a dark track, with the finished
// count and the ETA in the middle.
export function ringSvg(fraction: number, top: string, bottom: string): string {
  const r = 26
  const c = 2 * Math.PI * r
  const arc = Math.max(0.001, Math.min(1, fraction)) * c
  const stops = [PAL.mint, PAL.cyan, PAL.violet]
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${stops[0]}"/><stop offset="0.5" stop-color="${stops[1]}"/>` +
    `<stop offset="1" stop-color="${stops[2]}"/></linearGradient></defs>` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="#2b3048" stroke-width="7"/>` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" ` +
    `stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>` +
    `<text x="32" y="31" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="${PAL.text}">${top}</text>` +
    `<text x="32" y="43" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" fill="${PAL.mute}">${bottom}</text>` +
    '</svg>'
  )
}

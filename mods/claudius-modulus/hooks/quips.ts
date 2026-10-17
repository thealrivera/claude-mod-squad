// The second row of the band. With nothing to warn about it cycles these; with a
// warning up it alternates between the warning and these, one switch each.
export const QUIPS: readonly string[] = [
  'A token burned is a token earned.',
  'Do you even Claude, bro?',
  'No pain, no context gain.',
  'Eat, sleep, prompt, repeat.',
  'Keep calm and /compact on.',
  'Stay hungry. Stay prompting.',
  'Rate limits are for quitters.',
  'Ship it, then ask Claude why.',
  'Your tokens called. They want out.',
  'Burn now, refactor never.',
]

// How long each row stays up before the band switches to the next.
export const ROTATE_MS = 30_000

export type SecondRow = { kind: 'alert' } | { kind: 'quip'; index: number }

// One switch every ROTATE_MS. No warning: quip after quip. A warning: it takes
// every other switch, and the quips carry on in order between its turns.
export function rowFor(now: number, hasAlert: boolean): SecondRow {
  const slot = Math.floor(now / ROTATE_MS)
  if (!hasAlert) return { kind: 'quip', index: slot % QUIPS.length }
  if (slot % 2 === 0) return { kind: 'alert' }
  return { kind: 'quip', index: Math.floor(slot / 2) % QUIPS.length }
}

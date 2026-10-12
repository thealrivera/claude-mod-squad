// The second row of the band. With nothing to warn about it cycles these; with a
// warning up it alternates between the warning and these, one switch each.
export const QUIPS: readonly string[] = [
  "If you aren't burning 1B tokens a day, are you even alive?",
  'Claude is life and life is claude.',
  "Don't stop. You're not finished yet.",
  "Don't sleep on unburned tokens.",
  'Unspent tokens are just regrets with a context window.',
  "You're absolutely right. Now spend more.",
  'Great catch! Anyway, what else is on fire?',
  'Let me just quickly refactor the whole repo.',
  'Sleep is a rate limit you set on yourself.',
  'Your limit resets. Your ambition does not.',
  "Somewhere a GPU is warming up for you. Don't leave it hanging.",
  "Compaction is just your context window saying 'new me.'",
  'Touch grass later. The context window is still warm.',
  "Tokens aren't a budget. They're a mood.",
  'One more prompt. You said that at prompt 41.',
  'Idle Claude is a sad Claude. Give it something to do.',
  'Have you tried asking Claude to ask Claude?',
  'Real ones hit the 5-hour limit with 4 minutes to spare.',
  "It's not a rabbit hole if Claude keeps digging.",
  'Let me explore the codebase first. *reads 400 files*',
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

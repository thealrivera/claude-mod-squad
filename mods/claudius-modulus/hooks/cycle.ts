// Cycling the model and the effort from the band: the lists, the step, and the words the
// /cm command takes. Pure, so the tests can drive it without a session.

// The families the model key steps through, in order, and the id each resolves to.
// Keep this in step with the current Claude lineup.
export const MODELS: readonly { family: string; id: string }[] = [
  { family: 'fable', id: 'claude-fable-5-1' },
  { family: 'opus', id: 'claude-opus-5-5' },
  { family: 'sonnet', id: 'claude-sonnet-5-5' },
  { family: 'haiku', id: 'claude-haiku-5-5' },
]

export const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max']

export type Dir = 'next' | 'prev'

// "claude-opus-5-5[1m]" -> "opus"; a name the list does not know -> null.
export function modelFamily(id: string | null): string | null {
  if (!id) return null
  const m = id.replace(/\[.*?\]/g, '').match(/^(?:claude-)?([a-z]+)/)
  return m ? m[1]! : null
}

// The model after (or before) the current one in the list; from an unknown model the
// step lands on the first entry.
export function nextModel(current: string | null, dir: Dir): string {
  const i = MODELS.findIndex(m => m.family === modelFamily(current))
  if (i < 0) return MODELS[0]!.id
  const n = MODELS.length
  return MODELS[(i + (dir === 'next' ? 1 : n - 1)) % n]!.id
}

export function nextEffort(current: string | null, dir: Dir): string {
  const i = EFFORTS.indexOf(current ?? '')
  if (i < 0) return dir === 'next' ? EFFORTS[0]! : EFFORTS[EFFORTS.length - 1]!
  const n = EFFORTS.length
  return EFFORTS[(i + (dir === 'next' ? 1 : n - 1)) % n]!
}

// A family name ("opus") becomes its id; anything else passes through as typed.
export function resolveModel(name: string): string {
  const hit = MODELS.find(m => m.family === name.toLowerCase())
  return hit ? hit.id : name
}

export type CmRequest =
  | { kind: 'model'; value: Dir | string }
  | { kind: 'effort'; value: Dir | string }
  | { kind: 'off' }
  | { kind: 'help' }

export const CM_USAGE =
  'Usage: /cm model [next|prev|fable|opus|sonnet|haiku|<id>], /cm effort [next|prev|low|medium|high|xhigh|max], /cm off'

// The words after /cm. A bare "model" or "effort" means next.
export function parseCm(args: string): CmRequest {
  const [what = '', value = 'next'] = args.trim().toLowerCase().split(/\s+/)
  if (what === 'off' || what === 'reset') return { kind: 'off' }
  if (what === 'model' || what === 'm') return { kind: 'model', value }
  if (what === 'effort' || what === 'e') {
    if (value !== 'next' && value !== 'prev' && !EFFORTS.includes(value)) return { kind: 'help' }
    return { kind: 'effort', value }
  }
  return { kind: 'help' }
}

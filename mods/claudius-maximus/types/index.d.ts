export type Sample = { t: number; p: number; r?: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'claudius-maximus': {
      model: string | null
      effort: string | null
      isUltracode: boolean
      isPlan: boolean
      isCollapsed: boolean
      limits: Limit[]
      samples: Sample[]
      costUsd: number | null
      ctxPercent: number | null
      tick: number
    }
  }
}

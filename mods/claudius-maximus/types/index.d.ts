export type Sample = { t: number; p: number; r?: number }
export type AgentRec = { id: string; t0: number; t1?: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'claudius-maximus': {
      model: string | null
      effort: string | null
      isUltracode: boolean
      isPlan: boolean
      isCollapsed: boolean
      agents: AgentRec[]
      limits: Limit[]
      samples: Sample[]
      costUsd: number | null
      ctxPercent: number | null
      tick: number
    }
  }
}

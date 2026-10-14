export type Sample = { t: number; p: number; r?: number }
export type AgentRec = { id: string; t0: number; t1?: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
// The band's choice of model and effort for the next request, and the engine's own values
// when it was made (null when unknown), so a change the person makes clears it.
export type Override = { model: string | null; effort: string | null; sawModel: string | null; sawEffort: string | null }

declare module 'claude-code' {
  interface PluginState {
    'claudius-modulus': {
      model: string | null
      effort: string | null
      override: Override | null
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

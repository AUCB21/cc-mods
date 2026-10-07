export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; requests: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-usage': { byAgent: Record<string, Usage>; byModel: Record<string, number> }
  }
}

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Usage } from '../types'

const byAgent = atom({ plugin: 'agent-usage', key: 'byAgent' } as const, {})
const byModel = atom({ plugin: 'agent-usage', key: 'byModel' } as const, {})
const PANE = 'usage-monitor'
const types = new Map<string, string>() // agentId -> type; refilled lazily after a reload

const total = (rows: Usage[]): Usage =>
  rows.reduce(
    (a, u) => ({
      input: a.input + u.input,
      output: a.output + u.output,
      cacheRead: a.cacheRead + u.cacheRead,
      cacheWrite: a.cacheWrite + u.cacheWrite,
      requests: a.requests + u.requests,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 },
  )

export const hitRate = (u: Usage) => {
  const all = u.input + u.cacheRead + u.cacheWrite
  return all ? Math.round((u.cacheRead / all) * 100) : 0
}

export const k = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

const sum = (u: Usage) => u.input + u.output + u.cacheRead + u.cacheWrite

export const bar = (pct: number, width = 20) => {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export const table = (rows: Record<string, Usage>) => {
  const names = Object.keys(rows).sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)))
  if (!names.length) return 'No model requests yet.'
  const line = (name: string, u: Usage) =>
    [name, u.requests, k(u.input), k(u.output), k(u.cacheRead), k(u.cacheWrite), `${hitRate(u)}%`]
      .map((c, i) => (i ? String(c).padStart(9) : String(c).padEnd(18)))
      .join('')
  return [
    ['agent', 'reqs', 'input', 'output', 'c.read', 'c.write', 'hit'].map((c, i) => (i ? c.padStart(9) : c.padEnd(18))).join(''),
    ...names.map(n => line(n, rows[n])),
    line('TOTAL', total(Object.values(rows))),
  ].join('\n')
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// a reset more than a day out gets its weekday: "Sun 12:00"
const when = (ms: number, now: number) =>
  (ms - now > 864e5 ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getDay()] + ' ' : '') + hhmm(ms)

export const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600e3, seven_day: 7 * 24 * 3600e3 }

// ponytail: linear projection from the window's average pace; swap for a recent-rate estimate if it swings too much
export const runsOutAt = (pct: number, resetsAt: number, windowMs: number, now: number) => {
  const elapsed = now - (resetsAt - windowMs)
  if (pct <= 0 || elapsed <= 0) return undefined
  const at = now + ((100 - pct) / pct) * elapsed
  return at < resetsAt ? at : undefined
}

const light = (pct: number) => (pct >= 90 ? 'error' : pct >= 60 ? 'warning' : 'success')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-by-agent', description: 'Token usage of this session, split by agent type' })
    await $.command.register({ name: 'usage-monitor', description: 'Open the usage monitor pane' })
    void $.ui.open({ id: PANE, title: 'Usage monitor' })
    return next(e)
  })

  on('command.run', { command: 'usage-by-agent' }, async $ => ({
    text: '```\n' + table(await read($, byAgent)) + '\n```',
  }))

  on('command.run', { command: 'usage-monitor' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Usage monitor' })
    return { text: 'Usage monitor opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = await read($, byAgent)
    const models = await read($, byModel)
    const s = await $.session.usage()
    const now = await $.clock.now()
    // label on one line, full-width bar under it: fits a narrow docked pane without wrapping
    // ponytail: desktop's font draws █ and ═ wider than a column; 0.8 measured off a screenshot, tune if bars wrap or fall short
    const fit = e.surface === 'desktop' ? 0.8 : 1
    const cols = Math.floor(Math.min(64, e.props.bodyColumns || e.viewport?.columns || 40) * fit)
    const W = Math.max(10, cols - 4)
    const t = total(Object.values(rows))
    const mins = Math.max(1, (now - s.startedAt) / 60000)

    const row = (icon: string, label: string, pct: number, color: string, note: string) => (
      <Box flexDirection="column">
        <Text>
          <Text bold>{icon} {label}  </Text>
          <Text color={color} bold>{pct.toFixed(1)}%</Text>
          <Text dimColor>  {note}</Text>
        </Text>
        <Text>
          <Text dimColor>  [</Text>
          <Text color={color}>{bar(pct, W)}</Text>
          <Text dimColor>]</Text>
        </Text>
      </Box>
    )
    const rule = <Text dimColor>{'─'.repeat(cols - 1)}</Text>

    const names = Object.keys(rows).sort((a, b) => sum(rows[b]) - sum(rows[a]))
    const modelTotal = Object.values(models).reduce((a, b) => a + b, 0)
    const modelNames = Object.keys(models).sort((a, b) => models[b] - models[a])
    const palette = ['suggestion', 'warning', 'success', 'claude', 'permission']
    const short = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')
    const limits = s.rateLimits.filter(r => r.resetsAt)

    return (
      <Box flexDirection="column">
        <Text color="claude" bold>✦ ✧ ✦ ✧ CLAUDE CODE USAGE MONITOR ✦ ✧ ✦ ✧</Text>
        <Text dimColor>{'═'.repeat(cols - 1)}</Text>
        {s.rateLimits.length > 0 && <Text bold>📊 Plan limits</Text>}
        {s.rateLimits.map(r => {
          const reset = r.resetsAt ? Date.parse(r.resetsAt) : undefined
          return row('⏱', r.kind.replace('_', ' '), r.percentUsed, light(r.percentUsed),
            reset ? `resets ${when(reset, now)} (in ${span(reset - now)})` : '')
        })}
        {s.context.percent !== undefined &&
          row('🧠', 'context', s.context.percent, light(s.context.percent), `${k(s.context.tokens ?? 0)} / ${k(s.context.window)}`)}
        {row('♻', 'cache hit', hitRate(t), light(100 - hitRate(t)), `read ${k(t.cacheRead)} · write ${k(t.cacheWrite)}`)}
        {rule}
        <Text bold>🤖 Agents</Text>
        {names.length === 0 && <Text dimColor>  No model requests yet.</Text>}
        {names.map(n =>
          row(' ', n.slice(0, 16), sum(t) ? (sum(rows[n]) / sum(t)) * 100 : 0, n === 'main' ? 'claude' : 'suggestion',
            `${k(sum(rows[n]))} tok · ${rows[n].requests} req · hit ${hitRate(rows[n])}%`),
        )}
        {rule}
        {modelTotal > 0 && (
          <Box flexDirection="column">
            <Text>
              <Text bold>🧩 Models  </Text>
              <Text dimColor>{modelNames.map(m => `${short(m)} ${((models[m] / modelTotal) * 100).toFixed(1)}%`).join(' | ')}</Text>
            </Text>
            <Text>
              <Text dimColor>  [</Text>
              {modelNames.map((m, i) => (
                <Text color={palette[i % palette.length]}>{'█'.repeat(Math.round((models[m] / modelTotal) * W))}</Text>
              ))}
              <Text dimColor>]</Text>
            </Text>
          </Box>
        )}
        <Text> </Text>
        <Text>
          <Text bold>🔥 Burn rate  </Text>
          <Text color="warning">{k(Math.round(sum(t) / mins))}</Text>
          <Text dimColor> tokens/min</Text>
        </Text>
        <Text>
          <Text bold>📝 Output  </Text>
          <Text color="warning">{k(Math.round(t.output / mins))}</Text>
          <Text dimColor> tokens/min · in {k(t.input)} · out {k(t.output)}</Text>
        </Text>
        {s.cost && (
          <Text>
            <Text bold>💲 Cost  </Text>
            <Text color="success">${s.cost.usd.toFixed(2)}</Text>
            <Text dimColor> · ${(s.cost.usd / mins).toFixed(4)}/min (API-price estimate)</Text>
          </Text>
        )}
        {limits.length > 0 && <Text> </Text>}
        {limits.length > 0 && <Text bold>🔮 Predictions</Text>}
        {limits.map(r => {
          const reset = Date.parse(r.resetsAt!)
          const out = WINDOW_MS[r.kind] ? runsOutAt(r.percentUsed, reset, WINDOW_MS[r.kind], now) : undefined
          return (
            <Text>
              <Text color="suggestion">  {r.kind.replace('_', ' ')}: </Text>
              {out ? <Text color="error">runs out ~{when(out, now)}</Text> : <Text color="success">lasts until reset</Text>}
              <Text dimColor> · resets {when(reset, now)}</Text>
            </Text>
          )
        })}
        <Text> </Text>
        <Text dimColor>⏰ {hhmm(now)} · session {span(now - s.startedAt)} · {t.requests} requests</Text>
      </Box>
    )
  })

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    const u = res.usage
    if (!u) return res

    let name = 'main'
    if (e.agentId) {
      if (!types.has(e.agentId)) for (const a of await $.agent.list()) types.set(a.id, a.type)
      // ponytail: unlisted ids (compaction/memory forks, workflow agents) lumped as 'other'
      name = types.get(e.agentId) ?? 'other'
    }

    const all = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    await update($, byModel, m => ({ ...m, [u.model]: (m[u.model] ?? 0) + all }))
    const rows = await update($, byAgent, rows => {
      const r = rows[name] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }
      return {
        ...rows,
        [name]: {
          input: r.input + u.input_tokens,
          output: r.output + u.output_tokens,
          cacheRead: r.cacheRead + u.cache_read_input_tokens,
          cacheWrite: r.cacheWrite + u.cache_creation_input_tokens,
          requests: r.requests + 1,
        },
      }
    })
    const t = total(Object.values(rows))
    try {
      $.ui.status(`in ${k(t.input)} · out ${k(t.output)} · cache ${k(t.cacheRead)} (${hitRate(t)}%) · ${Object.keys(rows).length} agents`)
    } catch {} // status is cosmetic: never lose the response over it
    return res
  })
}

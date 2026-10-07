import { expect, test } from 'claude-code/testing'

import { accent, bar, hitRate, k, planColor, runsOutAt, span, table } from './register'

test('compact numbers and spans', () => {
  expect(k(950)).toBe('950')
  expect(k(4074200)).toBe('4.1M')
  expect(span(90 * 3600e3 + 12 * 60e3)).toBe('3d 18h')
  expect(span(4 * 3600e3 + 32 * 60e3)).toBe('4h 32m')
})

const u = { input: 100, output: 50, cacheRead: 800, cacheWrite: 100, requests: 2 }

test('hit rate is cache read over all input', () => {
  expect(hitRate(u)).toBe(80)
  expect(hitRate({ ...u, input: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0)
})

test('table puts main first and sums a TOTAL row', () => {
  const out = table({ Explore: u, main: u })
  const lines = out.split('\n')
  expect(lines[1].startsWith('main')).toBe(true)
  expect(lines[2].startsWith('Explore')).toBe(true)
  expect(lines[3]).toContain('1.6k') // 800 + 800 cache read
})

test('a step passes its response through untouched', async ($, on) => {
  const response = {
    turnId: 't', index: 0, answer: 'hi', toolUses: [], stopReason: 'end_turn' as const,
    usage: { model: 'm', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 },
  }
  let status: string | undefined
  on('ui.status', (_$, e) => { status = e.text; return { value: undefined } })
  on('turn.step', async function* (_$, e) { return { ...response, index: e.index } })
  for (const index of [0, 1]) {
    const stream = $.turn.step({ turnId: 't', index, model: 'm', messageCount: 1 })
    let step = await stream.next()
    while (!step.done) step = await stream.next()
    expect(step.value).toEqual({ ...response, index })
  }
  expect(status).toBe('in 20 · out 10 · cache 180 (90%) · 1 agents')
})

test('bar fills by percent and clamps', () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(150, 4)).toBe('████')
  expect(bar(-5, 4)).toBe('░░░░')
})

test('monitor pane draws on terminal and desktop', async ($, on) => {
  const H = 3600e3
  on('clock.now', () => ({ value: 2 * H }))
  on('session.id', () => ({ value: 'a1b2c3d4-test' }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 50000, window: 200000, percent: 25 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: new Date(5 * H).toISOString() }],
      cost: { usd: 1.5 },
    },
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({
      plugin: 'agent-usage', surface, component: 'Pane', requestId: 'usage-monitor',
      viewport: { columns: 60, rows: 40 },
      props: { title: 'Usage monitor', isFocused: false, bodyColumns: 48, placement: 'dock' },
    })
    expect(await pane.find({ text: 'USAGE MONITOR' })).toBeDefined()
    expect(await pane.find({ text: 'runs out' })).toBeDefined()
    expect(await pane.find({ text: '$1.50' })).toBeDefined()
    expect(await pane.find({ text: 'session a1b2c3d4' })).toBeDefined()
  }
})

test('limit projection: linear pace, none when it lasts', () => {
  const H = 3600e3
  // 5h window, 2h in, 50% used -> 100% at 4h in, before the 5h reset
  expect(runsOutAt(50, 5 * H, 5 * H, 2 * H)).toBe(4 * H)
  // 2h in, 20% used -> would need 10h, resets first
  expect(runsOutAt(20, 5 * H, 5 * H, 2 * H)).toBeUndefined()
  expect(runsOutAt(0, 5 * H, 5 * H, 2 * H)).toBeUndefined()
})

test('plan limit colors: yellow 65, orange 80, red 95', () => {
  expect(planColor(64.9)).toBe('success')
  expect(planColor(65)).toBe('warning')
  expect(planColor(80)).toBe('#ff8c00')
  expect(planColor(95)).toBe('error')
})

test('session accent is stable per id', () => {
  expect(accent('abc')).toBe(accent('abc'))
  expect(accent('abc')).toMatch(/^#[0-9a-f]{6}$/)
})

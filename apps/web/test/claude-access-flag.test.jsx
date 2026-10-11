/* ════════════════════════════════════════════════════════════════
   CLAUDE-ACCESS FLAG — the freeze must be real, and must be reversible.
   With CLAUDE_ACCESS_ENABLED false the Connections list shows Claude as the
   old "בקרוב" row, /connections/claude redirects, and useClaudeAccess (the
   only thing that calls mcp-tokens) never mounts. With it true the full
   feature renders, unchanged. Rendered with react-dom/server; the flag, the
   hook, useT and the Supabase client are mocked.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const flag = vi.hoisted(() => ({ on: false }))
const hookCalls = vi.hoisted(() => ({ n: 0 }))

vi.mock('../src/lib/claudeAccessFlag', () => ({
  get CLAUDE_ACCESS_ENABLED() { return flag.on },
}))
vi.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('../src/i18n/useT', () => ({
  useT: () => ({ t: (k, o) => (o?.title ? `${k}:${o.title}` : k), lang: 'he', gender: 'neutral' }),
}))
vi.mock('../src/hooks/useClaudeAccess', () => ({
  useClaudeAccess: () => {
    hookCalls.n++
    return {
      status: { active: true, expired: false, categories: ['clients'], consented_categories: ['clients'], expires_at: '2027-01-09T00:00:00Z', last_used_at: null },
      loading: false, busy: false, error: null,
      clearError: () => {}, create: vi.fn(), updateCategories: vi.fn(), renew: vi.fn(), revoke: vi.fn(),
    }
  },
}))

const { ClaudeEntry } = await import('../src/screens/connections/index.jsx')
const { default: ClaudeConnectionScreen } = await import('../src/screens/connections/ClaudeConnection.jsx')

const t = (k, o) => (o?.title ? `${k}:${o.title}` : k)
const renderEntry = () => renderToStaticMarkup(<ClaudeEntry t={t} onOpen={() => {}} />)
const renderRoute = () => renderToStaticMarkup(
  <MemoryRouter initialEntries={['/connections/claude']}>
    <Routes>
      <Route path="/connections/claude" element={<ClaudeConnectionScreen />} />
      <Route path="/connections" element={<p>CONNECTIONS-LIST</p>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { hookCalls.n = 0 })

describe('Claude access — flag OFF (frozen)', () => {
  beforeEach(() => { flag.on = false })

  it('the shipped flag is off', async () => {
    const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'claudeAccessFlag.js'), 'utf8')
    expect(real).toMatch(/export const CLAUDE_ACCESS_ENABLED = false/)
  })

  it('the list shows the old "בקרוב" row: disabled, drawn toggle, no button', () => {
    const html = renderEntry()
    expect(html).toContain('conn-row-soon')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('list.soon')
    expect(html).toContain('conn-toggle')
    expect(html).toContain('Claude')
    expect(html).not.toContain('<button')
    expect(hookCalls.n).toBe(0)
  })

  it('/connections/claude renders nothing of the screen and never mounts the hook', () => {
    const html = renderRoute()
    expect(html).not.toContain('conn-claude')
    expect(html).not.toContain('claude.title')
    expect(hookCalls.n).toBe(0)
  })
})

describe('Claude access — flag ON (full behaviour)', () => {
  beforeEach(() => { flag.on = true })

  it('the list shows the live Claude row (a button) fed by the hook', () => {
    const html = renderEntry()
    expect(html).toContain('<button')
    expect(html).not.toContain('conn-row-soon')
    expect(html).toContain('list.connected')
    expect(hookCalls.n).toBe(1)
  })

  it('/connections/claude renders the full screen', () => {
    const html = renderRoute()
    expect(html).toContain('conn-claude')
    expect(html).toContain('claude.title')
    expect(html).toContain('claude.renew')
    expect(html).toContain('claude.editCategories')
    expect(hookCalls.n).toBeGreaterThan(0)
  })
})

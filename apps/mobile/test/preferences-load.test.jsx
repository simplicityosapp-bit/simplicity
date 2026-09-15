/* ════════════════════════════════════════════════════════════════
   PREFERENCES — a failed read must not become an empty account.
   ════════════════════════════════════════════════════════════════
   supabase-js reports a dropped connection as { data: null, error } rather
   than throwing. The provider never looked at `error`, so a failed read
   looked exactly like a user with no preferences row: status 'ready',
   prefs {}. The next write sends the WHOLE blob — so the first setting
   the user touched replaced everything they had, onboarding included, and
   the next launch marched them back through the introduction.

   Rendered through jest-expo, with the backend replaced.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, act, waitFor, fireEvent } from '@testing-library/react-native'

const mockServer = {
  failRead: true,
  row: { preferences: { profile: { name: 'דנה' }, onboarding: { completed_at: '2026-01-01T00:00:00.000Z' } } },
  writes: [],
}

jest.mock('../src/lib/supabase', () => {
  const session = { user: { id: 'u1' } }
  const from = () => {
    const s = { op: 'select' }
    const q = {
      select: () => q,
      eq: () => q,
      update: (payload) => { s.op = 'update'; s.payload = payload; return q },
      insert: (payload) => { mockServer.writes.push({ op: 'insert', payload }); return Promise.resolve({ error: null }) },
      maybeSingle: async () => {
        if (s.op === 'update') {
          if (mockServer.failWrite) return { data: null, error: { message: 'Network request failed' } }
          mockServer.writes.push({ op: 'update', payload: s.payload })
          return { data: s.payload, error: null }
        }
        if (mockServer.failRead) return { data: null, error: { message: 'Network request failed' } }
        return { data: mockServer.row, error: null }
      },
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session } }) } } }
})

// eslint-disable-next-line import/first
import { PreferencesProvider, usePreferences } from '../src/lib/preferences'
// eslint-disable-next-line import/first
import PrefsErrorScreen from '../src/screens/PrefsErrorScreen'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'

let ctx
function Probe() {
  ctx = usePreferences()
  return null
}

describe('PreferencesProvider', () => {
  it('reports a failed read as an error, writes nothing on top of it, and recovers on retry', async () => {
    render(<PreferencesProvider><Probe /></PreferencesProvider>)
    await waitFor(() => expect(ctx.status).toBe('error'))

    /* The user changes something while we know nothing. It shows, but it
       must not reach the server as a fragment of their preferences. */
    await act(async () => { await ctx.update({ design: { theme: 'dark' } }) })
    expect(ctx.prefs.design.theme).toBe('dark')
    expect(mockServer.writes).toHaveLength(0)

    /* The retry succeeds: the server's copy arrives, the change made in the
       meantime is laid over it, and only then is the whole saved. */
    mockServer.failRead = false
    await act(async () => { await ctx.reload() })
    expect(ctx.status).toBe('ready')
    expect(ctx.prefs.profile.name).toBe('דנה')
    expect(ctx.prefs.design.theme).toBe('dark')
    await waitFor(() => expect(mockServer.writes).toHaveLength(1))
    expect(mockServer.writes[0].payload.preferences).toMatchObject({
      profile: { name: 'דנה' },
      onboarding: { completed_at: '2026-01-01T00:00:00.000Z' },
      design: { theme: 'dark' },
    })
  })

  /* Cancelling an account deletion offline used to lift the lock on the phone
     while the deletion stayed scheduled on the server. A strict change is only
     believed once the server has it. */
  it('rolls back a strict change the server never got, and says so', async () => {
    mockServer.failRead = false
    mockServer.failWrite = true
    mockServer.writes = []
    mockServer.row = { preferences: { accountDeletion: { scheduled_for: '2099-01-01T00:00:00.000Z' } } }
    render(<PreferencesProvider><Probe /></PreferencesProvider>)
    await waitFor(() => expect(ctx.status).toBe('ready'))

    let caught = null
    await act(async () => {
      try { await ctx.update({ accountDeletion: null }, { strict: true }) } catch (e) { caught = e }
    })
    expect(caught?.code).toBe('PREFS_WRITE_FAILED')
    expect(ctx.prefs.accountDeletion).toEqual({ scheduled_for: '2099-01-01T00:00:00.000Z' })

    /* An ordinary change keeps the old, optimistic behaviour. */
    await act(async () => { await ctx.update({ design: { theme: 'dark' } }) })
    expect(ctx.prefs.design.theme).toBe('dark')
  })
})

describe('PrefsErrorScreen', () => {
  it('says what happened and offers a retry', () => {
    const onRetry = jest.fn()
    const { getByText } = render(<PrefsErrorScreen onRetry={onRetry} />)
    getByText(i18n.t('components:prefsLoad.message'))
    fireEvent.press(getByText(i18n.t('common:tryAgain')))
    expect(onRetry).toHaveBeenCalled()
  })
})

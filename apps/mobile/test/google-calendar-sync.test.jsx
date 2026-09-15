/* ════════════════════════════════════════════════════════════════
   GOOGLE CALENDAR ON THE PHONE
   ════════════════════════════════════════════════════════════════
   The only thing that ever ran a Google Calendar sync was the web
   calendar screen, so a coach who lived on the phone watched their
   calendar freeze at whatever the browser last pulled. This pins the
   port of web's auto-sync and of the manage card:

     · a connected, stale calendar syncs on entry and reloads the feed;
       a fresh one does not pull again; an unconnected one never does;
     · a failing sync is reported — but only for a connected account;
     · "sync now" says what it did; disconnect asks first;
     · an unconnected account is sent to the web app to connect.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert, Linking } from 'react-native'
import { render, renderHook, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockInvoke = jest.fn()
jest.mock('../src/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
}))
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))

/* eslint-disable import/first */
import { useGoogleCalendarAutoSync } from '../src/hooks/useGoogleCalendar'
import { resetGoogleCalendar, SYNC_INTERVAL_MS } from '../src/lib/googleCalendar'
import { getSnapshot as toastSnapshot, clearToast } from '../src/lib/toast'
import GoogleCalendarCard from '../src/components/GoogleCalendarCard'
/* eslint-enable import/first */

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const actions = () => mockInvoke.mock.calls.map(([, opts]) => opts.body.action)

function answer({ status, sync }) {
  mockInvoke.mockImplementation(async (_name, { body }) => {
    if (body.action === 'status') return { data: { status } }
    if (body.action === 'sync') return sync
    if (body.action === 'disconnect') return { data: { status: { connected: false } } }
    return { data: {} }
  })
}

beforeEach(() => {
  mockInvoke.mockReset()
  resetGoogleCalendar()
  clearToast()
})

describe('background sync', () => {
  it('pulls a stale connected calendar on entry, then reloads the feed', async () => {
    answer({
      status: { connected: true, last_synced_at: new Date(Date.now() - SYNC_INTERVAL_MS - 1000).toISOString() },
      sync: { data: { status: { connected: true, last_synced_at: new Date().toISOString() }, synced: 2 } },
    })
    const onSynced = jest.fn()
    renderHook(() => useGoogleCalendarAutoSync({ onSynced }))
    await flush(); await flush()
    expect(actions()).toEqual(['status', 'sync'])
    expect(onSynced).toHaveBeenCalledTimes(1)
  })

  it('does not pull again when the last sync is recent', async () => {
    answer({ status: { connected: true, last_synced_at: new Date().toISOString() } })
    renderHook(() => useGoogleCalendarAutoSync())
    await flush(); await flush()
    expect(actions()).toEqual(['status'])
  })

  it('never syncs an account with nothing connected, and does not call it failing', async () => {
    mockInvoke.mockImplementation(async () => ({ error: new Error('boom') }))
    const { result } = renderHook(() => useGoogleCalendarAutoSync())
    await flush(); await flush()
    expect(actions()).toEqual(['status'])
    expect(result.current).toEqual({ connected: false, failing: false })
  })

  it('reports a connected calendar whose sync fails', async () => {
    answer({ status: { connected: true, last_synced_at: null }, sync: { error: new Error('invalid_grant') } })
    const { result } = renderHook(() => useGoogleCalendarAutoSync())
    await flush(); await flush()
    expect(result.current).toEqual({ connected: true, failing: true })
  })
})

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderCard = () => render(<SafeAreaProvider initialMetrics={METRICS}><GoogleCalendarCard /></SafeAreaProvider>)

describe('the Connections card', () => {
  it('syncs on demand and says how many events came in', async () => {
    answer({
      status: { connected: true, last_synced_at: new Date().toISOString() },
      sync: { data: { status: { connected: true, last_synced_at: new Date().toISOString() }, synced: 3, removed: 0 } },
    })
    renderCard()
    await flush()
    await act(async () => { fireEvent.press(screen.getByText('סנכרן עכשיו')) })
    expect(actions()).toContain('sync')
    expect(toastSnapshot().message).toBe('סונכרנו 3 אירועים.')
  })

  it('asks before disconnecting', async () => {
    answer({ status: { connected: true, last_synced_at: null } })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    renderCard()
    await flush()
    fireEvent.press(screen.getByText('נתק'))
    expect(actions()).not.toContain('disconnect')
    const destructive = alert.mock.calls[0][2].find((b) => b.style === 'destructive')
    await act(async () => { await destructive.onPress() })
    expect(actions()).toContain('disconnect')
    expect(screen.getByText('חבר את Google Calendar')).toBeTruthy()
    alert.mockRestore()
  })

  it('sends an unconnected account to the web app to connect', async () => {
    answer({ status: { connected: false } })
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    renderCard()
    await flush()
    fireEvent.press(screen.getByText('חבר את Google Calendar'))
    expect(open).toHaveBeenCalledWith('https://simplicity-os.com/connections')
    open.mockRestore()
  })
})

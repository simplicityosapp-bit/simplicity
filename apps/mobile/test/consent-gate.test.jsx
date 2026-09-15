/* ════════════════════════════════════════════════════════════════
   THE CONSENT GATE, ON THE PHONE
   ════════════════════════════════════════════════════════════════
   The phone had no re-acceptance gate, so a user who only used the app
   never saw a policy change, and a Google signup from the phone created
   an account with no consent recorded at all. This pins the port:

     · an up-to-date user goes straight in, and their acceptance is
       mirrored into the consent log;
     · a stale or missing acceptance holds the app at the policy screen,
       which will not confirm until all three documents are agreed to,
       and writes a re-acceptance that leaves marketing alone;
     · a consent carried through a Google sign-in is written for the
       user (marketing choice included) and logged as google_oauth.

   i18n resolves to Hebrew under test, so the assertions are Hebrew.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockUpdateUser = jest.fn()
const mockUpsert = jest.fn()
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: (...a) => mockUpdateUser(...a),
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      signOut: jest.fn(async () => ({ error: null })),
    },
    from: () => ({ upsert: (...a) => mockUpsert(...a) }),
  },
}))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})

/* eslint-disable import/first */
import ConsentGate from '../src/components/ConsentGate'
import { buildConsent, PRIVACY_VERSION, TERMS_VERSION, DPA_VERSION } from '../src/lib/legal'
import { setPendingConsent } from '../src/lib/pendingConsent'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
let uid = 0
const sessionWith = (user_metadata) => ({ user: { id: `user-${++uid}`, user_metadata } })
const renderGate = (session) => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <ConsentGate session={session}><Text>האפליקציה</Text></ConsentGate>
  </SafeAreaProvider>,
)
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null })
  mockUpsert.mockReset().mockResolvedValue({ error: null })
})

describe('consent gate', () => {
  it('lets an up-to-date user in and mirrors their acceptance into the log', async () => {
    renderGate(sessionWith(buildConsent({ marketing: true })))
    await flush()
    expect(screen.getByText('האפליקציה')).toBeTruthy()
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = mockUpsert.mock.calls[0]
    expect(rows.map((r) => r.kind)).toEqual(['privacy', 'dpa', 'terms', 'marketing'])
    expect(rows.every((r) => r.user_id === 'u1')).toBe(true)
    expect(opts).toEqual({ onConflict: 'user_id,kind,accepted_at', ignoreDuplicates: true })
  })

  it('holds a stale user at the policy screen until all three are agreed', async () => {
    renderGate(sessionWith({ ...buildConsent(), terms_version: '1.0' }))
    await flush()
    expect(screen.queryByText('האפליקציה')).toBeNull()
    expect(screen.getByText('שינינו כמה דברים במדיניות')).toBeTruthy()

    fireEvent.press(screen.getByText('אני מאשר/ת'))
    expect(mockUpdateUser).not.toHaveBeenCalled()

    fireEvent.press(screen.getByLabelText('קראתי ואני מסכים/ה למדיניות הפרטיות'))
    fireEvent.press(screen.getByLabelText('קראתי ואני מסכים/ה להסכם עיבוד הנתונים (DPA)'))
    fireEvent.press(screen.getByText('אני מאשר/ת'))
    expect(mockUpdateUser).not.toHaveBeenCalled()

    fireEvent.press(screen.getByLabelText('קראתי ואני מסכים/ה לתנאי השימוש'))
    await act(async () => { fireEvent.press(screen.getByText('אני מאשר/ת')) })
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    const { data } = mockUpdateUser.mock.calls[0][0]
    expect(data).toMatchObject({ privacy_version: PRIVACY_VERSION, dpa_version: DPA_VERSION, terms_version: TERMS_VERSION })
    expect('marketing_consent' in data).toBe(false)
  })

  it('asks a user with no consent on record — nothing is logged for them', async () => {
    renderGate(sessionWith({}))
    await flush()
    expect(screen.getByText('שינינו כמה דברים במדיניות')).toBeTruthy()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('says so when the acceptance cannot be saved', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: new Error('network') })
    renderGate(sessionWith({}))
    await flush()
    for (const label of ['מדיניות הפרטיות', 'הסכם עיבוד הנתונים (DPA)', 'תנאי השימוש']) {
      fireEvent.press(screen.getByLabelText(`קראתי ואני מסכים/ה ל${label}`))
    }
    await act(async () => { fireEvent.press(screen.getByText('אני מאשר/ת')) })
    expect(screen.getByText('שמירת האישור נכשלה. נסה/י שוב.')).toBeTruthy()
  })

  it('writes the consent carried through a Google signup, marketing choice included', async () => {
    const pending = buildConsent({ marketing: true }, '2026-09-15T10:00:00.000Z')
    setPendingConsent(pending)
    renderGate(sessionWith({ full_name: 'x' }))
    await flush(); await flush()
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: pending })
    const logged = mockUpsert.mock.calls[0][0]
    expect(logged.every((r) => r.source === 'google_oauth')).toBe(true)
    expect(logged.find((r) => r.kind === 'marketing')).toMatchObject({ accepted: true })
  })
})

/* ════════════════════════════════════════════════════════════════
   A MEETING STILL AHEAD cannot be confirmed as having happened.
   ════════════════════════════════════════════════════════════════
   "Did it happen? — yes" creates a real session, and for a per-session
   client that is a charge. The phone offered it for next week's meeting
   too; web only asks once the meeting's time has passed.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

// eslint-disable-next-line import/first
import EventDetailsModal from '../src/modals/EventDetailsModal'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const T = (k) => i18n.t(`modalsTask:event.${k}`)
const meeting = (when, isPast) => ({ id: 'm-1', kind: 'meeting', status: 'pending', when, title: 'דנה', isPast, raw: { id: '1', status: 'pending' } })
const renderSheet = (event, onConfirmMeeting = jest.fn()) => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <EventDetailsModal open event={event} onClose={() => {}} onConfirmMeeting={onConfirmMeeting} onSkipMeeting={jest.fn()} />
  </SafeAreaProvider>,
)

describe('EventDetailsModal', () => {
  it('shows an upcoming meeting as upcoming, with nothing to confirm', () => {
    const { getByText, queryByText } = renderSheet(meeting('2099-01-01T09:00:00.000Z', false))
    getByText(T('meetingUpcoming'))
    expect(queryByText(T('meetingHappened'))).toBeNull()
    expect(queryByText(T('yes'))).toBeNull()
  })

  it('asks about a meeting whose time has passed, and confirms it', async () => {
    const onConfirm = jest.fn(async () => {})
    const { getByText } = renderSheet(meeting('2020-01-01T09:00:00.000Z', true), onConfirm)
    getByText(T('meetingHappened'))
    fireEvent.press(getByText(T('yes')))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
  })

  it('reads the clock itself when the caller did not stamp the event', () => {
    const { getByText } = renderSheet(meeting('2099-01-01T09:00:00.000Z', undefined))
    getByText(T('meetingUpcoming'))
  })
})

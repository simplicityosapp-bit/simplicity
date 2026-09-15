/* ════════════════════════════════════════════════════════════════
   EVERY CALENDAR ROW OPENS SOMETHING YOU CAN ACT ON
   ════════════════════════════════════════════════════════════════
   The phone's details sheet could confirm a past meeting and edit a
   Google event — nothing else. An upcoming meeting could not be moved
   or cancelled, a booked slot showed no one, and reminder and follow-up
   rows did not open at all. Web's EventDetailsModal has all of it.

   Pinned: reschedule stays open on a rejected move and says why; cancel
   and booking-cancel ask first; follow-up done and reminder done/delete
   reach their handlers with the row.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import EventDetailsModal from '../src/modals/EventDetailsModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const T = (k, o) => i18n.t(`modalsTask:event.${k}`, o)
const sheet = (event, props = {}) => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <EventDetailsModal open event={event} onClose={props.onClose || jest.fn()} {...props} />
  </SafeAreaProvider>,
)
const pressConfirmInAlert = (alert) => act(async () => { await alert.mock.calls.at(-1)[2].find((b) => b.style === 'destructive').onPress() })

let alert
beforeEach(() => { alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}) })
afterEach(() => { alert.mockRestore() })

const upcoming = { id: 'm-1', kind: 'meeting', status: 'pending', when: '2099-03-02T09:00:00.000Z', title: 'דנה', isPast: false, raw: { id: '1', status: 'pending' } }

describe('an upcoming meeting', () => {
  it('reschedules to the typed date and time, and closes', async () => {
    const onRescheduleMeeting = jest.fn(async () => {})
    const onClose = jest.fn()
    sheet(upcoming, { onRescheduleMeeting, onCancelMeeting: jest.fn(), onClose })
    act(() => { fireEvent.press(screen.getByText(T('reschedule'))) })
    fireEvent.changeText(screen.getByLabelText(i18n.t('modalsTask:meeting.time')), '7:30')
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:common.save'))) })
    expect(onRescheduleMeeting).toHaveBeenCalledTimes(1)
    const [row, at] = onRescheduleMeeting.mock.calls[0]
    expect(row).toBe(upcoming.raw)
    const d = new Date(at)
    expect([d.getHours(), d.getMinutes()]).toEqual([7, 30])
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open and explains when the new slot is taken', async () => {
    const onClose = jest.fn()
    sheet(upcoming, { onRescheduleMeeting: jest.fn(async () => { throw new Error('dup') }), onClose })
    act(() => { fireEvent.press(screen.getByText(T('reschedule'))) })
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:common.save'))) })
    expect(screen.getByText(T('moveFailed'))).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks before cancelling', async () => {
    const onCancelMeeting = jest.fn(async () => {})
    sheet(upcoming, { onRescheduleMeeting: jest.fn(), onCancelMeeting })
    fireEvent.press(screen.getByText(T('cancelMeeting')))
    expect(onCancelMeeting).not.toHaveBeenCalled()
    await pressConfirmInAlert(alert)
    expect(onCancelMeeting).toHaveBeenCalledWith(upcoming.raw)
  })
})

describe('a booked event', () => {
  const booked = {
    id: 'c-1', kind: 'calendar', when: '2099-03-02T09:00:00.000Z', title: 'שיחת היכרות', raw: { id: 'e1', owned: true },
    booking: { id: 'b1', name: 'רותם', phone: '050-1234567', email: null, note: 'אחרי העבודה', pageName: 'דף הזמנות', meetingTypeName: 'היכרות' },
  }

  it('shows who booked and from where, and cancels behind a confirmation', async () => {
    const onCancelBooking = jest.fn(async () => {})
    sheet(booked, { onCancelBooking, onUpdateEvent: jest.fn(), onDeleteEvent: jest.fn() })
    expect(screen.getByText(T('bookingName', { name: 'רותם' }))).toBeTruthy()
    expect(screen.getByText(T('bookingFromPage', { page: 'דף הזמנות' }))).toBeTruthy()
    expect(screen.getByText(T('bookingNote', { note: 'אחרי העבודה' }))).toBeTruthy()
    fireEvent.press(screen.getByText(T('cancelBooking')))
    expect(onCancelBooking).not.toHaveBeenCalled()
    await pressConfirmInAlert(alert)
    expect(onCancelBooking).toHaveBeenCalledWith(booked)
  })
})

describe('rows that used to open nothing', () => {
  it('a follow-up is marked done', async () => {
    const onFollowupDone = jest.fn(async () => {})
    const lead = { id: 'l1', follow_up_date: '2099-03-02' }
    sheet({ id: 'l-l1', kind: 'leadFollowup', when: '2099-03-02T09:00:00', title: 'רותם', raw: lead }, { onFollowupDone })
    await act(async () => { fireEvent.press(screen.getByText(T('followupDone'))) })
    expect(onFollowupDone).toHaveBeenCalledWith(lead)
  })

  it('a reminder is marked done, or deleted after asking', async () => {
    const onCompleteReminder = jest.fn(async () => {})
    const onRemoveReminder = jest.fn(async () => {})
    const row = { id: 'r1', title: 'להתקשר' }
    const event = { id: 'r-r1', kind: 'reminder', when: '2099-03-02T09:00:00', title: 'להתקשר', raw: row }
    const { unmount } = sheet(event, { onCompleteReminder, onRemoveReminder })
    await act(async () => { fireEvent.press(screen.getByText(T('markDone'))) })
    expect(onCompleteReminder).toHaveBeenCalledWith(row)
    unmount()

    sheet(event, { onCompleteReminder, onRemoveReminder })
    fireEvent.press(screen.getByText(T('delete')))
    expect(onRemoveReminder).not.toHaveBeenCalled()
    await pressConfirmInAlert(alert)
    expect(onRemoveReminder).toHaveBeenCalledWith(row)
  })
})

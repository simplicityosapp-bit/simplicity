/* ════════════════════════════════════════════════════════════════
   THE CALENDAR SCREEN — agenda, filter, duplicates, the add chooser
   ════════════════════════════════════════════════════════════════
   Pinned:
     · with no saved view it opens on web's default, the agenda list,
       from today on;
     · a type switched off in the filter leaves the feed;
     · a near-exact duplicate of an app meeting hides the Google mirror
       by itself, with an undo; a looser one waits on the banner;
     · "+" asks what to add, as web's add gate does.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock('../src/hooks/useGoogleCalendar', () => ({ useGoogleCalendarAutoSync: () => ({ failing: false }) }))
jest.mock('../src/modals/AddMeetingModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddReminderModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddTaskModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddTransactionModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/EventDetailsModal', () => ({ __esModule: true, default: () => null }))

const mockPrefs = { current: {} }
jest.mock('../src/lib/preferences', () => ({
  usePreferences: () => ({ prefs: mockPrefs.current, update: jest.fn() }),
}))

const HOUR = 3600 * 1000
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
const mockCal = { current: null }
const base = () => ({
  meetings: [{ id: 'm1', subject_type: 'client', subject_id: 'c1', scheduled_at: inHours(26), status: 'pending' }],
  calendarEvents: [],
  clients: [{ id: 'c1', name: 'דנה', phone: '0501234567' }],
  groups: [], leads: [], sessions: [], bookings: [], bookingPages: [], meetingTypes: [], projects: [],
  reminders: [{ id: 'r1', title: 'לשלוח חשבונית', status: 'pending', scheduled_at: inHours(50) }],
  loading: false, error: null, refetch: jest.fn(),
  addMeeting: jest.fn(), confirmMeeting: jest.fn(), skipMeeting: jest.fn(), rescheduleMeeting: jest.fn(), setMeetingStatus: jest.fn(),
  updateMeeting: jest.fn(async () => {}), addSession: jest.fn(),
  updateEvent: jest.fn(), deleteEvent: jest.fn(async () => {}), restoreEvent: jest.fn(async () => {}), cancelBooking: jest.fn(),
  completeReminder: jest.fn(), removeReminder: jest.fn(), clearFollowup: jest.fn(),
  addReminder: jest.fn(), addTask: jest.fn(), addTransaction: jest.fn(),
})
jest.mock('../src/hooks/useCalendarData', () => ({ useCalendarData: () => mockCal.current }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import CalendarScreen from '../src/screens/CalendarScreen'
import { getSnapshot as undoSnapshot, dismiss } from '../src/lib/undo'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderCalendar = () => render(<SafeAreaProvider initialMetrics={METRICS}><CalendarScreen /></SafeAreaProvider>)

beforeEach(() => { mockPrefs.current = {}; mockCal.current = base(); dismiss() })
afterEach(() => { dismiss() })

describe('calendar screen', () => {
  it('opens on the agenda with meetings and reminders from today on', () => {
    renderCalendar()
    expect(screen.getByText('דנה')).toBeTruthy()
    expect(screen.getByText('לשלוח חשבונית')).toBeTruthy()
    // The month grid's navigation is not on screen in the agenda view.
    expect(screen.queryByLabelText(i18n.t('calendar:nav.prevMonth'))).toBeNull()
  })

  it('drops a type the filter switched off', () => {
    mockPrefs.current = { calendarFilter: { reminder: false } }
    renderCalendar()
    expect(screen.getByText('דנה')).toBeTruthy()
    expect(screen.queryByText('לשלוח חשבונית')).toBeNull()
  })

  it('hides a near-exact Google mirror by itself, with an undo', () => {
    const mirror = { id: 'e1', client_id: 'c1', start_time: new Date(new Date(mockCal.current.meetings[0].scheduled_at).getTime() + 5 * 60000).toISOString(), title: 'דנה' }
    mockCal.current = { ...base(), calendarEvents: [mirror] }
    renderCalendar()
    expect(mockCal.current.deleteEvent).toHaveBeenCalledWith(mirror)
    expect(undoSnapshot()).toMatchObject({ phase: 'offer', label: i18n.t('calendar:dup.autoHiddenOne') })
  })

  it('leaves a looser duplicate to the banner', () => {
    const loose = { id: 'e2', client_id: 'c1', start_time: new Date(new Date(mockCal.current.meetings[0].scheduled_at).getTime() + 60 * 60000).toISOString(), title: 'דנה' }
    mockCal.current = { ...base(), calendarEvents: [loose] }
    renderCalendar()
    expect(mockCal.current.deleteEvent).not.toHaveBeenCalled()
    expect(screen.getByText(i18n.t('calendar:dup.one'))).toBeTruthy()
  })

  it('asks what to add', () => {
    renderCalendar()
    act(() => { fireEvent.press(screen.getByLabelText(i18n.t('calendar:newEventAria'))) })
    expect(screen.getByText(i18n.t('modalsTask:addGate.meetingLabel'))).toBeTruthy()
    expect(screen.getByText(i18n.t('modalsTask:addGate.transactionLabel'))).toBeTruthy()
  })
})

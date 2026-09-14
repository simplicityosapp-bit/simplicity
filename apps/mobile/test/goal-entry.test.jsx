/* ════════════════════════════════════════════════════════════════
   LOGGING GOAL PROGRESS — for one goal, not for all of them.
   ════════════════════════════════════════════════════════════════
   Home's "עדכון יעד" picked a CATEGORY and saved the entry without a
   goal_id. Every manual goal shares one category, and core scores an entry
   with no goal_id toward every goal in its category — so one number typed
   there raised all of a coach's personal goals at once. Progress is now
   logged from the goal itself, as on web.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}))

/* DateField reads the week-start preference, which pulls in the Supabase
   client; nothing here talks to a backend. */
jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

// eslint-disable-next-line import/first
import { MoonExpansion } from '../src/screens/home/MoonWidget'
// eslint-disable-next-line import/first
import AddGoalEntryModal from '../src/modals/AddGoalEntryModal'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'

const personal = { id: 'c-manual', name: 'אישי', measurement_type: 'manual' }
const income = { id: 'c-income', name: 'הכנסות', measurement_type: 'auto' }
const scored = [
  { goal: { id: 'g-run', label: 'ריצה' }, cat: personal, paced: 50, pure: 40 },
  { goal: { id: 'g-read', label: 'קריאה' }, cat: personal, paced: 20, pure: 10 },
  { goal: { id: 'g-income', label: 'הכנסה חודשית' }, cat: income, paced: 80, pure: 70 },
]
const aria = (name) => i18n.t('home:widgets.moon.logEntryAria', { name })

describe('MoonExpansion', () => {
  it('offers a "+" on each manual goal, and hands back that goal', () => {
    const onLogEntry = jest.fn()
    const { getByLabelText, queryByLabelText } = render(
      <MoonExpansion scored={scored} conf={45} gender="female" onFull={() => {}} onLogEntry={onLogEntry} />,
    )
    expect(queryByLabelText(aria('הכנסה חודשית'))).toBeNull() // computed, nothing to type in
    fireEvent.press(getByLabelText(aria('קריאה')))
    expect(onLogEntry).toHaveBeenCalledWith({ goal: scored[1].goal, cat: personal })
  })
})

describe('AddGoalEntryModal', () => {
  it('saves the entry for the goal it was opened on', async () => {
    const onSave = jest.fn(async () => {})
    const { getByPlaceholderText, getByText } = render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AddGoalEntryModal open onClose={() => {}} onSave={onSave} category={personal} goal={scored[0].goal} />
      </SafeAreaProvider>,
    )
    fireEvent.changeText(getByPlaceholderText('0'), '3')
    fireEvent.press(getByText(i18n.t('modalsData:common.save')))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ goal_id: 'g-run', category_id: 'c-manual', value: 3 })
  })
})

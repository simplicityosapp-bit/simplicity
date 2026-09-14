/* ════════════════════════════════════════════════════════════════
   A NEW WEEKLY REMINDER starts at its next occurrence, not "today".
   ════════════════════════════════════════════════════════════════
   The form read the weekday from a date field that defaulted to today and
   saved that date, so a reminder made after its hour was overdue the
   moment it was saved. It now picks a weekday, as on web, and the first
   occurrence is the next future one.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ clients: [], taskCategories: [] }) }))

// eslint-disable-next-line import/first
import { weekdayNamesShort } from '@simplicity/core'
// eslint-disable-next-line import/first
import AddReminderModal from '../src/modals/AddReminderModal'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const R = (k) => i18n.t(`modalsTask:reminder.${k}`)

describe('AddReminderModal', () => {
  it('saves a weekly reminder on the chosen weekday, first due in the future', async () => {
    const onSave = jest.fn(async () => {})
    const { getByPlaceholderText, getByText } = render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AddReminderModal open onClose={() => {}} onSave={onSave} />
      </SafeAreaProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(R('titlePlaceholder')), 'לשלוח סיכום')
    fireEvent.press(getByText(R('recWeekly')))
    const names = weekdayNamesShort()
    const labels = Array.isArray(names) && names.length === 7 ? names : ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
    fireEvent.press(getByText(labels[2]))
    fireEvent.press(getByText(i18n.t('modalsTask:common.save')))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const row = onSave.mock.calls[0][0]
    expect(row).toMatchObject({ recurrence_type: 'weekly', recurrence_pattern: { dayOfWeek: 2 } })
    const first = new Date(row.scheduled_at)
    expect(first.getDay()).toBe(2)
    expect(first.getTime()).toBeGreaterThan(Date.now())
  })
})

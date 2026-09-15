/* ════════════════════════════════════════════════════════════════
   "הכל" — WHAT DO I OWE FIRST, ON THE PHONE
   ════════════════════════════════════════════════════════════════
   The phone had two tabs and no mixed list: a dated task was sprinkled
   into the reminders tab by date alone, an undated דחוף task was nowhere
   near the top, there was no search, and nothing could be pushed to
   tomorrow. Web's tasks screen opens on the mixed list, ranked by
   pressure (core domain/taskPressure).

   Pinned: the screen opens on it; an overdue reminder leads, then the
   דחוף task with no date, then next week; search narrows across kinds;
   postponing moves an overdue task to tomorrow and offers undo.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/modals/AddTaskModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddReminderModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/TaskTaxonomyModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }))

const DAY = 24 * 3600 * 1000
const mockUpdateTask = jest.fn(async () => ({}))
const mockTasks = [
  { id: 't-urgent', title: 'להגיש דוח', status: 'todo', priority: 'high', due_at: null, client_id: 'c1' },
  { id: 't-late', title: 'לשלוח הצעת מחיר', status: 'todo', priority: 'low', due_at: new Date(Date.now() - 2 * DAY).toISOString() },
  { id: 't-next', title: 'להזמין ציוד', status: 'todo', priority: 'medium', due_at: new Date(Date.now() + 3 * DAY).toISOString() },
]
const mockReminders = [
  { id: 'r-late', title: 'להתקשר לנופר', status: 'pending', scheduled_at: new Date(Date.now() - 3 * DAY).toISOString() },
]
jest.mock('../src/hooks/useTasksList', () => ({
  useTasksList: () => ({
    tasks: mockTasks, loading: false, error: null,
    addTask: jest.fn(), toggleDone: jest.fn(), updateTask: mockUpdateTask, deleteTask: jest.fn(), clearCompleted: jest.fn(), refetch: jest.fn(),
  }),
}))
jest.mock('../src/hooks/useRemindersList', () => ({
  useRemindersList: () => ({
    reminders: mockReminders, loading: false, error: null,
    addReminder: jest.fn(), editReminder: jest.fn(async () => ({})), completeReminder: jest.fn(), deleteReminder: jest.fn(), clearCompleted: jest.fn(), refetch: jest.fn(),
  }),
}))
jest.mock('../src/lib/formOptions', () => ({
  useFormOptions: () => ({ clients: [{ id: 'c1', name: 'דנה' }], projects: [], groups: [], taskStatuses: [] }),
}))
jest.mock('../src/hooks/useTaskTaxonomy', () => ({
  useTaskTaxonomy: () => ({ taskCategories: [], addStatus: jest.fn(), removeStatus: jest.fn(), addCategory: jest.fn(), removeCategory: jest.fn() }),
}))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import TasksScreen from '../src/screens/TasksScreen'
import { getSnapshot as undoSnapshot, dismiss } from '../src/lib/undo'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderTasks = () => render(<SafeAreaProvider initialMetrics={METRICS}><TasksScreen /></SafeAreaProvider>)
const titles = () => screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel)

beforeEach(() => { mockUpdateTask.mockClear(); dismiss() })
// The undo offer runs a timer; leave none behind for Jest to wait on.
afterEach(() => { dismiss() })

describe('the mixed list', () => {
  it('opens on "all", both kinds together, ranked by pressure', () => {
    renderTasks()
    expect(titles()).toEqual(['להתקשר לנופר', 'לשלוח הצעת מחיר', 'להגיש דוח', 'להזמין ציוד'])
    // The hero's middle tile and the leading group both read "באיחור".
    expect(screen.getAllByText(i18n.t('tasks:buckets.overdue'))).toHaveLength(2)
    expect(screen.getAllByText(i18n.t('tasks:priority.high')).length).toBeGreaterThan(0)
  })

  it('searches across tasks and reminders, including the linked client', () => {
    renderTasks()
    fireEvent.changeText(screen.getByPlaceholderText(i18n.t('tasks:search')), 'דנה')
    expect(titles()).toEqual(['להגיש דוח'])
    fireEvent.changeText(screen.getByPlaceholderText(i18n.t('tasks:search')), 'נופר')
    expect(titles()).toEqual(['להתקשר לנופר'])
  })

  it('pushes an overdue task to tomorrow and offers undo', async () => {
    renderTasks()
    const snoozes = screen.getAllByLabelText(i18n.t('tasks:item.snooze'))
    // Offered on the two overdue rows only — not on next week's or the undated one.
    expect(snoozes).toHaveLength(2)
    await act(async () => { fireEvent.press(snoozes[1]) })
    expect(mockUpdateTask).toHaveBeenCalledTimes(1)
    const [id, patch] = mockUpdateTask.mock.calls[0]
    expect(id).toBe('t-late')
    const next = new Date(patch.due_at)
    const tomorrow = new Date(Date.now() + DAY)
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()])
    expect(undoSnapshot()).toMatchObject({ phase: 'offer', label: i18n.t('tasks:item.snoozed') })
  })
})

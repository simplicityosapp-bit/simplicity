/* ════════════════════════════════════════════════════════════════
   THE TASKS SCREEN — what a screen reader and a filter still need.
   ════════════════════════════════════════════════════════════════
   The checkbox beside every task and reminder is the most-tapped
   control on this screen, and until recently a screen reader met it as
   a checkbox with no name — "checkbox, not checked", repeated down the
   list, with nothing to say which item each one belonged to. The edit
   pencil on a reminder was the same: a button with no word after it.

   This file also caught a mistake made while fixing that. The labels
   were assigned by the shape of the handler, and `onEdit` on a pencil
   looks identical whether the row is a task or a reminder — so the
   reminder's pencil was named "עריכת משימה". A screen reader would have
   announced "edit task" on a reminder. The reminders-view test below
   is what pins the right word to the right row.

   i18n resolves to Hebrew under test, so the assertions are Hebrew.
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

const task = (id, title, extra = {}) => ({
  id, title, status: 'todo', priority: 'high', due_at: null,
  client_id: null, project_id: null, category_id: null, status_id: null, ...extra,
})

const mockTasks = [
  task('t1', 'להכין חומרים לסדנה', { category_id: 'cat1' }),
  task('t2', 'לעדכן טקסט באתר', { priority: 'low', category_id: 'cat2' }),
]
const mockCategories = [
  { id: 'cat1', name: 'תוכן', color: '#8BA888' },
  { id: 'cat2', name: 'אדמיניסטרציה', color: '#D4A574' },
]
// A day ahead, so it lands in an upcoming bucket rather than overdue.
const mockReminders = [
  {
    id: 'r1', title: 'להתקשר לנופר', status: 'pending',
    scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    client_id: null, recurrence: null, deleted_at: null,
  },
]

jest.mock('../src/hooks/useTasksList', () => ({
  useTasksList: () => ({
    tasks: mockTasks, loading: false, error: null,
    addTask: jest.fn(), toggleDone: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn(),
    clearCompleted: jest.fn(), refetch: jest.fn(),
  }),
}))
jest.mock('../src/hooks/useRemindersList', () => ({
  useRemindersList: () => ({
    reminders: mockReminders, loading: false, error: null,
    addReminder: jest.fn(), editReminder: jest.fn(), completeReminder: jest.fn(), deleteReminder: jest.fn(),
    clearCompleted: jest.fn(), refetch: jest.fn(),
  }),
}))
jest.mock('../src/lib/formOptions', () => ({
  useFormOptions: () => ({ clients: [], projects: [], taskStatuses: [] }),
}))
/* Shape kept permissive on purpose: the screen reads the categories from
   here, and a key it does not use costs nothing. */
jest.mock('../src/hooks/useTaskTaxonomy', () => ({
  useTaskTaxonomy: () => ({
    taskCategories: mockCategories, categories: mockCategories, taskStatuses: [], statuses: [],
    addStatus: jest.fn(), removeStatus: jest.fn(), addCategory: jest.fn(), removeCategory: jest.fn(),
  }),
}))

// eslint-disable-next-line import/first
import TasksScreen from '../src/screens/TasksScreen'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderTasks = () => render(<SafeAreaProvider initialMetrics={METRICS}><TasksScreen /></SafeAreaProvider>)

describe('tasks screen', () => {
  it('lists the open tasks', () => {
    renderTasks()
    expect(screen.getByText('להכין חומרים לסדנה')).toBeTruthy()
    expect(screen.getByText('לעדכן טקסט באתר')).toBeTruthy()
  })

  it('names each task checkbox after the task it completes', () => {
    renderTasks()
    expect(screen.getByRole('checkbox', { name: 'להכין חומרים לסדנה' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'לעדכן טקסט באתר' })).toBeTruthy()
  })

  it('keeps every category in the filter beside the taxonomy link', () => {
    renderTasks()
    expect(screen.getAllByText('תוכן').length).toBeGreaterThan(0)
    expect(screen.getAllByText('אדמיניסטרציה').length).toBeGreaterThan(0)
    expect(screen.getByText('סטטוסים וקטגוריות')).toBeTruthy()
  })

  describe('reminders view', () => {
    const openReminders = () => {
      renderTasks()
      act(() => { fireEvent.press(screen.getAllByText('תזכורות')[0]) })
    }

    it('names the reminder checkbox after the reminder', () => {
      openReminders()
      expect(screen.getByRole('checkbox', { name: 'להתקשר לנופר' })).toBeTruthy()
    })

    /* The mistake this file exists to catch: the pencil on a reminder
       must say "edit reminder", and must not say "edit task". */
    it('names the reminder edit button as a reminder edit, not a task edit', () => {
      openReminders()
      expect(screen.getByLabelText('עריכת תזכורת')).toBeTruthy()
      expect(screen.queryByLabelText('עריכת משימה')).toBeNull()
    })
  })
})

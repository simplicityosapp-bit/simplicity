/* ════════════════════════════════════════════════════════════════
   THE GOALS SCREEN — progress, history and deletes with undo
   ════════════════════════════════════════════════════════════════
   Runs the real useGoalsData against a fake database. Pinned: a manual
   goal logs progress FOR ITSELF (goal_id) from its card; its history lists
   only its own entries; removing an entry or a goal asks first, soft-deletes
   and offers an undo that puts it back; an ended goal offers no "log".
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act, within } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockTables = {}
const mockWrites = []
jest.mock('../src/lib/supabase', () => {
  const from = (table) => {
    const q = {
      select: () => q, is: () => q, order: () => q,
      range: async () => ({ data: mockTables[table] || [], error: null }),
      update: (patch) => ({ eq: async (col, id) => { mockWrites.push({ table, op: 'update', id, patch }); return { error: null } } }),
      insert: (row) => ({ select: () => ({ single: async () => { mockWrites.push({ table, op: 'insert', row }); return { data: { id: `${table}-new`, ...row }, error: null } } }) }),
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }
})
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/hooks/useQuestions', () => ({ useQuestions: () => ({ questions: [], addQuestion: jest.fn(), updateQuestion: jest.fn() }) }))
jest.mock('../src/modals/AddGoalModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/EditGoalModal', () => ({ __esModule: true, default: () => null }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import GoalsScreen from '../src/screens/GoalsScreen'
import { performUndo, dismiss } from '../src/lib/undo'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const G = (k, o) => i18n.t(`goals:${k}`, o)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = ymd(new Date())
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const seed = () => {
  mockTables.goal_categories = [{ id: 'cat', key: 'other', name: 'אישי', measurement_type: 'manual', color: '#7a5cb8' }]
  mockTables.goals = [
    { id: 'g1', category_id: 'cat', label: 'ריצה', time_frame: 'monthly', target_value: 10, importance: 3 },
    { id: 'g2', category_id: 'cat', label: 'קריאה', time_frame: 'monthly', target_value: 5, importance: 3 },
    { id: 'g3', category_id: 'cat', label: 'ישן', time_frame: 'deadline', target_date: '2020-01-31', target_value: 5, importance: 3 },
  ]
  mockTables.goal_entries = [
    { id: 'e1', goal_id: 'g1', category_id: 'cat', value: 3, date: today },
    { id: 'e2', goal_id: 'g2', category_id: 'cat', value: 2, date: today },
  ]
}
const mount = async () => {
  render(<SafeAreaProvider initialMetrics={METRICS}><GoalsScreen /></SafeAreaProvider>)
  await flush()
}
const cardOf = (label) => {
  let node = screen.getByText(label)
  // The smallest ancestor holding both the head row's delete and the meta row's stars is the card.
  const isCard = (n) => within(n).queryAllByLabelText(G('card.deleteAria')).length === 1 && within(n).queryAllByLabelText(/5/).length >= 1
  while (node && !isCard(node)) node = node.parent
  return within(node)
}

jest.setTimeout(20000)
beforeEach(() => { for (const k of Object.keys(mockTables)) delete mockTables[k]; mockWrites.length = 0; seed() })
afterEach(() => { jest.restoreAllMocks(); dismiss() })

describe('goals screen', () => {
  it('logs progress for the goal whose card it was tapped on', async () => {
    await mount()
    fireEvent.press(cardOf('קריאה').getByText(G('card.addEntry')))
    fireEvent.changeText(screen.getByPlaceholderText('0'), '4')
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:goalEntry.save', { defaultValue: i18n.t('modalsData:common.save') }))) })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'goal_entries', op: 'insert', row: expect.objectContaining({ goal_id: 'g2', category_id: 'cat', value: 4 }) }))
  })

  it("lists only the goal's own entries, and an entry removed can be undone", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount()
    const card = cardOf('ריצה')
    fireEvent.press(card.getByText(G('card.history')))
    expect(card.getAllByLabelText(G('card.deleteEntryAria'))).toHaveLength(1)
    fireEvent.press(card.getByLabelText(G('card.deleteEntryAria')))
    await act(async () => { await alert.mock.calls[0][2][1].onPress() })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'goal_entries', op: 'update', id: 'e1', patch: expect.objectContaining({ deleted_at: expect.any(String) }) }))
    expect(cardOf('ריצה').queryByText(G('card.history'))).toBeNull()
    await act(async () => { await performUndo() })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'goal_entries', op: 'update', id: 'e1', patch: { deleted_at: null } }))
    expect(cardOf('ריצה').getByText(G('card.history'))).toBeTruthy()
  })

  it('deletes a goal after asking, with an undo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount()
    fireEvent.press(cardOf('קריאה').getByLabelText(G('card.deleteAria')))
    expect(mockWrites).toHaveLength(0)
    await act(async () => { await alert.mock.calls[0][2][1].onPress() })
    expect(screen.queryByText('קריאה')).toBeNull()
    await act(async () => { await performUndo() })
    expect(screen.getByText('קריאה')).toBeTruthy()
  })

  it('an ended goal keeps its card but offers no logging', async () => {
    await mount()
    expect(cardOf('ישן').queryByText(G('card.addEntry'))).toBeNull()
    expect(cardOf('ישן').getByText(G('card.ended'))).toBeTruthy()
  })
})

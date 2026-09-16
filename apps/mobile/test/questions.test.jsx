/* ════════════════════════════════════════════════════════════════
   DAILY QUESTIONS ON THE PHONE — schedule, skip, history, reminder
   ════════════════════════════════════════════════════════════════
   Pinned: a question's schedule is chosen when adding or editing it and is
   never written as null (the column is NOT NULL); the card says when it's
   asked and that a goal tracks it; deleting a question or an answer asks
   first and can be undone; a question skipped today waits behind "answer
   N skipped"; the home widget skips without writing an answer, nudges once
   the reminder time has passed, and invites a question when there are none.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockTables = {}
const mockWrites = []
jest.mock('../src/lib/supabase', () => {
  const from = (table) => {
    const result = () => ({ data: mockTables[table] || [], error: null })
    const q = {
      select: () => q, is: () => q, not: () => q, order: () => q, limit: async () => result(),
      range: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
      update: (patch) => ({ eq: async (col, id) => { mockWrites.push({ table, op: 'update', id, patch }); return { error: null } } }),
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }
})
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: mockNavigate }) }))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
const mockPrefs = { prefs: {}, update: jest.fn(async () => {}) }
jest.mock('../src/hooks/usePreferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/preferences', () => ({ usePreferences: () => mockPrefs }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import { ymdKey } from '@simplicity/core'
import AddQuestionModal from '../src/modals/AddQuestionModal'
import InsightsScreen from '../src/screens/InsightsScreen'
import InsightsWidget from '../src/screens/home/InsightsWidget'
import { performUndo, dismiss } from '../src/lib/undo'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const wrap = (ui) => render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>)
const T = (k, o) => i18n.t(`insights:${k}`, o)
const H = (k, o) => i18n.t(`home:widgets.insights.${k}`, o)
const S = (k) => i18n.t(`components:schedule.${k}`)
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const today = ymdKey(new Date())

jest.setTimeout(20000)
beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k]
  mockWrites.length = 0; mockPrefs.prefs = {}; mockPrefs.update.mockClear(); mockNavigate.mockClear()
})
afterEach(() => { jest.restoreAllMocks(); dismiss() })

describe('question schedule', () => {
  it('saves the weekdays chosen for a new question', async () => {
    const onSave = jest.fn(async () => {})
    wrap(<AddQuestionModal open onClose={jest.fn()} onSave={onSave} usedTemplateKeys={[]} />)
    fireEvent.press(screen.getByText(i18n.t('modalsTask:question.modeCustom')))
    fireEvent.changeText(screen.getByPlaceholderText(i18n.t('modalsTask:question.textPlaceholder')), 'ישנתי טוב?')
    fireEvent.press(screen.getByText(S('specificDays')))
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']) fireEvent.press(screen.getByText(i18n.t(`components:schedule.dayShort.${d}`)))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsTask:common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ custom_text: 'ישנתי טוב?', schedule_pattern: { type: 'days_of_week', values: [0] } }))
  })

  it('edits an existing schedule back to every day as {} — never null — and explains the locked scale', async () => {
    const onSave = jest.fn(async () => {})
    const q = { id: 'q1', custom_text: 'אנרגיה', scale_type: 'yes_no', icon: '⚡', schedule_pattern: { type: 'every_x_days', x: 3 } }
    wrap(<AddQuestionModal open onClose={jest.fn()} onSave={onSave} editQuestion={q} />)
    expect(screen.getByDisplayValue('3')).toBeTruthy()
    expect(screen.getByText(i18n.t('modalsTask:question.scaleLockedYesNo'))).toBeTruthy()
    fireEvent.press(screen.getByText(S('everyDay')))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsTask:common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ schedule_pattern: {} }))
  })
})

describe('insights screen', () => {
  const seed = () => {
    mockTables.user_questions = [
      { id: 'q1', custom_text: 'אנרגיה', scale_type: '1-10', icon: '⚡', active: true, order: 0, schedule_pattern: { type: 'days_of_week', values: [new Date().getDay()] } },
      { id: 'q2', custom_text: 'שינה', scale_type: 'yes_no', icon: '🌙', active: true, order: 1, schedule_pattern: {} },
    ]
    mockTables.daily_answers = [{ id: 'a1', user_question_id: 'q1', date: '2026-09-01', value_num: 7 }]
    mockTables.goals = [{ tracked_by_question_id: 'q2' }]
  }
  const mount = async () => { wrap(<InsightsScreen />); await flush() }

  it('says when each question is asked and which one a goal tracks', async () => {
    seed()
    await mount()
    expect(screen.getByText(i18n.t(`questions:schedule.dayShort.${new Date().getDay()}`))).toBeTruthy()
    expect(screen.getAllByText(i18n.t('settings:questions.linkedToGoal'))).toHaveLength(1)
  })

  it('deletes a question after asking, and the undo brings it back', async () => {
    seed()
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount()
    fireEvent.press(screen.getByLabelText(T('card.deleteAria', { question: 'שינה' })))
    expect(mockWrites).toHaveLength(0)
    await act(async () => { await alert.mock.calls[0][2][1].onPress() })
    expect(screen.queryByText('שינה')).toBeNull()
    await act(async () => { await performUndo() })
    expect(screen.getByText('שינה')).toBeTruthy()
    expect(mockWrites.at(-1)).toMatchObject({ table: 'user_questions', id: 'q2', patch: { deleted_at: null } })
  })

  it('removes an answer from the history, with an undo', async () => {
    seed()
    mockPrefs.prefs = { insShowHistory: true }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await mount()
    fireEvent.press(screen.getByLabelText(T('history.deleteAria')))
    await act(async () => { await alert.mock.calls[0][2][1].onPress() })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'daily_answers', id: 'a1' }))
    expect(screen.getByText(T('history.empty'))).toBeTruthy()
    await act(async () => { await performUndo() })
    expect(screen.queryByText(T('history.empty'))).toBeNull()
  })

  it('holds a question skipped today behind "answer skipped"', async () => {
    seed()
    mockPrefs.prefs = { insSkipped: { date: today, ids: ['q2'] } }
    await mount()
    expect(screen.queryByText(T('card.yes'))).toBeNull()
    fireEvent.press(screen.getByText(T('unskip.one')))
    expect(mockPrefs.update).toHaveBeenCalledWith({ insSkipped: { date: today, ids: [] } })
  })

  it('turns the daily reminder on', async () => {
    seed()
    await mount()
    fireEvent.press(screen.getByRole('switch'))
    expect(mockPrefs.update).toHaveBeenCalledWith({ insightsReminder: { enabled: true, time: '20:00' } })
  })
})

describe('home widget', () => {
  const questions = [{ id: 'q2', custom_text: 'שינה', scale_type: 'yes_no', active: true, schedule_pattern: {} }]

  it('skips a question for today without answering it', () => {
    const addAnswer = jest.fn()
    wrap(<InsightsWidget questions={questions} answers={[]} addAnswer={addAnswer} />)
    fireEvent.press(screen.getByLabelText(H('skipAria')))
    const fn = mockPrefs.update.mock.calls[0][0]
    expect(fn({ insSkipped: { date: today, ids: ['x'] } })).toEqual({ insSkipped: { date: today, ids: ['x', 'q2'] } })
    expect(addAnswer).not.toHaveBeenCalled()
  })

  it('nudges once the reminder time has passed', () => {
    mockPrefs.prefs = { insightsReminder: { enabled: true, time: '00:00' } }
    wrap(<InsightsWidget questions={questions} answers={[]} addAnswer={jest.fn()} />)
    expect(screen.getByText(H('reminder'))).toBeTruthy()
  })

  it('invites a question instead of disappearing when there are none', () => {
    wrap(<InsightsWidget questions={[]} answers={[]} addAnswer={jest.fn()} />)
    fireEvent.press(screen.getByText(H('addQuestion')))
    expect(mockNavigate).toHaveBeenCalledWith('Insights')
  })
})

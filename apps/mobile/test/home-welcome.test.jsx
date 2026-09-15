/* ════════════════════════════════════════════════════════════════
   THE HOME SETUP CARD, ON THE PHONE
   ════════════════════════════════════════════════════════════════
   Someone who skipped the intro on the phone had no way back into it,
   and nothing pointed at the setup it used to ask for. This pins the
   port of web's card: which tasks the phone offers (not the file import,
   which has no phone screen), how a task reads when done or never
   started, and that each row and the dismiss reach their handlers.

   i18n resolves to Hebrew under test, so the assertions are Hebrew.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import HomeWelcome, { phoneSetupTasks } from '../src/screens/home/HomeWelcome'

describe('phoneSetupTasks', () => {
  it('offers the intro, questions and recurring — not the import', () => {
    expect(phoneSetupTasks({}).map((t) => t.key)).toEqual(['setup', 'questions', 'recurring'])
  })
})

describe('HomeWelcome', () => {
  it('invites a never-started intro and resumes a started one', () => {
    const { rerender } = render(<HomeWelcome tasks={phoneSetupTasks({})} onOpen={jest.fn()} />)
    expect(screen.getByText('להתחיל את ההיכרות')).toBeTruthy()
    rerender(<HomeWelcome tasks={phoneSetupTasks({ prefs: { onboarding: { started_at: 'x' } } })} onOpen={jest.fn()} />)
    expect(screen.getByText('להמשיך את ההיכרות')).toBeTruthy()
  })

  it('marks a finished task done and still lets it be opened', () => {
    const onOpen = jest.fn()
    render(<HomeWelcome tasks={phoneSetupTasks({ prefs: { onboarding: { completed_at: 'x' } }, recurring: [{}] })} onOpen={onOpen} />)
    expect(screen.queryByText('להמשיך את ההיכרות')).toBeNull()
    expect(screen.getByText('בוצע')).toBeTruthy()
    fireEvent.press(screen.getByText('הוצאות והכנסות קבועות'))
    fireEvent.press(screen.getByText('שאלות יומיות'))
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['recurring', 'questions'])
  })

  it('can be dismissed', () => {
    const onDismiss = jest.fn()
    render(<HomeWelcome tasks={phoneSetupTasks({})} onOpen={jest.fn()} onDismiss={onDismiss} />)
    fireEvent.press(screen.getByLabelText('הסתרת כרטיס הפתיחה'))
    expect(onDismiss).toHaveBeenCalled()
  })
})

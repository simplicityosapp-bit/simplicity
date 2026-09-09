/* ════════════════════════════════════════════════════════════════
   THE ONBOARDING SHELL — the footer contract every step relies on.
   ════════════════════════════════════════════════════════════════
   The first component test in this app. It renders through jest-expo, so
   the tree under test is real React Native rather than react-native-web —
   what is asserted here is the component that actually ships, including
   its accessibility roles and states.

   The contract worth pinning is the one that was a bug once: the primary
   button is NEVER dead. A step with nothing filled in offers to move on
   instead of greying out, because disabling it on arrival and leaving a
   small skip link as the only way forward reads as the app being stuck.
   One button, two jobs — exactly the wiring a refactor breaks quietly.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { View } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import OnboardingShell from '../src/screens/onboarding/OnboardingShell'

/* Leaves with no logic of their own: the frame reaches for preferences and
   a background photo, the tree for artwork. Neither is what this is about. */
jest.mock('../src/components/Screen', () => {
  const { View: V } = require('react-native')
  return { __esModule: true, default: ({ children }) => <V>{children}</V> }
})
jest.mock('../src/screens/onboarding/OnboardingTree', () => {
  const { View: V } = require('react-native')
  return { __esModule: true, default: () => <V /> }
})

const makeOb = (over = {}) => ({
  stepIndex: 1,
  total: 5,
  progress: 0.4,
  step: 'projects',
  back: jest.fn(),
  skipStep: jest.fn(async () => {}),
  skipAll: jest.fn(async () => {}),
  ...over,
})

const renderShell = (ob, cta) =>
  render(<OnboardingShell ob={ob} cta={cta}><View /></OnboardingShell>)

describe('the primary button when the step can advance', () => {
  it('offers to go on, and calls the step handler', () => {
    const cta = { onNext: jest.fn(async () => {}), canAdvance: true, busy: false, hint: null }
    renderShell(makeOb(), cta)
    fireEvent.press(screen.getByText('הלאה'))
    expect(cta.onNext).toHaveBeenCalledTimes(1)
  })

  it('uses a label the step supplies, when it supplies one', () => {
    renderShell(makeOb(), { onNext: jest.fn(), canAdvance: true, nextLabel: 'Shall we begin?' })
    expect(screen.getByText('Shall we begin?')).toBeTruthy()
  })
})

describe('the primary button when the step cannot advance', () => {
  /* The bug this prevents: a disabled button on arrival, with a small skip
     link as the only way forward, reads as the app being stuck. */
  it('is not dead — it offers to move on instead', () => {
    const ob = makeOb()
    renderShell(ob, { onNext: jest.fn(), canAdvance: false, busy: false, hint: null })
    fireEvent.press(screen.getByText('לדלג על הצעד'))
    expect(ob.skipStep).toHaveBeenCalledTimes(1)
  })

  it('does not call the step handler on that press', () => {
    const onNext = jest.fn()
    renderShell(makeOb(), { onNext, canAdvance: false, busy: false, hint: null })
    fireEvent.press(screen.getByText('לדלג על הצעד'))
    expect(onNext).not.toHaveBeenCalled()
  })

  it('shows the hint that says what filling it in would get', () => {
    renderShell(makeOb(), { onNext: jest.fn(), canAdvance: false, hint: 'A name is needed to save this.' })
    expect(screen.getByText('A name is needed to save this.')).toBeTruthy()
  })
})

describe('going back', () => {
  it('is offered mid-flow', () => {
    const ob = makeOb({ stepIndex: 2 })
    renderShell(ob, null)
    fireEvent.press(screen.getByText('חזרה'))
    expect(ob.back).toHaveBeenCalledTimes(1)
  })

  /* There is nowhere to go back TO from the first step, and a control that
     looks pressable and does nothing is worse than one that reads as off.
     Asserted through the accessibility state, which is the part a screen
     reader announces — and the part react-native-web would have dropped. */
  it('is disabled on the first step, and announces itself that way', () => {
    const ob = makeOb({ stepIndex: 0 })
    renderShell(ob, null)

    fireEvent.press(screen.getByText('חזרה'))
    expect(ob.back).not.toHaveBeenCalled()

    /* Not merely inert — REPORTED as disabled, which is what a screen
       reader announces. This assertion is the reason these tests run
       through jest-expo rather than react-native-web: accessibility state
       is a no-op on the web renderer, so it would have passed there
       whether the app said it or not. */
    expect(screen.getByRole('button', { name: 'חזרה' })).toBeDisabled()
  })
})

describe('the way out', () => {
  /* Reachable from every step, not offered once on the welcome screen —
     that version left anyone who stalled on step three skipping through
     every remaining step to escape. */
  it('is present on every step and releases the flow', async () => {
    const ob = makeOb({ stepIndex: 3 })
    renderShell(ob, { onNext: jest.fn(), canAdvance: true })
    await act(async () => { fireEvent.press(screen.getByText('לצאת מההיכרות')) })
    expect(ob.skipAll).toHaveBeenCalledTimes(1)
  })
})

describe('while a step is saving', () => {
  it('says so, and refuses a second press', () => {
    const onNext = jest.fn()
    renderShell(makeOb(), { onNext, canAdvance: true, busy: true })
    fireEvent.press(screen.getByText('שומר…'))
    expect(onNext).not.toHaveBeenCalled()
  })
})

describe('a step whose save fails', () => {
  /* The primary is async on most steps. Wired straight through, a
     rejection became an unhandled promise rejection — the user pressed,
     nothing moved, and nothing said why. */
  it('does not surface as an unhandled rejection', async () => {
    const onNext = jest.fn(async () => { throw new Error('offline') })
    renderShell(makeOb(), { onNext, canAdvance: true })
    await act(async () => { fireEvent.press(screen.getByText('הלאה')) })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})

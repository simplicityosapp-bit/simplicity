/* ════════════════════════════════════════════════════════════════
   THE CRASH SCREEN — a way out, not just a stack trace.
   ════════════════════════════════════════════════════════════════
   When a render throws, this is all that is left of the app. It used
   to be the error and the stack and nothing else: whoever reached it
   could read what broke and then had to kill the app themselves, which
   plenty of people on a phone do not know how to do — so one crash read
   as the app being gone.

   Pinned here: the diagnostics are still on screen (they are how a
   device failure gets reported from a screenshot), and the restart
   button actually reaches for the release-build relaunch rather than
   just being drawn.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import ErrorBoundary from '../src/components/ErrorBoundary'

function Boom() {
  throw new Error('widget exploded')
}

describe('error boundary', () => {
  let errorSpy
  beforeEach(() => {
    // React reports the caught render error to console.error; that is the
    // mechanism under test working, not noise worth printing.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { errorSpy.mockRestore() })

  it('renders children untouched when nothing throws', () => {
    const { Text } = require('react-native')
    render(<ErrorBoundary><Text>all good</Text></ErrorBoundary>)
    expect(screen.getByText('all good')).toBeTruthy()
    expect(screen.queryByText('Restart')).toBeNull()
  })

  it('keeps the diagnostics on screen when a render throws', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('App error')).toBeTruthy()
    expect(screen.getByText('widget exploded')).toBeTruthy()
  })

  it('offers a restart that reaches for the release-build relaunch', async () => {
    const updates = require('expo-updates')
    updates.reloadAsync.mockClear()
    render(<ErrorBoundary><Boom /></ErrorBoundary>)

    await act(async () => { fireEvent.press(screen.getByText('Restart')) })

    expect(updates.reloadAsync).toHaveBeenCalledTimes(1)
  })
})

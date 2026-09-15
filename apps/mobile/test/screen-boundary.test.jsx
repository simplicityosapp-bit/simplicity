/* ════════════════════════════════════════════════════════════════
   ONE SCREEN'S CRASH STAYS THAT SCREEN'S
   ════════════════════════════════════════════════════════════════
   The only boundary used to wrap the whole app, so a render bug on any
   screen replaced everything with a stack trace. Each navigator screen
   now has its own: a sentence, "try again", and "home". Pinned: the
   stack is not shown, retry remounts the screen, home goes home.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import i18n from '../src/lib/i18n'
import { withScreenBoundary } from '../src/components/ScreenBoundary'

let shouldThrow = true
function Flaky() {
  if (shouldThrow) throw new Error('reports exploded')
  return <Text>reports</Text>
}
const Guarded = withScreenBoundary(Flaky)

describe('screen boundary', () => {
  let errorSpy
  beforeEach(() => {
    shouldThrow = true
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { errorSpy.mockRestore() })

  it('replaces only the screen, in words, without the stack', () => {
    render(<Guarded navigation={{ navigate: jest.fn() }} />)
    expect(screen.getByText(i18n.t('common:screenError.title'))).toBeTruthy()
    expect(screen.queryByText(/at Flaky|componentStack/)).toBeNull()
  })

  it('tries the screen again', () => {
    render(<Guarded navigation={{ navigate: jest.fn() }} />)
    shouldThrow = false
    fireEvent.press(screen.getByText(i18n.t('common:screenError.retry')))
    expect(screen.getByText('reports')).toBeTruthy()
  })

  it('goes home', () => {
    const navigate = jest.fn()
    render(<Guarded navigation={{ navigate }} />)
    fireEvent.press(screen.getByText(i18n.t('common:screenError.home')))
    expect(navigate).toHaveBeenCalledWith('Main', { screen: 'Home' })
  })

  it('renders the screen untouched when nothing throws', () => {
    shouldThrow = false
    render(<Guarded navigation={{ navigate: jest.fn() }} />)
    expect(screen.getByText('reports')).toBeTruthy()
  })
})

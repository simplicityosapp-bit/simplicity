/* ════════════════════════════════════════════════════════════════
   ANDROID BACK — the press the app used to let fall through.
   ════════════════════════════════════════════════════════════════
   The "עוד" drawer is an App-level overlay, not a <Modal>, so Android
   never routed back to it: the press went past to the navigator, which
   popped the screen UNDERNEATH a drawer that stayed on screen — and on
   Home closed the app outright with the menu still up.

   Two things are worth pinning, because both were the bug:

     · while the overlay is open the handler runs AND returns true, which
       is what stops the press reaching the navigator. A handler that
       fires but returns false looks correct in a manual test and still
       pops the screen behind.
     · while it is closed there is no subscription at all. Leaving one
       registered would swallow the back press that should exit the app.

   Asserted through the real BackHandler rather than a stubbed hook, so a
   change in how RN hands out subscriptions shows up here.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { View, BackHandler } from 'react-native'
import { render, act } from '@testing-library/react-native'
import { useBackHandler } from '../src/lib/useBackHandler'

/* The registered handlers, in subscription order. RN fires them
   last-registered-first, which is why an overlay that subscribes when it
   opens beats the navigator that subscribed at mount. */
let handlers = []
let addSpy

beforeEach(() => {
  handlers = []
  addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evt, fn) => {
    handlers.push(fn)
    return { remove: () => { handlers = handlers.filter((h) => h !== fn) } }
  })
})
afterEach(() => { addSpy.mockRestore() })

const press = () => {
  for (let i = handlers.length - 1; i >= 0; i -= 1) if (handlers[i]() === true) return true
  return false
}

function Host({ open, onBack }) {
  useBackHandler(open, onBack)
  return <View testID="host" />
}

describe('useBackHandler', () => {
  it('handles the press and stops it while the overlay is open', () => {
    const onBack = jest.fn()
    render(<Host open onBack={onBack} />)

    let consumed
    act(() => { consumed = press() })

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(consumed).toBe(true)
  })

  it('registers nothing while the overlay is closed', () => {
    const onBack = jest.fn()
    render(<Host open={false} onBack={onBack} />)

    expect(handlers).toHaveLength(0)
    let consumed
    act(() => { consumed = press() })
    expect(onBack).not.toHaveBeenCalled()
    expect(consumed).toBe(false)
  })

  it('drops the subscription when the overlay closes', () => {
    const onBack = jest.fn()
    const { rerender } = render(<Host open onBack={onBack} />)
    expect(handlers).toHaveLength(1)

    act(() => { rerender(<Host open={false} onBack={onBack} />) })

    expect(handlers).toHaveLength(0)
  })

  /* The reason the callback lives in a ref: the drawer passes an inline
     arrow, so without it every render would tear down and re-add the
     subscription — churn, and a moving position in a queue where position
     is what decides who wins the press. */
  it('does not re-subscribe when the callback identity changes', () => {
    const { rerender } = render(<Host open onBack={() => {}} />)
    expect(addSpy).toHaveBeenCalledTimes(1)

    act(() => { rerender(<Host open onBack={() => {}} />) })

    expect(addSpy).toHaveBeenCalledTimes(1)
    expect(handlers).toHaveLength(1)
  })

  it('calls the latest callback, not the one it subscribed with', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = render(<Host open onBack={first} />)

    act(() => { rerender(<Host open onBack={second} />) })
    act(() => { press() })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

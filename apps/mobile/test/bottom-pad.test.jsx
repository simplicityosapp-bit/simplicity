/* ════════════════════════════════════════════════════════════════
   ROOM FOR THE TAB BAR — the number eighteen screens used to guess.
   ════════════════════════════════════════════════════════════════
   The bar is an App-level overlay: it covers the scroll content instead
   of taking space from it, so each screen reserves the room itself. All
   of them hardcoded 96, which is the bar's height ONLY on a device with
   nothing at the bottom of the screen. Add a home indicator and 11pt of
   the last row went under it; Android's 3-button navigation hid 25.

   What is worth pinning is that the number FOLLOWS the bar rather than
   agreeing with it today: a second constant would drift the moment the
   bar's padding, the label size or the font scale moves, which is the
   bug this replaced.

   The 96 in the first case is not a coincidence — it is the guarantee
   that this change is invisible where the old value was already right.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Text } from 'react-native'
import { render, screen, act } from '@testing-library/react-native'
import { BottomBarProvider, useBottomPad, useReportBottomBar } from '../src/lib/bottomBar'

/* Stands in for the bar: reports a height the way onLayout would. */
function Bar({ height }) {
  const report = useReportBottomBar()
  React.useEffect(() => { report(height) }, [report, height])
  return null
}

/* Stands in for a screen's scroll content. */
function Content() {
  const pad = useBottomPad()
  return <Text>{`pad:${pad.paddingBottom}`}</Text>
}

const mount = (height) => render(
  <BottomBarProvider>
    {height == null ? null : <Bar height={height} />}
    <Content />
  </BottomBarProvider>,
)

describe('bottom-bar clearance', () => {
  it('reproduces the old 96 on a device with no bottom inset', () => {
    mount(74)
    expect(screen.getByText('pad:96')).toBeTruthy()
  })

  it('grows with the bar on a device that has one', () => {
    // iPhone home indicator: 73 + 34.
    mount(107)
    expect(screen.getByText('pad:129')).toBeTruthy()
  })

  it('grows again for Android 3-button navigation', () => {
    // 73 + 48 — the case that hid 25pt of the last row.
    mount(121)
    expect(screen.getByText('pad:143')).toBeTruthy()
  })

  it('falls back to the old value before the bar has laid out', () => {
    mount(null)
    expect(screen.getByText('pad:96')).toBeTruthy()
  })

  it('follows the bar when it changes size', () => {
    const { rerender } = mount(74)
    expect(screen.getByText('pad:96')).toBeTruthy()

    act(() => {
      rerender(
        <BottomBarProvider>
          <Bar height={121} />
          <Content />
        </BottomBarProvider>,
      )
    })

    expect(screen.getByText('pad:143')).toBeTruthy()
  })

  /* onLayout fires on every layout pass. Re-rendering every scroll view in
     the app for a height that did not change is the reason report() checks
     first — and a fractional measurement must not defeat that check. */
  it('ignores a repeat measurement, fraction and all', () => {
    let renders = 0
    function Counted() {
      renders += 1
      const pad = useBottomPad()
      return <Text>{`pad:${pad.paddingBottom}`}</Text>
    }
    function Reporter() {
      const report = useReportBottomBar()
      React.useEffect(() => { report(74); report(74.4); report(73.8) }, [report])
      return null
    }
    render(<BottomBarProvider><Reporter /><Counted /></BottomBarProvider>)

    expect(screen.getByText('pad:96')).toBeTruthy()
    // One render for the initial mount, one for the measurement landing.
    expect(renders).toBeLessThanOrEqual(2)
  })
})

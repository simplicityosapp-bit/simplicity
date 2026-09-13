/* ════════════════════════════════════════════════════════════════
   SELECT — an option list that cannot push the form off the sheet.
   ════════════════════════════════════════════════════════════════
   The list expands into the form rather than floating over it, and it
   used to have no ceiling: picking a client out of eighty produced
   eighty rows inside a sheet capped at 86% of the screen, and the fields
   below — the save button among them — went past the bottom edge.

   Pinned: the list is a bounded scroller, picking an option reports it
   and closes the list, and the control still shows its placeholder when
   nothing is chosen.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import Select from '../src/components/Select'

const OPTIONS = Array.from({ length: 80 }, (_, i) => ({ value: `c${i}`, label: `לקוח ${i + 1}` }))

describe('Select', () => {
  it('shows the placeholder while nothing is chosen', () => {
    render(<Select value={null} options={OPTIONS} onChange={() => {}} placeholder="בחרו לקוח" />)
    expect(screen.getByText('בחרו לקוח')).toBeTruthy()
    expect(screen.queryByText('לקוח 1')).toBeNull()
  })

  it('opens into a bounded, scrollable list — not eighty rows of form', () => {
    render(<Select value={null} options={OPTIONS} onChange={() => {}} placeholder="בחרו לקוח" />)
    act(() => { fireEvent.press(screen.getByText('בחרו לקוח')) })

    const list = screen.UNSAFE_getByType(ScrollView)
    const style = StyleSheet.flatten(list.props.style)
    expect(style.maxHeight).toBeGreaterThan(0)
    expect(style.maxHeight).toBeLessThanOrEqual(300)
    // Android needs this for a scroller nested inside the sheet's own scroller.
    expect(list.props.nestedScrollEnabled).toBe(true)
  })

  it('reports the picked option and closes the list', () => {
    const onChange = jest.fn()
    render(<Select value={null} options={OPTIONS} onChange={onChange} placeholder="בחרו לקוח" />)
    act(() => { fireEvent.press(screen.getByText('בחרו לקוח')) })
    act(() => { fireEvent.press(screen.getByText('לקוח 3')) })

    expect(onChange).toHaveBeenCalledWith('c2')
    expect(screen.queryByText('לקוח 3')).toBeNull()
  })

  it('shows the chosen option in the control', () => {
    render(<Select value="c4" options={OPTIONS} onChange={() => {}} placeholder="בחרו לקוח" />)
    expect(screen.getByText('לקוח 5')).toBeTruthy()
    expect(screen.queryByText('בחרו לקוח')).toBeNull()
  })
})

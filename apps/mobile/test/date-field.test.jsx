/* ════════════════════════════════════════════════════════════════
   A DATE, PICKED — the calendar that replaced sixteen typed fields.
   ════════════════════════════════════════════════════════════════
   Every date in the app's forms was a free-text box asking for
   "YYYY-MM-DD". DateField is web's picker ported, and the forms now hand
   it the same 'YYYY-MM-DD' string they used to read out of the box — so
   what has to hold is that contract:

     · a picked day comes back as 'YYYY-MM-DD', in the Hebrew calendar too;
     · the field shows the date in the user's own format;
     · the week starts where Settings says it does;
     · an optional date can be cleared, and a required one cannot.

   Rendered through jest-expo, so this is real React Native.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockPrefs = { current: {} }
jest.mock('../src/lib/preferences', () => ({
  usePreferences: () => ({ prefs: mockPrefs.current }),
}))

// eslint-disable-next-line import/first
import { fmtDateInput, hebrewParts, monthNamesLong } from '@simplicity/core'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'
// eslint-disable-next-line import/first
import DateField from '../src/components/DateField'

const T = (k) => i18n.t(`components:dateField.${k}`)
const day = (y, m, d) => new Date(y, m - 1, d)

beforeAll(() => i18n.changeLanguage('he'))
beforeEach(() => { mockPrefs.current = {} })

const open = () => fireEvent.press(screen.getByLabelText(new RegExp(`^(${T('dialogLabel')}|${T('placeholder')})`)))

describe('DateField', () => {
  it('has its words on the phone, not keys', () => {
    for (const k of ['placeholder', 'dialogLabel', 'today', 'clear', 'nextMonth']) {
      expect(T(k)).not.toMatch(/dateField/)
    }
  })

  it('shows the placeholder when empty, and no clear button', () => {
    render(<DateField value="" onChange={() => {}} />)
    expect(screen.getByText(T('placeholder'))).toBeTruthy()
    expect(screen.queryByLabelText(T('clear'))).toBeNull()
  })

  it("shows a date in the user's own format", () => {
    render(<DateField value="2026-09-10" onChange={() => {}} />)
    expect(screen.getByText(fmtDateInput(day(2026, 9, 10)))).toBeTruthy()
  })

  it('hands back a picked day as YYYY-MM-DD, and folds the calendar', () => {
    const onChange = jest.fn()
    render(<DateField value="2026-09-10" onChange={onChange} />)
    open()
    fireEvent.press(screen.getByLabelText(fmtDateInput(day(2026, 9, 17))))
    expect(onChange).toHaveBeenCalledWith('2026-09-17')
    expect(screen.queryByText(T('today'))).toBeNull()
  })

  it('opens on the month of the date it holds, and steps a month', () => {
    render(<DateField value="2026-09-10" onChange={() => {}} />)
    open()
    expect(screen.getByText(`${monthNamesLong()[8]} 2026`)).toBeTruthy()
    fireEvent.press(screen.getByLabelText(T('nextMonth')))
    expect(screen.getByText(`${monthNamesLong()[9]} 2026`)).toBeTruthy()
  })

  it('picks today from the today button', () => {
    const onChange = jest.fn()
    render(<DateField value="" onChange={onChange} />)
    open()
    fireEvent.press(screen.getByText(T('today')))
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    expect(onChange).toHaveBeenCalledWith(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  })

  /* September 2026 begins on a Tuesday: a Sunday week shows Aug 30 first, a
     Monday week starts at Aug 31 and never shows the 30th. */
  it('starts the week where Settings says', () => {
    mockPrefs.current = { format: { week_start: 'monday' } }
    render(<DateField value="2026-09-10" onChange={() => {}} />)
    open()
    expect(screen.getByLabelText(fmtDateInput(day(2026, 8, 31)))).toBeTruthy()
    expect(screen.queryByLabelText(fmtDateInput(day(2026, 8, 30)))).toBeNull()
  })

  it('clears an optional date', () => {
    const onChange = jest.fn()
    render(<DateField value="2026-09-10" onChange={onChange} />)
    fireEvent.press(screen.getByLabelText(T('clear')))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('offers no clear on a date the form requires', () => {
    render(<DateField clearable={false} value="2026-09-10" onChange={() => {}} />)
    expect(screen.queryByLabelText(T('clear'))).toBeNull()
  })

  /* Hebrew date input changes the picker, never the value: the grid is a
     Hebrew month in gematria and what comes back is still Gregorian. */
  it('picks in the Hebrew calendar and still hands back a Gregorian date', () => {
    mockPrefs.current = { design: { hebrew_date_input: true } }
    const onChange = jest.fn()
    render(<DateField value="2026-09-10" onChange={onChange} />)
    const p = hebrewParts(day(2026, 9, 10))
    expect(screen.getByText(`${p.dayText} ב${p.month} ${p.yearText}`)).toBeTruthy()
    open()
    expect(screen.getAllByText(p.dayText).length).toBeGreaterThan(0)
    fireEvent.press(screen.getByLabelText(fmtDateInput(day(2026, 9, 11))))
    expect(onChange).toHaveBeenCalledWith('2026-09-11')
  })
})

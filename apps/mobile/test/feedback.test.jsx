/* ════════════════════════════════════════════════════════════════
   FEEDBACK FROM THE PHONE
   ════════════════════════════════════════════════════════════════
   The phone had no way to write to a person — the help screen's
   "talk to us" opened the web app. This pins the port of web's flow:

     · the row is the source of truth and is written first, tagged
       platform 'mobile'; the email is best-effort after it;
     · a database that predates the type/platform columns still takes
       the message (the retry ladder web uses);
     · nothing is sent while the box is empty;
     · closing over a half-written message asks first.

   i18n resolves to Hebrew under test, so the assertions are Hebrew.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockInsert = jest.fn()
const mockInvoke = jest.fn()
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: (row) => mockInsert(row) }),
    functions: { invoke: (...a) => mockInvoke(...a) },
  },
}))
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))

// eslint-disable-next-line import/first
import { submitFeedback } from '../src/lib/feedback'
// eslint-disable-next-line import/first
import { FeedbackModal } from '../src/modals/FeedbackModal'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderSheet = (onClose = jest.fn()) => {
  render(<SafeAreaProvider initialMetrics={METRICS}><FeedbackModal open onClose={onClose} /></SafeAreaProvider>)
  return onClose
}

beforeEach(() => {
  mockInsert.mockReset().mockResolvedValue({ error: null })
  mockInvoke.mockReset().mockResolvedValue({ error: null })
})

describe('submitFeedback', () => {
  it('writes the row as mobile feedback, then asks for the email', async () => {
    const res = await submitFeedback({ userId: 'u1', message: '  יש באג  ', type: 'bug' })
    expect(res).toEqual({ ok: true, emailed: true })
    expect(mockInsert).toHaveBeenCalledWith({ user_id: 'u1', message: 'יש באג', type: 'bug', platform: 'mobile', source: 'app' })
    expect(mockInvoke).toHaveBeenCalledWith('send-feedback', { body: { message: 'יש באג', type: 'bug', device: 'מובייל' } })
  })

  it('falls back to fewer columns on an older database', async () => {
    mockInsert
      .mockResolvedValueOnce({ error: { message: "Could not find the 'platform' column" } })
      .mockResolvedValueOnce({ error: { message: "column \"type\" does not exist" } })
      .mockResolvedValueOnce({ error: null })
    const res = await submitFeedback({ userId: 'u1', message: 'שלום' })
    expect(res.ok).toBe(true)
    expect(mockInsert).toHaveBeenLastCalledWith({ user_id: 'u1', message: 'שלום' })
  })

  it('still reports success when only the email fails — the row is saved', async () => {
    mockInvoke.mockResolvedValue({ error: new Error('smtp') })
    expect(await submitFeedback({ userId: 'u1', message: 'x' })).toEqual({ ok: true, emailed: false })
  })

  it('fails without emailing when the row cannot be written', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'permission denied' } })
    const res = await submitFeedback({ userId: 'u1', message: 'x' })
    expect(res.ok).toBe(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

describe('the feedback sheet', () => {
  it('sends nothing while the message is empty', () => {
    renderSheet()
    fireEvent.press(screen.getByText('שליחה'))
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('sends the chosen type and thanks the writer', async () => {
    renderSheet()
    fireEvent.press(screen.getByText('רעיון'))
    fireEvent.changeText(screen.getByPlaceholderText(/לנו כל מה שעולה לך לראש/), 'מצב כהה לדוחות')
    await act(async () => { fireEvent.press(screen.getByText('שליחה')) })
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ message: 'מצב כהה לדוחות', type: 'idea' }))
    expect(screen.getByText('תודה! הפידבק נשלח.')).toBeTruthy()
  })

  it('says so when sending fails, and keeps the message', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'network' } })
    renderSheet()
    fireEvent.changeText(screen.getByPlaceholderText(/לנו כל מה שעולה לך לראש/), 'טקסט')
    await act(async () => { fireEvent.press(screen.getByText('שליחה')) })
    expect(screen.getByText('משהו השתבש בשליחה. אפשר לנסות שוב.')).toBeTruthy()
    expect(screen.getByDisplayValue('טקסט')).toBeTruthy()
  })

  it('closes at once when untouched, and asks before dropping a written message', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onClose = renderSheet()
    fireEvent.press(screen.getByLabelText('סגור'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(alert).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByPlaceholderText(/לנו כל מה שעולה לך לראש/), 'חצי הודעה')
    fireEvent.press(screen.getByLabelText('סגור'))
    expect(alert).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    alert.mockRestore()
  })
})

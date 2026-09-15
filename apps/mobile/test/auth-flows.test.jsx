/* ════════════════════════════════════════════════════════════════
   SIGNING UP, CONFIRMING, CHANGING A PASSWORD — on the phone
   ════════════════════════════════════════════════════════════════
   Three doors web had and the phone did not:
     · signup asked for the password once, behind dots, on a phone
       keyboard — a slip became the account's password;
     · "confirm your email first" on login had no way to send the mail
       again;
     · nothing anywhere changed a password.

   Pinned: a mismatched second password stops the signup before anything
   is sent; an unconfirmed login offers the resend and it asks Supabase
   for a signup mail to that address; the change-password sheet holds a
   mismatch back and otherwise writes the new password.

   i18n resolves to Hebrew under test; strings are read through i18n.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  resend: jest.fn(),
  updateUser: jest.fn(),
}
// A getter, not the object: the factory runs while imports are hoisted, before
// mockAuth exists, and a plain reference would hand the screens `undefined`.
jest.mock('../src/lib/supabase', () => ({ supabase: { get auth() { return mockAuth } } }))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/components/GoogleButton', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/lib/googleSignIn', () => ({ signInWithGoogle: jest.fn() }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import LoginScreen from '../src/screens/LoginScreen'
import ChangePasswordModal from '../src/modals/ChangePasswordModal'
import { getSnapshot as toastSnapshot, clearToast } from '../src/lib/toast'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const wrap = (node) => render(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>)
const GOOD = 'Tzv9!kLmq2'

beforeEach(() => {
  Object.values(mockAuth).forEach((fn) => fn.mockReset())
  mockAuth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null })
  mockAuth.resend.mockResolvedValue({ error: null })
  mockAuth.updateUser.mockResolvedValue({ error: null })
  clearToast()
})

describe('signup', () => {
  it('asks for the password twice and stops on a mismatch', async () => {
    wrap(<LoginScreen />)
    fireEvent.press(screen.getByText(i18n.t('auth:signup')))
    fireEvent.changeText(screen.getByPlaceholderText('כתובת אימייל'), 'a@b.co')
    fireEvent.changeText(screen.getByPlaceholderText('סיסמה'), GOOD)
    fireEvent.changeText(screen.getByPlaceholderText(i18n.t('auth:signupScreen.confirmPasswordLabel')), `${GOOD}x`)
    await act(async () => { fireEvent.press(screen.getAllByText(i18n.t('auth:signup')).at(-1)) })
    expect(screen.getByText(i18n.t('auth:signupScreen.passwordsDoNotMatch'))).toBeTruthy()
    expect(mockAuth.signUp).not.toHaveBeenCalled()
  })
})

describe('login with an unconfirmed address', () => {
  it('offers to send the confirmation again, to that address', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } })
    wrap(<LoginScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('כתובת אימייל'), ' a@b.co ')
    fireEvent.changeText(screen.getByPlaceholderText('סיסמה'), GOOD)
    await act(async () => { fireEvent.press(screen.getAllByText(i18n.t('auth:login')).at(-1)) })
    expect(screen.getByText(i18n.t('auth:errors.emailNotConfirmed'))).toBeTruthy()

    await act(async () => { fireEvent.press(screen.getByText(i18n.t('auth:resend.button'))) })
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.co' })
    expect(screen.getByText(i18n.t('auth:resend.sent'))).toBeTruthy()
  })

  it('does not offer a resend for a wrong password', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    wrap(<LoginScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('כתובת אימייל'), 'a@b.co')
    fireEvent.changeText(screen.getByPlaceholderText('סיסמה'), GOOD)
    await act(async () => { fireEvent.press(screen.getAllByText(i18n.t('auth:login')).at(-1)) })
    expect(screen.getByText(i18n.t('auth:errors.invalidLogin'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('auth:resend.button'))).toBeNull()
  })
})

describe('change password', () => {
  const fill = (a, b) => {
    fireEvent.changeText(screen.getByLabelText(i18n.t('auth:update.newPasswordLabel')), a)
    fireEvent.changeText(screen.getByLabelText(i18n.t('auth:update.confirmLabel')), b)
  }

  it('holds a mismatch back', async () => {
    wrap(<ChangePasswordModal open onClose={jest.fn()} />)
    fill(GOOD, 'other')
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('auth:update.updatePassword'))) })
    expect(screen.getByText(i18n.t('auth:update.mismatch'))).toBeTruthy()
    expect(mockAuth.updateUser).not.toHaveBeenCalled()
  })

  it('writes the new password, says so and closes', async () => {
    const onClose = jest.fn()
    wrap(<ChangePasswordModal open onClose={onClose} />)
    fill(GOOD, GOOD)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('auth:update.updatePassword'))) })
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: GOOD })
    expect(onClose).toHaveBeenCalled()
    expect(toastSnapshot().message).toBe(i18n.t('auth:update.doneTitle'))
  })

  it('shows Supabase\'s answer in words when the write is refused', async () => {
    mockAuth.updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    const onClose = jest.fn()
    wrap(<ChangePasswordModal open onClose={onClose} />)
    fill(GOOD, GOOD)
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('auth:update.updatePassword'))) })
    expect(screen.getByText(i18n.t('auth:errors.samePassword'))).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

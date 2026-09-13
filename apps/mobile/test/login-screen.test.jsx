/* ════════════════════════════════════════════════════════════════
   THE LOGIN SCREEN — the first thing anyone sees.
   ════════════════════════════════════════════════════════════════
   Two things were wrong here, and both only show on a device:

     · the email and password placeholders were English string literals
       in an app translated into four languages, while
       auth:emailPlaceholder and auth:passwordPlaceholder sat in every
       locale with nothing asking for them;
     · the show/hide password label was absolutely positioned inside an
       unstyled Pressable, so the Pressable had no height and Android
       delivered almost none of the touches aimed at the words.

   What a refactor would quietly undo: the placeholders going back to a
   literal, the toggle's box going back to wrapping only its text, and
   the password field losing the autocomplete hints a password manager
   needs in order to offer anything at all.

   i18n resolves to Hebrew under test, so the assertions are Hebrew.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
/* The Google button pulls in react-native-svg for its logo, which this
   screen's own contract has nothing to do with. */
jest.mock('../src/components/GoogleButton', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/lib/googleSignIn', () => ({ signInWithGoogle: jest.fn() }))
jest.mock('../src/lib/legal', () => ({ buildConsent: jest.fn(() => ({})) }))
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signUp: jest.fn(async () => ({ error: null })),
      resetPasswordForEmail: jest.fn(async () => ({ error: null })),
    },
  },
}))

// eslint-disable-next-line import/first
import LoginScreen from '../src/screens/LoginScreen'

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderLogin = () => render(<SafeAreaProvider initialMetrics={METRICS}><LoginScreen /></SafeAreaProvider>)

describe('login screen', () => {
  it('asks for the email and password in the app language, not in English', () => {
    renderLogin()

    expect(screen.getByPlaceholderText('כתובת אימייל')).toBeTruthy()
    expect(screen.getByPlaceholderText('סיסמה')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Email')).toBeNull()
    expect(screen.queryByPlaceholderText('Password')).toBeNull()
  })

  it('tells a password manager which password this is', () => {
    renderLogin()
    const pw = screen.getByPlaceholderText('סיסמה')

    expect(pw.props.autoComplete).toBe('current-password')
    expect(pw.props.textContentType).toBe('password')
  })

  it('shows and hides the password from the toggle', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('סיסמה').props.secureTextEntry).toBe(true)

    act(() => { fireEvent.press(screen.getByLabelText('הצג סיסמה')) })

    expect(screen.getByPlaceholderText('סיסמה').props.secureTextEntry).toBe(false)
    expect(screen.getByLabelText('הסתר סיסמה')).toBeTruthy()
  })

  /* The geometry fix. The toggle's OWN box must span the field top to
     bottom — if the absolute positioning moves back onto the inner text,
     the pressable shrinks to nothing and on Android most of the visible
     words stop taking the touch. */
  it('positions the toggle box itself, spanning the field', () => {
    renderLogin()
    const style = StyleSheet.flatten(screen.getByLabelText('הצג סיסמה').props.style)

    expect(style.position).toBe('absolute')
    expect(style.top).toBe(0)
    expect(style.bottom).toBe(0)
  })
})

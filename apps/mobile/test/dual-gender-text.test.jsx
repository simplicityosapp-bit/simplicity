/* ════════════════════════════════════════════════════════════════
   THE APP'S TEXT — Alef on the phone, and Hebrew that is never a box.
   ════════════════════════════════════════════════════════════════
   Two things every piece of text needs, both handled by components/Text,
   which every screen imports in place of React Native's own:

     · the Alef typeface. It used to be applied by patching Text.render,
       which React Native 0.86's function-component Text does not have —
       so on a phone it never ran. This file is rendered through jest-expo,
       i.e. that same React Native, which is exactly where the old patch
       left fontFamily undefined.
     · dual-gender Hebrew. A merge glyph on an unassigned codepoint needs a
       font this app does not load, so it is shown in the readable slash
       form. Only the Help screen used to do that; the status pill on every
       active client card read "פעיל" plus a box.

   The deliberate exception: an input's placeholder is converted, but a
   typed or stored VALUE is not — rewriting it would save "פעיל/ה" over a
   stored "פעיל׌" the moment a status was edited, and break the comparison
   mgStrip() exists to make.

   Glyphs are built from codepoints so no editor along the way can
   quietly normalise them away.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { Text, TextInput } from '../src/components/Text'

const HE = String.fromCharCode(0x05CC) //  optional ה
const YOD = String.fromCharCode(0x05CA) // optional י
const PLU = String.fromCharCode(0x05C9) // plural ם/ת

describe('app Text: the typeface', () => {
  it('sets Alef on ordinary text', () => {
    render(<Text testID="t">שלום</Text>)
    expect(StyleSheet.flatten(screen.getByTestId('t').props.style).fontFamily).toBe('Alef')
  })

  it('uses the bold face for bold text, without bolding it twice', () => {
    render(<Text testID="b" style={{ fontWeight: '700' }}>שלום</Text>)
    const style = StyleSheet.flatten(screen.getByTestId('b').props.style)
    expect(style.fontFamily).toBe('Alef-Bold')
    expect(style.fontWeight).toBe('normal')
  })

  it('lets a component that names its own font keep it', () => {
    render(<Text testID="m" style={{ fontFamily: 'monospace' }}>x</Text>)
    expect(StyleSheet.flatten(screen.getByTestId('m').props.style).fontFamily).toBe('monospace')
  })

  it('sets Alef on inputs too', () => {
    render(<TextInput testID="i" />)
    expect(StyleSheet.flatten(screen.getByTestId('i').props.style).fontFamily).toBe('Alef')
  })
})

describe('app Text: dual-gender Hebrew', () => {
  it('renders a merge glyph in the readable slash form', () => {
    render(<Text>{`פעיל${HE}`}</Text>)
    expect(screen.getByText('פעיל/ה')).toBeTruthy()
    expect(screen.queryByText(`פעיל${HE}`)).toBeNull()
  })

  it('handles the plural pair as one ending, not two', () => {
    render(<Text>{`לקוחות פעיל${YOD}${PLU}`}</Text>)
    // "פעילים/ות", not "פעיל/י/ות"
    expect(screen.getByText('לקוחות פעילים/ות')).toBeTruthy()
  })

  it('converts inside mixed children and leaves the rest alone', () => {
    render(<Text>{3}{' '}{`לקוח${HE} חדש${HE}`}</Text>)
    expect(screen.getByText('3 לקוח/ה חדש/ה')).toBeTruthy()
  })

  it('leaves ordinary text untouched', () => {
    render(<Text>שלום, מה נשמע?</Text>)
    expect(screen.getByText('שלום, מה נשמע?')).toBeTruthy()
  })

  it('converts an input placeholder', () => {
    render(<TextInput placeholder={`שם הלקוח${HE}`} />)
    expect(screen.getByPlaceholderText('שם הלקוח/ה')).toBeTruthy()
  })

  /* The deliberate exception. A stored status name keeps its glyph while
     being edited, so saving it cannot silently rewrite the data. */
  it('does NOT rewrite a typed or stored value', () => {
    render(<TextInput value={`פעיל${HE}`} onChangeText={() => {}} />)
    expect(screen.getByDisplayValue(`פעיל${HE}`)).toBeTruthy()
  })
})

describe('app TextInput: refs', () => {
  /* EditClientModal focuses an input through a ref it hands the child. The
     wrapper must pass that ref through to the real input. */
  it('passes a ref through to the real input', () => {
    const ref = React.createRef()
    render(<TextInput ref={ref} />)
    expect(ref.current).toBeTruthy()
    expect(typeof ref.current.focus).toBe('function')
  })
})

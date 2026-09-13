/* ════════════════════════════════════════════════════════════════
   THE APP'S TEXT — Alef on the phone, and dual-gender Hebrew.
   ════════════════════════════════════════════════════════════════
   components/Text, which every screen imports in place of React Native's
   own, owns two things:

     · the Alef typeface. It used to be applied by patching Text.render,
       which React Native 0.86's function-component Text does not have —
       so on a phone it never ran. This file renders through jest-expo,
       i.e. that same React Native, which is exactly where the old patch
       left fontFamily undefined.

     · dual-gender Hebrew. A merge glyph sits on an unassigned codepoint.
       The regular face now draws it (lib/fonts), so the glyph stays in the
       text — but a screen reader cannot pronounce it, so the Text carries
       the readable slash form as its label, the way web's <MG> does. Bold
       text with a glyph stays on the regular face, because Alef-Bold has
       none. And if the merge font is ever switched off, the readable form
       becomes the text itself: that revert path is tested too, because the
       day it is needed is the day a phone will not start.

   An input never rewrites a typed or stored VALUE: that would save
   "פעיל/ה" over a stored "פעיל׌" and break what mgStrip() compares.

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
const flat = (el) => StyleSheet.flatten(el.props.style)

describe('app Text: the typeface', () => {
  it('sets Alef on ordinary text', () => {
    render(<Text testID="t">שלום</Text>)
    expect(flat(screen.getByTestId('t')).fontFamily).toBe('Alef')
  })

  it('uses the bold face for bold text, without bolding it twice', () => {
    render(<Text testID="b" style={{ fontWeight: '700' }}>שלום</Text>)
    const style = flat(screen.getByTestId('b'))
    expect(style.fontFamily).toBe('Alef-Bold')
    expect(style.fontWeight).toBe('normal')
  })

  it('lets a component that names its own font keep it', () => {
    render(<Text testID="m" style={{ fontFamily: 'monospace' }}>x</Text>)
    expect(flat(screen.getByTestId('m')).fontFamily).toBe('monospace')
  })

  it('sets Alef on inputs too', () => {
    render(<TextInput testID="i" />)
    expect(flat(screen.getByTestId('i')).fontFamily).toBe('Alef')
  })
})

describe('app Text: dual-gender Hebrew, merge font loaded', () => {
  it('keeps the glyph in the text and gives it a readable label', () => {
    render(<Text testID="g">{`פעיל${HE}`}</Text>)
    const el = screen.getByTestId('g')
    expect(screen.getByText(`פעיל${HE}`)).toBeTruthy()
    expect(el.props.accessibilityLabel).toBe('פעיל/ה')
  })

  it('reads the plural pair as one ending, not two', () => {
    render(<Text testID="p">{`לקוחות פעיל${YOD}${PLU}`}</Text>)
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('לקוחות פעילים/ות')
  })

  it('labels mixed plain children as one readable string', () => {
    render(<Text testID="x">{3}{' '}{`לקוח${HE} חדש${HE}`}</Text>)
    expect(screen.getByTestId('x').props.accessibilityLabel).toBe('3 לקוח/ה חדש/ה')
  })

  it('adds no label to text without a glyph', () => {
    render(<Text testID="n">שלום</Text>)
    expect(screen.getByTestId('n').props.accessibilityLabel).toBeUndefined()
  })

  it('makes a caller-supplied label readable too', () => {
    render(<Text testID="c" accessibilityLabel={`סטטוס פעיל${HE}`}>x</Text>)
    expect(screen.getByTestId('c').props.accessibilityLabel).toBe('סטטוס פעיל/ה')
  })

  it('keeps bold text with a glyph on the face that can draw it', () => {
    render(<Text testID="bg" style={{ fontWeight: '700' }}>{`פעיל${HE}`}</Text>)
    const style = flat(screen.getByTestId('bg'))
    expect(style.fontFamily).toBe('Alef')
    expect(style.fontWeight).toBe('700')
  })

  it('leaves an input placeholder with its glyph', () => {
    render(<TextInput placeholder={`שם הלקוח${HE}`} />)
    expect(screen.getByPlaceholderText(`שם הלקוח${HE}`)).toBeTruthy()
  })

  it('never rewrites a typed or stored value', () => {
    render(<TextInput value={`פעיל${HE}`} onChangeText={() => {}} />)
    expect(screen.getByDisplayValue(`פעיל${HE}`)).toBeTruthy()
  })
})

/* The revert path: if a device build ever closes on launch and the merge
   font has to come out, one flag in lib/fonts must be enough. */
describe('app Text: dual-gender Hebrew, merge font switched off', () => {
  let T
  let TI
  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('../src/lib/fonts', () => ({ MERGE_FONT_LOADED: false, fontAssets: {} }))
      // eslint-disable-next-line global-require
      const mod = require('../src/components/Text')
      T = mod.Text
      TI = mod.TextInput
    })
  })

  it('shows the readable form as the text itself', () => {
    render(<T>{`פעיל${HE}`}</T>)
    expect(screen.getByText('פעיל/ה')).toBeTruthy()
  })

  it('puts bold text back on the bold face, since nothing needs the glyph face', () => {
    render(<T testID="b" style={{ fontWeight: '700' }}>{`פעיל${HE}`}</T>)
    expect(flat(screen.getByTestId('b')).fontFamily).toBe('Alef-Bold')
  })

  it('converts an input placeholder', () => {
    render(<TI placeholder={`שם הלקוח${HE}`} />)
    expect(screen.getByPlaceholderText('שם הלקוח/ה')).toBeTruthy()
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

/* ════════════════════════════════════════════════════════════════
   THE TAP THAT ANSWERS — feedback for 364 controls, from one file.
   ════════════════════════════════════════════════════════════════
   RN's Pressable has no built-in feedback, and none of this app's 364
   of them supplied any: between the touch and whatever came next the
   screen sat perfectly still, which is what a dead button looks like.

   The shim is a drop-in with the same name, so what has to hold is that
   it stays a drop-in. Three ways that breaks, all of them silent:

     · the dim replaces a caller's own style instead of composing with it
       — the control keeps working and quietly loses its appearance;
     · a caller that already hands `style` a function stops being called;
     · props stop passing through, so an accessibility role or a testID
       an assertion elsewhere depends on simply is not there.

   Rendered through jest-expo, so this is the real React Native
   Pressable underneath rather than the web one.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Pressable, composePressedStyle, defaultRipple, rippleColor } from '../src/components/Pressable'

const flatten = (style) => {
  if (Array.isArray(style)) return Object.assign({}, ...style.flat(Infinity).filter(Boolean))
  return style || {}
}

const CARD = { backgroundColor: 'papayawhip', borderRadius: 12 }

describe('Pressable feedback', () => {
  /* The composition, tested where it can actually be reached. RN resolves
     the style function inside Pressable, so a rendered tree only ever shows
     the result — and RNTL cannot drive the pressed state through the
     responder system that produces it. */
  const REST = { pressed: false }
  const DOWN = { pressed: true }

  it('leaves the caller style untouched at rest', () => {
    expect(flatten(composePressedStyle(CARD, REST)).backgroundColor).toBe('papayawhip')
    expect(flatten(composePressedStyle(CARD, REST)).opacity).toBeUndefined()
  })

  it('dims while pressed and KEEPS the caller style', () => {
    const s = flatten(composePressedStyle(CARD, DOWN))
    // Composed, not replaced — replacing is the failure that looks like nothing.
    expect(s.backgroundColor).toBe('papayawhip')
    expect(s.borderRadius).toBe(12)
    expect(s.opacity).toBeLessThan(1)
  })

  it('composes an array style the same way', () => {
    const s = flatten(composePressedStyle([CARD, { margin: 4 }], DOWN))
    expect(s.margin).toBe(4)
    expect(s.opacity).toBeLessThan(1)
  })

  it('still calls a caller that hands style a function, and composes its result', () => {
    const style = jest.fn(({ pressed }) => [CARD, pressed && { borderWidth: 2 }])
    const s = flatten(composePressedStyle(style, DOWN))

    expect(style).toHaveBeenCalledWith(DOWN)
    expect(s.borderWidth).toBe(2)      // the caller's own pressed styling survives
    expect(s.backgroundColor).toBe('papayawhip')
    expect(s.opacity).toBeLessThan(1)  // and the dim is added, not swapped in
  })

  /* The disabled half. Fifty-two controls took a `disabled` prop and changed
     nothing about how they looked when it was set — mostly a `busy` flag
     during a save, so the control went dead at the moment the user was
     waiting on it and gave no sign. */
  it('dims while disabled', () => {
    const s = flatten(composePressedStyle(CARD, REST, true))
    expect(s.backgroundColor).toBe('papayawhip')
    expect(s.opacity).toBeLessThan(1)
  })

  it('shows the disabled state, not the pressed one, if both are somehow set', () => {
    const off = flatten(composePressedStyle(CARD, DOWN, true))
    const down = flatten(composePressedStyle(CARD, DOWN, false))
    expect(off.opacity).not.toBe(down.opacity)
  })

  /* Thirty-five call sites already dim themselves, most of them to 0.45.
     Style flattening resolves the last opacity rather than multiplying, so
     they must not end up dimmed twice. */
  it('does not compound with a call site that already dims itself', () => {
    const own = { opacity: 0.4 }
    const s = flatten(composePressedStyle([CARD, own], REST, true))
    expect(s.opacity).toBeGreaterThan(0.3)
    expect(s.opacity).toBeLessThan(1)
  })
  /* A 'disabled' with no handler behind it is not a greyed-out control, it is
     content: the calendar marks an agenda row with no detail view to open, and
     settings marks a chip in a read-only list. Dimming those dims the thing the
     user came to read — which a blanket rule did, until this. */
  it('does not dim a disabled thing that was never pressable', () => {
    const s = flatten(composePressedStyle(CARD, REST, true, false))
    expect(s.backgroundColor).toBe('papayawhip')
    expect(s.opacity).toBeUndefined()
  })

  it('still dims a real button that is disabled', () => {
    const s = flatten(composePressedStyle(CARD, REST, true, true))
    expect(s.opacity).toBeLessThan(1)
  })
  /* Android ripples instead of dimming. The ripple is clipped to a view's
     bounds, not its corners, so a rounded control must gain overflow:hidden
     there — or the ripple paints a square through a rounded card. The preview
     runs react-native-web, which has no ripple at all, so this is the only
     place that composition is checked before a device. */
  describe('on Android', () => {
    const CARD_SQUARE = { backgroundColor: 'papayawhip' }
    const android = (style, state, disabled, pressable = true) =>
      flatten(composePressedStyle(style, state, disabled, pressable, true))

    it('clips a rounded control so the ripple follows its corners', () => {
      expect(android(CARD, REST).overflow).toBe('hidden')
      expect(android([{ borderTopStartRadius: 8 }], REST).overflow).toBe('hidden')
    })

    it('leaves a square control, and one that set its own overflow, alone', () => {
      expect(android(CARD_SQUARE, REST).overflow).toBeUndefined()
      expect(android([CARD, { overflow: 'visible' }], REST).overflow).toBe('visible')
    })

    it('does not clip a wrapper that is not pressable', () => {
      expect(android(CARD, REST, false, false).overflow).toBeUndefined()
    })

    it('does not also dim on press — the ripple is the feedback', () => {
      const s = android(CARD, DOWN)
      expect(s.opacity).toBeUndefined()
      expect(s.backgroundColor).toBe('papayawhip')
    })

    it('still dims a disabled button', () => {
      expect(android(CARD, REST, true).opacity).toBeLessThan(1)
    })

    it('gives a pressable control a ripple, and nothing else one', () => {
      const fn = () => {}
      expect(defaultRipple(fn, false, true)).toEqual({ color: rippleColor(), foreground: true })
      expect(defaultRipple(undefined, false, true)).toBeUndefined()
      expect(defaultRipple(fn, true, true)).toBeUndefined()
      expect(defaultRipple(fn, false, false)).toBeUndefined()
    })

    it('uses a ripple colour that shows on each theme', () => {
      expect(rippleColor('dark')).not.toBe(rippleColor('light'))
    })
  })

  it('passes presses and props straight through', () => {
    const onPress = jest.fn()
    render(
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="שמירה">
        <Text>save</Text>
      </Pressable>,
    )

    const el = screen.getByLabelText('שמירה')
    expect(el.props.accessibilityRole ?? el.props.role).toBeTruthy()

    fireEvent.press(el)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire or dim while disabled', () => {
    const onPress = jest.fn()
    render(<Pressable testID="t" style={CARD} disabled onPress={onPress}><Text>save</Text></Pressable>)
    const el = screen.getByTestId('t')

    fireEvent.press(el)
    expect(onPress).not.toHaveBeenCalled()
  })
})

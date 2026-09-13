import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native'
import { hasMG, mgToReadable } from '@simplicity/core'

/* Text and TextInput, as this app means them.
   ────────────────────────────────────────────────────────────────
   Every file that used to pull Text or TextInput out of 'react-native'
   pulls them out of here instead — the same shape as components/Pressable —
   so each piece of text in the app gets two things without its call site
   being touched.

   1 · The Alef typeface.
   This used to be a monkey-patch in lib/fonts that wrapped Text.render and
   TextInput.render. That only works on a forwardRef component, which is what
   react-native-web's Text is — and what React Native 0.86's is NOT: its Text
   and TextInput are plain function components (Flow `component` syntax, ref as
   a prop), so there is no .render to wrap and the patch returned early without
   a word. The app has been on 0.86 since its first screen, five days before the
   patch was written, so on a phone it has never run: Android and iOS have shown
   the system font on every screen, while every preview anyone checked a layout
   in ran on Alef. The preview is where the designs were tuned, so this brings
   the device to the look everything was built against, not the other way round.

   2 · Dual-gender Hebrew, readable.
   Hebrew copy writes an unknown-gender noun once with a merge glyph on an
   unassigned codepoint — "פעיל׌" reads as פעיל and פעילה, "פעיל׊׉" as פעילים and
   פעילות. Web draws them with a merge font. This app does not load that font
   (see lib/fonts), so a phone has nothing to draw them with and shows a box;
   core's note says mobile renders mgToReadable() ("פעיל/ה", "פעילים/ות")
   instead. Only the Help screen did. The status pill on every active client
   card did not, nor the status tabs, the project header, the reports metric —
   nor the statuses users create, since the default one is stored as "פעיל׌".

   TextInput: the PLACEHOLDER is converted, a typed or stored VALUE is not.
   Rewriting a controlled value would save "פעיל/ה" over a stored "פעיל׌" the
   moment a status name was edited, and break the comparison mgStrip() exists
   to make — an import would then create a second "פעיל" beside the first.

   Refs: React 19 hands `ref` to a function component as an ordinary prop, so
   spreading props passes it through — TextInput.focus() keeps working — on
   native (a function component that takes ref) and on web (forwardRef) alike. */

const isBold = (w) => w === 'bold' || w === '600' || w === '700' || w === 600 || w === 700

/* Alef first, so a component's own fontFamily still wins. Weights of 600+ use
   the real bold face with fontWeight reset, so the platform does not bold an
   already-bold face a second time. */
export function fontStyle(style) {
  const flat = StyleSheet.flatten(style) || {}
  return isBold(flat.fontWeight)
    ? [{ fontFamily: 'Alef-Bold' }, style, { fontWeight: 'normal' }]
    : [{ fontFamily: 'Alef' }, style]
}

export function readableChildren(children) {
  if (typeof children === 'string') return hasMG(children) ? mgToReadable(children) : children
  if (Array.isArray(children)) {
    let changed = false
    const next = children.map((c) => {
      if (typeof c === 'string' && hasMG(c)) { changed = true; return mgToReadable(c) }
      return c
    })
    return changed ? next : children
  }
  return children
}

export function Text({ style, children, ...rest }) {
  return <RNText {...rest} style={fontStyle(style)}>{readableChildren(children)}</RNText>
}
Text.displayName = 'Text'

export function TextInput({ style, placeholder, ...rest }) {
  return (
    <RNTextInput
      {...rest}
      style={fontStyle(style)}
      placeholder={hasMG(placeholder) ? mgToReadable(placeholder) : placeholder}
    />
  )
}
TextInput.displayName = 'TextInput'

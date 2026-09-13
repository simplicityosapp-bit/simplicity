import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native'
import { hasMG, mgToReadable } from '@simplicity/core'
import { MERGE_FONT_LOADED } from '../lib/fonts'

/* Text and TextInput, as this app means them.
   ────────────────────────────────────────────────────────────────
   Every file that used to pull Text or TextInput out of 'react-native'
   pulls them out of here instead — the same shape as components/Pressable —
   so each piece of text in the app gets its handling without its call site
   being touched.

   1 · The Alef typeface.
   This used to be a monkey-patch in lib/fonts that wrapped Text.render and
   TextInput.render. That only works on a forwardRef component, which is what
   react-native-web's Text is — and what React Native 0.86's is NOT: its Text
   and TextInput are plain function components (Flow `component` syntax, ref as
   a prop), so there is no .render to wrap and the patch returned early without
   a word. The app has been on 0.86 since its first screen, five days before the
   patch was written, so on a phone it has never run: Android and iOS showed
   the system font on every screen, while every preview anyone checked a layout
   in ran on Alef.

   2 · Dual-gender Hebrew.
   Hebrew copy writes an unknown-gender noun once with a merge glyph on an
   unassigned codepoint — "פעיל׌" reads as פעיל and פעילה, "פעיל׊׉" as פעילים and
   פעילות. The regular face now carries those glyphs (lib/fonts), so they are
   drawn as they are on web. Two things still need doing here:

     · a screen reader cannot pronounce an unassigned codepoint, so a Text that
       carries one gets the readable slash form as its accessibilityLabel —
       what web's <MG> puts in its sr-only span;
     · Alef-Bold has no merge glyphs, so a BOLD string that carries one stays on
       the regular face and the platform synthesises the bold.

   If lib/fonts ever turns MERGE_FONT_LOADED off again, there is nothing to draw
   the glyph with, and the text itself is shown in the readable form instead.

   TextInput never rewrites a typed or stored VALUE. Doing so would save
   "פעיל/ה" over a stored "פעיל׌" the moment a status name was edited, and break
   the comparison mgStrip() exists to make.

   Refs: React 19 hands `ref` to a function component as an ordinary prop, so
   spreading props passes it through — TextInput.focus() keeps working — on
   native (a function component that takes ref) and on web (forwardRef) alike. */

const isBold = (w) => w === 'bold' || w === '600' || w === '700' || w === 600 || w === 700

const isPlain = (c) => typeof c === 'string' || typeof c === 'number'

function carriesGlyph(children) {
  if (typeof children === 'string') return hasMG(children)
  if (Array.isArray(children)) return children.some((c) => typeof c === 'string' && hasMG(c))
  return false
}

/* Alef first, so a component's own fontFamily still wins. Weights of 600+ use
   the real bold face with fontWeight reset, so the platform does not bold an
   already-bold face a second time — unless the text carries a merge glyph the
   bold face cannot draw. */
export function fontStyle(style, glyph = false) {
  const flat = StyleSheet.flatten(style) || {}
  if (isBold(flat.fontWeight) && !(glyph && MERGE_FONT_LOADED)) {
    return [{ fontFamily: 'Alef-Bold' }, style, { fontWeight: 'normal' }]
  }
  return [{ fontFamily: 'Alef' }, style]
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

/* The readable label for a Text whose content is plain text. When a Text holds
   nested elements, each nested Text labels itself instead. */
function readableLabel(children) {
  if (typeof children === 'string') return mgToReadable(children)
  if (Array.isArray(children) && children.every((c) => c == null || c === false || isPlain(c))) {
    return mgToReadable(children.filter(isPlain).join(''))
  }
  return undefined
}

export function Text({ style, children, accessibilityLabel, ...rest }) {
  const glyph = carriesGlyph(children)
  const label = accessibilityLabel != null
    ? mgToReadable(accessibilityLabel)
    : (glyph && MERGE_FONT_LOADED ? readableLabel(children) : undefined)
  return (
    <RNText {...rest} accessibilityLabel={label} style={fontStyle(style, glyph)}>
      {MERGE_FONT_LOADED ? children : readableChildren(children)}
    </RNText>
  )
}
Text.displayName = 'Text'

export function TextInput({ style, placeholder, ...rest }) {
  const glyph = hasMG(placeholder) || hasMG(rest.value) || hasMG(rest.defaultValue)
  return (
    <RNTextInput
      {...rest}
      style={fontStyle(style, glyph)}
      placeholder={!MERGE_FONT_LOADED && hasMG(placeholder) ? mgToReadable(placeholder) : placeholder}
    />
  )
}
TextInput.displayName = 'TextInput'

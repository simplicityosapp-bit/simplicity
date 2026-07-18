import { CATEGORY_SWATCHES } from '../../lib/palette'
import { Box, Txt } from '../../components/ui'

/* Author avatar. avatar_url is always null today (no photo upload exists
   anywhere in the app), so in practice this is always the initial fallback —
   but the <img> branch is here because the column exists and the day it fills
   in, nothing should have to change.

   Nothing in this repo rendered an initial-on-a-tint before (.sp-avatar is a
   plain <img> for site-page testimonials), so this is new. It is assembled
   from two things that DO exist rather than invented whole:

   • the hash — `h = (h * 31 + charCodeAt(i)) | 0`, the same string→int the
     daily quote picker uses (useQuote.js, QuoteWidget.jsx) to choose
     deterministically from a list. Same job here: a name must always get the
     same colour, on every device, with no stored column.
   • the colours — CATEGORY_SWATCHES from lib/palette. Its own comment says
     it is a data-viz palette for distinguishing categories, not chrome, which
     is exactly this: telling members apart at a glance. Reusing it also means
     avatars can never drift from the app's hues.

   Math.abs() on the hash, because | 0 yields a signed 32-bit int and a
   negative index would silently return undefined for a whole class of names. */
function swatchFor(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return CATEGORY_SWATCHES[Math.abs(h) % CATEGORY_SWATCHES.length]
}

/* Readable ink for the initial, chosen per-swatch. Cream is NOT safe on this
   palette: it fails WCAG AA (4.5:1 for a 14px-bold glyph) on 6 of the 8 hues —
   worst on sage (2.5:1) and amber (2.2:1) — and --cream has no dark-theme
   override, so it fails identically in both themes. Pick, per swatch, whichever
   ink contrasts BETTER — and the inks are pure black/white, not the softer
   espresso/cream: four mid-tone hues (teal, cyan, clay, green) land at 4.2-4.4
   against espresso/cream, just shy of AA, and only the extremes clear all
   eight (worst is clay at 4.9 on black, which near-black would miss). The
   #000/#fff vs espresso/cream difference is visually imperceptible on a 14px
   glyph; the contrast guarantee is not. */
const relLum = (hex) => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const INK_DARK = '#000000'
const INK_LIGHT = '#FFFFFF'
const inkFor = (swatch) => {
  const l = relLum(swatch)
  return contrast(l, relLum(INK_DARK)) >= contrast(l, relLum(INK_LIGHT)) ? INK_DARK : INK_LIGHT
}

/* [...str][0] rather than str[0]: a name starting with an emoji or any
   astral-plane character would otherwise render half a surrogate pair. */
const initialOf = (name) => {
  const trimmed = (name ?? '').trim()
  return trimmed ? [...trimmed][0].toUpperCase() : '?'
}

export default function CommunityAvatar({ name, url, size = 36 }) {
  const label = name?.trim() || ''
  const style = { width: size, height: size }

  if (url) {
    return <img className="cmt-avatar" src={url} alt="" aria-hidden="true" loading="lazy" style={style} />
  }
  const swatch = swatchFor(label || '?')
  return (
    <Box
      className="cmt-avatar cmt-avatar-initial"
      style={{ ...style, background: swatch }}
      aria-hidden="true"
    >
      <Txt className="cmt-avatar-letter" style={{ color: inkFor(swatch) }}>{initialOf(label)}</Txt>
    </Box>
  )
}

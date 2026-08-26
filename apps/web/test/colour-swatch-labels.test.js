/* ════════════════════════════════════════════════════════════════
   A COLOUR PICKER MUST NOT ANNOUNCE ITS HEX.
   ════════════════════════════════════════════════════════════════
   Every picker in the app rendered `aria-label={c}`, so a screen reader
   read out "number 0 e 9 8 8 8" once per swatch — eight buttons, eight
   strings of digits, no way to tell them apart.

   Two swatch lists serve these controls (CATEGORY_SWATCHES for
   project/group/goal, CATEGORY_COLORS for lead sources), so the lookup is
   keyed by HEX rather than by array index: the order of either list is a
   layout decision, and a reorder must not silently rename every colour.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { CATEGORY_SWATCHES, swatchKey } from '../src/lib/palette'
import { CATEGORY_COLORS } from '../src/lib/api/categories'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

const LOCALES = ['he', 'en', 'es', 'fr']
const modalsDir = new URL('../src/modals/', import.meta.url)

describe('every swatch has a name', () => {
  it('covers both palettes', () => {
    for (const hex of [...CATEGORY_SWATCHES, ...CATEGORY_COLORS]) {
      expect(swatchKey(hex), `no key for ${hex}`).toBeTruthy()
    }
  })

  it('is keyed by hex, not by position', () => {
    /* Reversing the list must not change what any colour is called. */
    const before = CATEGORY_SWATCHES.map(swatchKey)
    const after = [...CATEGORY_SWATCHES].reverse().map(swatchKey)
    expect(after).toEqual([...before].reverse())
  })

  it('is case-insensitive about the hex', () => {
    const hex = CATEGORY_SWATCHES[4]
    expect(swatchKey(hex.toUpperCase())).toBe(swatchKey(hex))
    expect(swatchKey(hex.toLowerCase())).toBe(swatchKey(hex))
  })

  it('returns null for an unknown colour rather than guessing', () => {
    /* Callers fall back to the hex — an odd label beats a wrong one. */
    expect(swatchKey('#123456')).toBeNull()
    expect(swatchKey(undefined)).toBeNull()
  })
})

describe('no picker announces a hex any more', () => {
  const pickers = readdirSync(modalsDir)
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => [f, readFileSync(new URL(f, modalsDir), 'utf8')])
    .filter(([, src]) => /className={`m-color/.test(src))

  it('found the pickers to check', () => {
    /* If this drops to zero the suite below passes vacuously. */
    expect(pickers.length).toBeGreaterThanOrEqual(8)
  })

  pickers.forEach(([file, src]) => {
    it(`${file} labels its swatches by name`, () => {
      expect(src, `${file} still uses the raw hex`).not.toMatch(/aria-label=\{c\}/)
      expect(src).toMatch(/aria-label=\{tc\(`colorNames\.\$\{swatchKey\(c\)\}`, \{ defaultValue: c \}\)\}/)
      expect(src).toMatch(/const \{ t: tc \} = useT\('common'\)/)
      expect(src).toMatch(/swatchKey/)
    })
  })
})

describe('the names resolve in all four languages', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'he' })
    await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
  })

  it('every swatch of both palettes has a translation', () => {
    for (const lng of LOCALES) {
      const t = i18n.getFixedT(lng, 'common')
      for (const hex of [...CATEGORY_SWATCHES, ...CATEGORY_COLORS]) {
        const key = `colorNames.${swatchKey(hex)}`
        const out = t(key)
        expect(out, `${lng}:${key}`).not.toBe(key)
        expect(out, `${lng}:${key} looks like a hex`).not.toMatch(/^#/)
      }
    }
  })

  it('lives in `common` only — not duplicated per namespace', () => {
    /* It was briefly copied into modalsData and modalsClient. `common` is the
       default namespace and always loaded, so one copy reaches every picker. */
    for (const lng of LOCALES) {
      for (const ns of ['modalsData', 'modalsClient']) {
        const j = JSON.parse(readFileSync(
          new URL(`../../../packages/core/src/i18n/locales/${lng}/${ns}.json`, import.meta.url), 'utf8',
        ))
        expect(j.common?.colorNames, `${lng}/${ns} still holds a copy`).toBeUndefined()
      }
    }
  })
})

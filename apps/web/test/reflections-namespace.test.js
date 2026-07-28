/* ════════════════════════════════════════════════════════════════
   REFLECTIONS — the namespace has to survive being imported BEFORE
   i18next is initialised.
   ════════════════════════════════════════════════════════════════
   'reflections' is a dynamic namespace: it is not in initI18n's static
   resources, it self-registers with addResourceBundle when its module is
   imported. That only ever worked in one of the two orders it actually
   gets loaded in.

   In dev, main.jsx imports ./i18n/init before <App/>, so init runs first
   and the registration lands. In a BUILT app it is the other way round:
   the bundler puts the core barrel (→ domain/moon → i18n/reflections) in
   a chunk the entry chunk imports, and ESM evaluates every imported chunk
   before the importer's own body — so the registration ran before
   initI18n. i18next installs addResourceBundle/hasResourceBundle on the
   instance during init(), so pre-init the old guard saw `undefined`,
   skipped, and never retried. Result: production rendered raw keys
   ("moon.behind") on מבט על, on the insights mirror, and in the profile
   health checklist, while every dev machine looked correct.

   THE IMPORT ORDER BELOW IS THE TEST. The core barrel is imported first,
   initI18n only runs inside the test body — the production order.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { moonReflection, mirrorReflections, indexAnswers } from '@simplicity/core'
import { initI18n } from '@simplicity/core/i18n'

beforeAll(() => {
  initI18n({ lng: 'he' })
})

/* A raw key leaks as its own dotted path — "moon.behind", "mirror.stable".
   Any resolved Hebrew string contains none of that. */
const looksLikeARawKey = (s) => /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(s)

describe('reflections namespace — registered even when imported before init', () => {
  it('gives the מבט על ring a real sentence at every confidence band', () => {
    for (const confidence of [95, 70, 47, 12]) {
      const text = moonReflection(confidence)
      expect(looksLikeARawKey(text), `confidence ${confidence} → ${text}`).toBe(false)
    }
  })

  it('resolves the exact band the screenshot hit (47% → behind)', () => {
    expect(moonReflection(47)).toBe('יש פער, ועדיין יש זמן לסגור אותו.')
  })

  it('still resolves when a form of address is applied', () => {
    /* moon.behind has no _male/_female pair, so this also pins i18next's
       fallback from the gendered key to the base one. */
    expect(moonReflection(47, 'male')).toBe('יש פער, ועדיין יש זמן לסגור אותו.')
    expect(moonReflection(95, 'female')).toBe('את במסלול מצוין החודש.')
  })

  it('resolves the insights mirror reflections too', () => {
    /* Same namespace, same registration — a user with no answers yet gets
       the welcome line. */
    const out = mirrorReflections([], indexAnswers([]), new Date())
    expect(out.length).toBeGreaterThan(0)
    for (const r of out) expect(looksLikeARawKey(r.text), r.text).toBe(false)
  })
})

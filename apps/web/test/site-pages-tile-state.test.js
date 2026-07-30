/* ════════════════════════════════════════════════════════════════
   THE HUB TILES COUNT OUT LOUD — so they must count correctly.
   ════════════════════════════════════════════════════════════════
   /pages used to say the same fixed sentence under every tile whatever you
   had, so the counts are new copy — and new copy with a {{count}} in it is
   exactly where Hebrew breaks: "1 דפים" is the same bug finance-plurals.test
   was written for, one namespace over. Hebrew resolves one/two/many/other,
   and only "many"/"other" may show a bare numeral.

   The siteBuilder namespace is registered app-side (a side-effect import in
   screens/site-pages/siteBuilderI18n.js), not from @simplicity/core, so this
   pulls that module in to get the bundles.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@simplicity/core/i18n'

beforeAll(async () => {
  await initI18n({ lng: 'he' })
  await import('../src/screens/site-pages/siteBuilderI18n.js')
})

const t = (lng, key, count) => i18n.getFixedT(lng, 'siteBuilder')(key, { count })

describe('Hebrew never puts a bare numeral in front of a plural noun', () => {
  it('statePages', () => {
    expect(t('he', 'hub.statePages', 1)).toBe('דף אחד')
    expect(t('he', 'hub.statePages', 2)).toBe('שני דפים')
    expect(t('he', 'hub.statePages', 6)).toBe('6 דפים')
  })

  it('stateLive', () => {
    expect(t('he', 'hub.stateLive', 1)).toBe('אחד מפורסם')
    expect(t('he', 'hub.stateLive', 2)).toBe('שניים מפורסמים')
    expect(t('he', 'hub.stateLive', 5)).toBe('5 מפורסמים')
  })

  it('the empty state names no number at all', () => {
    expect(t('he', 'hub.stateEmpty')).toBe('אין עדיין דפים')
  })
})

describe('the other three languages agree with their own count', () => {
  it('singular is singular', () => {
    expect(t('en', 'hub.statePages', 1)).toBe('1 page')
    expect(t('es', 'hub.statePages', 1)).toBe('1 página')
    expect(t('fr', 'hub.statePages', 1)).toBe('1 page')
  })

  it('plural is plural', () => {
    expect(t('en', 'hub.statePages', 3)).toBe('3 pages')
    expect(t('es', 'hub.statePages', 3)).toBe('3 páginas')
    expect(t('fr', 'hub.statePages', 3)).toBe('3 pages')
  })

  it('every language answers for every new key', () => {
    for (const lng of ['he', 'en', 'es', 'fr']) {
      for (const key of ['hub.stateEmpty', 'hub.statePages', 'hub.stateLive']) {
        const out = t(lng, key, 3)
        expect(out, `${lng} ${key}`).toBeTruthy()
        expect(out, `${lng} ${key} fell through to the key`).not.toContain(key)
      }
    }
  })
})

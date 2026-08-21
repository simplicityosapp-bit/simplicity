/* ════════════════════════════════════════════════════════════════
   GOAL CARDS — the time-frame label is not Hebrew in English.
   ════════════════════════════════════════════════════════════════
   timeFrameLabel() lives in packages/core and returned display TEXT as
   hard-coded Hebrew literals — 'חודשי' / 'שבועי' / `עד <date>` / 'יעד'. Both
   the web GoalCard and the mobile one drop it straight into a card subtitle,
   so an English reader's card read "Monthly income · חודשי". Same defect the
   correlation engine had, in the sibling module.

   These pin the resolution across all four languages, and the deadline form
   in particular, because it composes a date into the sentence and is the one
   a caller would be tempted to rebuild by hand.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { initI18n, loadLanguage, setLanguage } from '@simplicity/core/i18n'
import { timeFrameLabel } from '@simplicity/core'

/* initI18n only bundles `he`; the other three are lazy chunks. */
beforeAll(async () => {
  await initI18n({ lng: 'he' })
  await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
})
afterEach(async () => { await setLanguage('he') })

const HEBREW = /[֐-׿]/

describe('timeFrameLabel follows the reading language', () => {
  it('resolves monthly and weekly in every language', async () => {
    const expected = {
      he: ['חודשי', 'שבועי'],
      en: ['Monthly', 'Weekly'],
      es: ['Mensual', 'Semanal'],
      fr: ['Mensuel', 'Hebdomadaire'],
    }
    for (const [lng, [monthly, weekly]] of Object.entries(expected)) {
      await setLanguage(lng)
      expect(timeFrameLabel({ time_frame: 'monthly' }), lng).toBe(monthly)
      expect(timeFrameLabel({ time_frame: 'weekly' }), lng).toBe(weekly)
    }
  })

  it('composes the deadline date into the sentence, translated', async () => {
    await setLanguage('en')
    const label = timeFrameLabel({ time_frame: 'deadline', target_date: '2026-11-19' })
    expect(label).toMatch(/^By /)
    expect(label).not.toMatch(HEBREW)
    /* The date itself must still be there — a translated wrapper around
       nothing would pass a "no Hebrew" check just as well. */
    expect(label.replace(/^By /, '').trim().length).toBeGreaterThan(0)
  })

  it('falls back to the bare deadline word when no date is set', async () => {
    await setLanguage('en')
    expect(timeFrameLabel({ time_frame: 'deadline', target_date: null })).toBe('Target')
  })

  it('emits no Hebrew at all for a non-Hebrew reader', async () => {
    /* The regression, stated directly. */
    for (const lng of ['en', 'es', 'fr']) {
      await setLanguage(lng)
      for (const goal of [
        { time_frame: 'monthly' },
        { time_frame: 'weekly' },
        { time_frame: 'deadline', target_date: '2026-11-19' },
        { time_frame: 'deadline', target_date: null },
      ]) {
        expect(timeFrameLabel(goal), `${lng} / ${goal.time_frame}`).not.toMatch(HEBREW)
      }
    }
  })

  it('still returns empty for an unknown time frame', async () => {
    expect(timeFrameLabel({ time_frame: 'nonsense' })).toBe('')
    expect(timeFrameLabel({})).toBe('')
  })
})

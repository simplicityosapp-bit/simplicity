/* ════════════════════════════════════════════════════════════════
   PROJECT COUNTS — one group must not read "1 קבוצות".
   ════════════════════════════════════════════════════════════════
   projects.json was the last namespace in the app still holding a single
   string with a hard-coded plural noun. Every count on these two screens
   went through one: the project-screen header ("{{count}} קבוצות"), the
   group card's member line, the package price, and the projects tally.
   With one of anything they read "1 קבוצות" / "1 חברים".

   The group-status confirm had a second, subtler version of the same bug:
   it picked its wording in JS with `willFlip.length === 1 ? one : many`.
   A two-branch ternary can only ever know two forms, so Hebrew's DUAL fell
   through to the plural and two clients read "2 לקוחות" rather than
   "שני לקוחות". It resolves through i18next now, like everything else.

   Asserted at the counts that actually break: 1 and 2.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

beforeAll(async () => {
  await initI18n({ lng: 'he' })
  await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
})

const t = (lng, key, vars) => i18n.getFixedT(lng, 'projects')(key, vars)

describe('Hebrew uses the right form, including the dual', () => {
  it('projects tally', () => {
    expect(t('he', 'count', { count: 1 })).toBe('פרויקט אחד')
    expect(t('he', 'count', { count: 2 })).toBe('שני פרויקטים')
    expect(t('he', 'count', { count: 9 })).toBe('9 פרויקטים')
  })

  it('group count in the project header', () => {
    expect(t('he', 'detail.metaGroups', { count: 1 })).toBe('קבוצה אחת')
    expect(t('he', 'detail.metaGroups', { count: 2 })).toBe('שתי קבוצות')
    expect(t('he', 'detail.metaGroups', { count: 5 })).toBe('5 קבוצות')
  })

  it('members on a group card', () => {
    expect(t('he', 'detail.groups.members', { count: 1 })).toBe('חבר אחד')
    expect(t('he', 'detail.groups.members', { count: 2 })).toBe('שני חברים')
    expect(t('he', 'detail.groups.members', { count: 6 })).toBe('6 חברים')
  })

  it('package price', () => {
    expect(t('he', 'detail.groups.pricePackage', { price: '₪500', count: 1 })).toBe('₪500 / פגישה אחת')
    expect(t('he', 'detail.groups.pricePackage', { price: '₪500', count: 2 })).toBe('₪500 / שתי פגישות')
    expect(t('he', 'detail.groups.pricePackage', { price: '₪500', count: 8 })).toBe('₪500 / 8 פגישות')
  })

  it('paused clients', () => {
    expect(t('he', 'detail.metaWandering', { count: 1 })).toBe('אחד בהפסקה')
    expect(t('he', 'detail.metaWandering', { count: 2 })).toBe('שניים בהפסקה')
    expect(t('he', 'detail.metaWandering', { count: 3 })).toBe('3 בהפסקה')
  })

  /* The one that a ternary could not express. */
  it('group-status confirm knows the dual', () => {
    const v = { status: 'הסתיימה', meta: 'לשעבר' }
    expect(t('he', 'detail.statusChange.message', { ...v, count: 1 })).toContain('לקוח אחד')
    expect(t('he', 'detail.statusChange.message', { ...v, count: 2 })).toContain('שני לקוחות')
    expect(t('he', 'detail.statusChange.message', { ...v, count: 4 })).toContain('4 לקוחות')
  })
})

describe('the other three languages agree with their own count', () => {
  it('singular is singular', () => {
    expect(t('en', 'count', { count: 1 })).toBe('1 project')
    expect(t('es', 'count', { count: 1 })).toBe('1 proyecto')
    expect(t('fr', 'count', { count: 1 })).toBe('1 projet')
    expect(t('en', 'detail.metaGroups', { count: 1 })).toBe('1 group')
    expect(t('es', 'detail.groups.members', { count: 1 })).toBe('1 miembro')
    expect(t('fr', 'detail.groups.pricePackage', { price: '50 €', count: 1 })).toBe('50 € / 1 séance')
  })

  it('plural is unchanged', () => {
    expect(t('en', 'count', { count: 4 })).toBe('4 projects')
    expect(t('es', 'count', { count: 4 })).toBe('4 proyectos')
    expect(t('fr', 'count', { count: 4 })).toBe('4 projets')
    expect(t('en', 'detail.metaGroups', { count: 4 })).toBe('4 groups')
    expect(t('es', 'detail.groups.members', { count: 4 })).toBe('4 miembros')
    expect(t('fr', 'detail.groups.pricePackage', { price: '50 €', count: 4 })).toBe('50 € / 4 séances')
  })

  it('the status confirm resolves in every language', () => {
    const v = { status: 'X', meta: 'Y' }
    for (const lng of ['en', 'es', 'fr']) {
      for (const count of [1, 2, 5]) {
        const s = t(lng, 'detail.statusChange.message', { ...v, count })
        expect(s).toContain(String(count))
        expect(s).not.toContain('statusChange')   // key echoed back = unresolved
      }
    }
  })
})

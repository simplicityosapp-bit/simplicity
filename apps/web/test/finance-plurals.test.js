/* ════════════════════════════════════════════════════════════════
   FINANCE COUNTS — one row must not read "1 תנועות".
   ════════════════════════════════════════════════════════════════
   The finance header, the pending card and the skipped toggle all render a
   count. They used to hold a single string with a hard-coded plural noun, so
   a lone transaction read "1 תנועות" / "1 transacciones". These assert the
   plural variants resolve for the count that actually breaks (1), and that
   the plural case still reads as it did.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@simplicity/core/i18n'

beforeAll(async () => { await initI18n({ lng: 'he' }) })

const t = (lng, key, count) => i18n.getFixedT(lng, 'finance')(key, { count })

describe('Hebrew never emits a bare number in front of a plural noun', () => {
  it('countLabel', () => {
    expect(t('he', 'countLabel', 1)).toBe('תנועה אחת')
    expect(t('he', 'countLabel', 2)).toBe('שתי תנועות')
    expect(t('he', 'countLabel', 7)).toBe('7 תנועות')
  })

  it('pending.count', () => {
    expect(t('he', 'pending.count', 1)).toBe('תנועה אחת ממתינה')
    expect(t('he', 'pending.count', 2)).toBe('שתי תנועות ממתינות')
    expect(t('he', 'pending.count', 5)).toBe('5 תנועות ממתינות')
  })

  it('showSkipped', () => {
    expect(t('he', 'showSkipped', 1)).toBe('הצג תנועה אחת שדילגת')
    expect(t('he', 'showSkipped', 4)).toBe('הצג 4 תנועות שדילגת')
  })
})

describe('the other three languages agree with their own count', () => {
  it('singular is singular', () => {
    expect(t('en', 'countLabel', 1)).toBe('1 transaction')
    expect(t('es', 'countLabel', 1)).toBe('1 transacción')
    expect(t('fr', 'countLabel', 1)).toBe('1 transaction')
    expect(t('en', 'pending.count', 1)).toBe('1 pending transaction')
    expect(t('es', 'showSkipped', 1)).toBe('Mostrar 1 omitida')
    expect(t('fr', 'showSkipped', 1)).toBe('Afficher 1 ignorée')
  })

  it('plural is unchanged', () => {
    expect(t('en', 'countLabel', 3)).toBe('3 transactions')
    expect(t('es', 'countLabel', 3)).toBe('3 transacciones')
    expect(t('fr', 'countLabel', 3)).toBe('3 transactions')
    expect(t('en', 'pending.count', 3)).toBe('3 pending transactions')
    expect(t('es', 'showSkipped', 3)).toBe('Mostrar 3 omitidas')
    expect(t('fr', 'showSkipped', 3)).toBe('Afficher 3 ignorées')
  })
})

describe('zero still reads as a plural, not a singular', () => {
  it('he / en', () => {
    expect(t('he', 'countLabel', 0)).toBe('0 תנועות')
    expect(t('en', 'countLabel', 0)).toBe('0 transactions')
  })
})

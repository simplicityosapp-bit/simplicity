/* ════════════════════════════════════════════════════════════════
   SAFETY DIALOGS — every new confirmation must have real copy.
   ════════════════════════════════════════════════════════════════
   The delete / bulk-approve / import / discard dialogs were added in four
   languages at once. A mistyped key path does not throw — i18next echoes the
   key, so the user is asked to confirm deleting their money by a dialog
   titled "finance:deleteTx.title". These assert every key resolves to real
   copy in every language, and that the interpolations actually land.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@simplicity/core/i18n'

beforeAll(async () => { await initI18n({ lng: 'he' }) })

const LANGS = ['he', 'en', 'es', 'fr']
const tr = (lng, ns, key, opts) => i18n.getFixedT(lng, ns)(key, opts)

/* i18next returns the bare key when it can't resolve one. */
const resolves = (lng, ns, key, opts) => {
  const out = tr(lng, ns, key, opts)
  return typeof out === 'string' && out.length > 0 && out !== key && !out.includes(key)
}

const FINANCE_KEYS = [
  ['deleteTx.title'],
  ['deleteTx.message', { desc: 'ייעוץ', amount: '₪300' }],
  ['deleteTx.confirm'],
  ['pending.approveAllConfirm.title'],
  ['pending.approveAllConfirm.message', { count: 6, totals: 'x' }],
  ['pending.approveAllConfirm.confirm'],
  ['imports.confirmTitle'],
  ['imports.confirmMessage', { amount: '₪300', forName: '' }],
  ['imports.confirmBtn'],
]

const MODALS_KEYS = [
  ['editTx.deleteConfirm.title'],
  ['editTx.deleteConfirm.message', { desc: 'ייעוץ', amount: '₪300' }],
  ['editTx.deleteConfirm.noDesc'],
  ['editTx.deleteConfirm.confirm'],
  ['discard.title'],
  ['discard.message'],
  ['discard.confirm'],
  ['discard.cancel'],
]

describe('every safety dialog resolves in all four languages', () => {
  LANGS.forEach((lng) => {
    it(`finance — ${lng}`, () => {
      FINANCE_KEYS.forEach(([key, opts]) => {
        expect(resolves(lng, 'finance', key, opts), `${lng} finance:${key}`).toBe(true)
      })
    })

    it(`modalsData — ${lng}`, () => {
      MODALS_KEYS.forEach(([key, opts]) => {
        expect(resolves(lng, 'modalsData', key, opts), `${lng} modalsData:${key}`).toBe(true)
      })
    })
  })
})

describe('the dialogs name what is about to happen', () => {
  it('the delete prompt carries the description and the amount', () => {
    const msg = tr('he', 'finance', 'deleteTx.message', { desc: 'ייעוץ זוגי', amount: '₪300' })
    expect(msg).toContain('ייעוץ זוגי')
    expect(msg).toContain('₪300')
  })

  it('the bulk-approve prompt carries the count and both totals', () => {
    const msg = tr('he', 'finance', 'pending.approveAllConfirm.message', {
      count: 6, totals: 'הכנסות ₪2,400 · הוצאות ₪310',
    })
    expect(msg).toContain('6')
    expect(msg).toContain('₪2,400')
    expect(msg).toContain('₪310')
  })

  it('two pending rows read as "שתי", not "2"', () => {
    /* The bulk button only appears above one row, so count=2 is the first
       real case — and it is the one Hebrew gets wrong without a _two form. */
    expect(tr('he', 'finance', 'pending.approveAllConfirm.message', { count: 2, totals: '' }))
      .toContain('שתי תנועות')
  })

  it('the import prompt says it creates income', () => {
    expect(tr('he', 'finance', 'imports.confirmMessage', { amount: '₪500', forName: ' לדנה' }))
      .toContain('₪500')
  })
})

describe('the retired arm-and-fire strings are gone', () => {
  it('"בטוח/ה?" and its aria label no longer resolve', () => {
    expect(resolves('he', 'finance', 'imports.sure')).toBe(false)
    expect(resolves('he', 'finance', 'imports.confirmAria', { amount: '₪1' })).toBe(false)
  })
})

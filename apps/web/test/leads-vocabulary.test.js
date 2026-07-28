/* ════════════════════════════════════════════════════════════════
   LEADS VOCABULARY — "stage" for leads, "sub-status" for clients.
   ════════════════════════════════════════════════════════════════
   The owner's call was to rename the leads wording ONLY. Three keys were
   shared with the clients domain (the picker label, the editor placeholder,
   the delete dialog title), so each grew a leads-specific sibling instead of
   being renamed in place.

   The editor placeholders MOVED (2026-07-28) when both taxonomies left
   Settings for the screens that use them: the stage placeholder now lives in
   `leads:statusesPanel.addPlaceholder` and the sub-status one in
   `clients:statuses.placeholder`. The addresses changed; the decision this
   suite guards did not, so it follows them rather than pinning a settings
   namespace that no longer has an editor to label.

   That split is the fragile part: nothing in the type system stops someone
   pointing a lead modal back at the client key, or deleting the sibling as
   an apparent duplicate. These assert both halves — the leads keys exist
   and read as stages, and the client keys still exist and still read as
   sub-statuses.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

/* initI18n only bundles `he` (the other three are lazy chunks — see
   @simplicity/core/i18n), and this suite asserts across all four, so pull
   them in explicitly before the assertions run. */
beforeAll(async () => {
  await initI18n({ lng: 'he' })
  await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
})

const LANGS = ['he', 'en', 'es', 'fr']
const tr = (lng, ns, key, opts) => i18n.getFixedT(lng, ns)(key, opts)
const resolves = (lng, ns, key, opts) => {
  const out = tr(lng, ns, key, opts)
  return typeof out === 'string' && out.length > 0 && out !== key && !out.includes(key)
}

/* The word each language settled on, so a later edit can't quietly drift. */
const STAGE = { he: 'שלב', en: 'Stage', es: 'Etapa', fr: 'Étape' }
const SUBSTATUS = { he: 'תת-סטטוס', en: 'Sub-status', es: 'Subestado', fr: 'Sous-statut' }

describe('the leads keys exist and say "stage"', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      expect(resolves(lng, 'modalsClient', 'common.leadStageOptional')).toBe(true)
      expect(resolves(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x' })).toBe(true)
      expect(resolves(lng, 'modalsClient', 'deleteSubStatus.titleLead', { name: 'x' })).toBe(true)

      expect(tr(lng, 'modalsClient', 'common.leadStageOptional')).toContain(STAGE[lng])
      expect(tr(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x' })).toContain(STAGE[lng])
      expect(tr(lng, 'leads', 'filter.status')).toContain(STAGE[lng])
      expect(tr(lng, 'leads', 'dropPicker.title')).toContain(STAGE[lng].toLowerCase().slice(0, 4))
    })
  })
})

describe('the client keys survive and still say "sub-status"', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      /* Deleting these as "duplicates" would silently relabel the clients
         screen — the exact thing the split exists to prevent. */
      expect(resolves(lng, 'modalsClient', 'common.subStatusOptional')).toBe(true)
      expect(resolves(lng, 'clients', 'statuses.placeholder', { meta: 'x' })).toBe(true)
      expect(resolves(lng, 'modalsClient', 'deleteSubStatus.title', { name: 'x' })).toBe(true)

      expect(tr(lng, 'modalsClient', 'common.subStatusOptional')).toContain(SUBSTATUS[lng])
      expect(tr(lng, 'clients', 'statuses.placeholder', { meta: 'x' })).toContain(SUBSTATUS[lng])
    })
  })
})

describe('the two domains genuinely differ', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      expect(tr(lng, 'modalsClient', 'common.leadStageOptional'))
        .not.toBe(tr(lng, 'modalsClient', 'common.subStatusOptional'))
      expect(tr(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x' }))
        .not.toBe(tr(lng, 'clients', 'statuses.placeholder', { meta: 'x' }))
    })
  })
})

describe('the Hebrew conversion wording moved off "המרה"', () => {
  it('the column, the card action and the badge', () => {
    expect(tr('he', 'leads', 'meta.converted')).toBe('הפכו ללקוחות')
    expect(tr('he', 'leads', 'card.convert')).toBe('הפיכה ללקוח')
    expect(tr('he', 'leads', 'card.converted')).toBe('נוסף לרשימת הלקוחות')
  })

  it('Reports names the same figure the same way', () => {
    /* Otherwise one screen says "הומרו ללקוחות" and the other "הפכו
       ללקוחות" about an identical number. */
    expect(tr('he', 'reports', 'metrics.leadsConverted')).toBe('הפכו ללקוחות')
  })

  it('the other three languages keep their own natural wording', () => {
    /* "Convert to client" was never jargon in English/Spanish/French —
       rewording those would have made them worse, not clearer. */
    expect(tr('en', 'leads', 'card.convert')).toMatch(/Convert/i)
    expect(tr('es', 'leads', 'card.convert')).toMatch(/Convertir/i)
    expect(tr('fr', 'leads', 'card.convert')).toMatch(/Convertir/i)
  })
})

describe('the conversion-rate label names its denominator', () => {
  it('no longer just says "conversion rate"', () => {
    expect(tr('he', 'leads', 'stats.convRate')).toBe('מהפניות החודש')
    expect(tr('en', 'leads', 'stats.convRate')).toMatch(/this month/i)
  })
})

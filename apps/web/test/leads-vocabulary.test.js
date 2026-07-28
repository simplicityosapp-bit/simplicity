/* ════════════════════════════════════════════════════════════════
   LEADS VOCABULARY — per-column for leads, "sub-status" for clients.
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

   Then the word itself split (2026-07-28, owner's second call): "שלב" is
   honest about בתהליך and dishonest everywhere else — a lead is not at a
   "stage of not-relevant" — so the label now depends on the column, through
   i18next `context`:

     in_process   → stage    (a step on the way)
     not_relevant → reason   (why it stopped)
     converted    → nothing  (a closed lead gets a project, not a sub-status)

   and the cross-column strings (filter, move, delete) take a neutral
   umbrella that is deliberately NOT the clients' "תת-סטטוס".

   That split is the fragile part: nothing in the type system stops someone
   pointing a lead modal back at the client key, deleting a context variant
   as an apparent duplicate, or "simplifying" the three lead words back into
   one. These assert every half.
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

/* The word each language settled on, so a later edit can't quietly drift.
   Matching is case-insensitive on the stem so a mid-sentence "étape" still
   counts as the same word as a sentence-initial "Étape". */
const STAGE = { he: 'שלב', en: 'Stage', es: 'Etapa', fr: 'Étape' }
const REASON = { he: 'סיבה', en: 'Reason', es: 'Motivo', fr: 'Motif' }
const UMBRELLA = { he: 'סיווג', en: 'Label', es: 'Etiqueta', fr: 'Libellé' }
const SUBSTATUS = { he: 'תת-סטטוס', en: 'Sub-status', es: 'Subestado', fr: 'Sous-statut' }
/* Hebrew has no case; the other three are matched loosely so "Motif"/"motifs"
   both count. Locale-aware lowercasing keeps É→é. */
const says = (text, word, lng) => text.toLocaleLowerCase(lng).includes(word.toLocaleLowerCase(lng))

describe('"בתהליך" says stage', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      expect(resolves(lng, 'modalsClient', 'common.leadStageOptional', { context: 'in_process' })).toBe(true)
      expect(resolves(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x', context: 'in_process' })).toBe(true)
      expect(resolves(lng, 'modalsClient', 'deleteSubStatus.titleLead', { name: 'x' })).toBe(true)

      expect(says(tr(lng, 'modalsClient', 'common.leadStageOptional', { context: 'in_process' }), STAGE[lng], lng)).toBe(true)
      expect(says(tr(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x', context: 'in_process' }), STAGE[lng], lng)).toBe(true)
      expect(says(tr(lng, 'leads', 'dropPicker.title', { context: 'in_process' }), STAGE[lng], lng)).toBe(true)
    })
  })
})

describe('"לא רלוונטי" says reason, not stage', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      const label = tr(lng, 'modalsClient', 'common.leadStageOptional', { context: 'not_relevant' })
      const add = tr(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x', context: 'not_relevant' })
      const drop = tr(lng, 'leads', 'dropPicker.title', { context: 'not_relevant' })

      ;[label, add, drop].forEach((s) => {
        expect(says(s, REASON[lng], lng)).toBe(true)
        /* The whole point of the split — a lead is not at a "stage of
           not-relevant". */
        expect(says(s, STAGE[lng], lng)).toBe(false)
      })
    })
  })
})

describe('the cross-column strings borrow neither column\'s word', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      /* The filter, the move sheet and the delete dialog span all three
         columns, so they take the umbrella. */
      ;['filter.status', 'move.title', 'statusesPanel.deleteTitle'].forEach((k) => {
        const s = tr(lng, 'leads', k)
        expect(says(s, UMBRELLA[lng], lng)).toBe(true)
        expect(says(s, STAGE[lng], lng)).toBe(false)
        expect(says(s, REASON[lng], lng)).toBe(false)
      })
      /* …and it must not be the clients' word either. */
      expect(says(UMBRELLA[lng], SUBSTATUS[lng], lng)).toBe(false)
    })
  })
})

describe('"הפכו ללקוחות" offers no sub-status at all', () => {
  LANGS.forEach((lng) => {
    it(lng, () => {
      /* The convert modal's picker is gone — a closed lead is described by
         its project (beta feedback a67d59f1). If someone re-adds the key,
         they have re-added the field. */
      expect(resolves(lng, 'modalsClient', 'convertLead.convertedSubStatusOptional')).toBe(false)
      /* The panel says why the add row is missing rather than leaving a gap. */
      expect(resolves(lng, 'leads', 'statusesPanel.convertedNote')).toBe(true)
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
      expect(tr(lng, 'modalsClient', 'common.leadStageOptional', { context: 'in_process' }))
        .not.toBe(tr(lng, 'modalsClient', 'common.subStatusOptional'))
      expect(tr(lng, 'leads', 'statusesPanel.addPlaceholder', { meta: 'x', context: 'in_process' }))
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

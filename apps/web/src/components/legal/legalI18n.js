import * as he from './legalContent'
import * as en from './legalContent.en'
import * as es from './legalContent.es'
import * as fr from './legalContent.fr'

/* ════════════════════════════════════════════════════════════════
   LEGAL I18N — language selector for the public /legal page.
   The Hebrew source (legalContent.js) stays the canonical document;
   en/es/fr are faithful translations (Israeli law governs) and mirror
   its exact block structure. Version constants are shared, so all four
   languages always show the same version numbers.

   NOTE: the in-app modals (PrivacyPolicyModal / TermsModal / DPAModal,
   shown at signup + re-acceptance) deliberately stay Hebrew — only the
   public /legal page is multilingual for now. The translations are
   AI-generated and PENDING HUMAN LEGAL REVIEW.
   ════════════════════════════════════════════════════════════════ */

export const LEGAL_LANGS = [
  { code: 'he', name: 'עברית',    dir: 'rtl' },
  { code: 'en', name: 'English',  dir: 'ltr' },
  { code: 'es', name: 'Español',  dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
]

const MODULES = { he, en, es, fr }

/* UI chrome strings per language (tab labels, back button, aria labels, brand). */
const UI = {
  he: { privacy: 'מדיניות פרטיות',         terms: 'תנאי שימוש',           dpa: 'עיבוד נתונים',          back: 'חזור לאפליקציה', docsAria: 'מסמכים משפטיים',   langAria: 'בחירת שפה',        brand: 'סימפליסיטי' },
  en: { privacy: 'Privacy Policy',          terms: 'Terms of Use',          dpa: 'Data Processing',        back: 'Back to app',     docsAria: 'Legal documents',  langAria: 'Select language',  brand: 'Simplicity' },
  es: { privacy: 'Política de Privacidad',  terms: 'Términos de Uso',       dpa: 'Procesamiento de Datos', back: 'Volver a la app', docsAria: 'Documentos legales', langAria: 'Seleccionar idioma', brand: 'Simplicity' },
  fr: { privacy: 'Politique de Confidentialité', terms: 'Conditions d’Utilisation', dpa: 'Traitement des Données', back: 'Retour à l’app', docsAria: 'Documents juridiques', langAria: 'Choisir la langue', brand: 'Simplicity' },
}

/* Resolve a language code (falls back to Hebrew) → everything the LegalPage
   needs: text direction, chrome strings, and the three document tabs. */
export function getLegal(lang) {
  const code = MODULES[lang] ? lang : 'he'
  const m = MODULES[code]
  const ui = UI[code]
  const dir = (LEGAL_LANGS.find((l) => l.code === code) || LEGAL_LANGS[0]).dir
  return {
    code,
    dir,
    brand: ui.brand,
    backLabel: ui.back,
    docsAria: ui.docsAria,
    langAria: ui.langAria,
    tabs: [
      { key: 'privacy', label: ui.privacy, blocks: m.PRIVACY_BLOCKS, meta: m.PRIVACY_META },
      { key: 'terms',   label: ui.terms,   blocks: m.TERMS_BLOCKS,   meta: m.TERMS_META },
      { key: 'dpa',     label: ui.dpa,     blocks: m.DPA_BLOCKS,     meta: m.DPA_META },
    ],
  }
}

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import heQuotes from '../i18n/locales/he/quotes.json'
import enQuotes from '../i18n/locales/en/quotes.json'
import esQuotes from '../i18n/locales/es/quotes.json'
import frQuotes from '../i18n/locales/fr/quotes.json'

/* The 'quotes' namespace is registered here (not in i18n/index.js) so this
   hook stays self-contained — same pattern as guidance/export/presets.
   addResourceBundle is idempotent for our purposes (same content). */
i18n.addResourceBundle('he', 'quotes', heQuotes, true, false)
i18n.addResourceBundle('en', 'quotes', enQuotes, true, false)
i18n.addResourceBundle('es', 'quotes', esQuotes, true, false)
i18n.addResourceBundle('fr', 'quotes', frQuotes, true, false)

/* Picks the daily system quote from the i18n `quotes` namespace for the
   active UI language. Each language carries its own curated pool (see
   src/i18n/locales/<lng>/quotes.json); if the active language has no pool
   we fall back to the base language, then to Hebrew. The pick is seeded by
   day + language so it stays stable across re-renders and rotates once a
   day, and re-resolves when the user switches language. Personal quotes
   (QuoteWidget) come from the user_quotes table and are unaffected. */
export function useQuote() {
  const { i18n: inst } = useTranslation('quotes')
  const lang = inst.language || 'he'

  const quote = useMemo(() => {
    const poolFor = (lng) => {
      if (!lng) return null
      const list = inst.getResource(lng, 'quotes', 'list')
      return Array.isArray(list) && list.length ? list : null
    }
    const list = poolFor(lang) || poolFor(lang.split('-')[0]) || poolFor('he') || []
    if (!list.length) return null
    /* Day + language seed → stable, pure, lint-safe, rotates daily. */
    const seed = `${new Date().toDateString()}|${lang}`
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    return list[Math.abs(h) % list.length]
  }, [lang, inst])

  return { quote, loading: false }
}

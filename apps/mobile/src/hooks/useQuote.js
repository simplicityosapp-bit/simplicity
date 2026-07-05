import { useMemo } from 'react'
import i18n from '../lib/i18n'

// Mirror of apps/web/src/hooks/useQuote.js — the daily system quote from a
// per-language curated pool, seeded by day+lang so it's stable and rotates
// once a day. The pools are registered as the `quotes` namespace by
// registerQuotes() (called after initI18n); this hook only reads them.
export function useQuote() {
  const lang = i18n.language || 'he'

  const quote = useMemo(() => {
    const poolFor = (lng) => {
      if (!lng) return null
      const list = i18n.getResource(lng, 'quotes', 'list')
      return Array.isArray(list) && list.length ? list : null
    }
    const list = poolFor(lang) || poolFor(lang.split('-')[0]) || poolFor('he') || []
    if (!list.length) return null
    const seed = `${new Date().toDateString()}|${lang}`
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    return list[Math.abs(h) % list.length]
  }, [lang])

  return { quote, loading: false }
}

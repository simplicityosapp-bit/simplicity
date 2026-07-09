import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setCurrentCurrency, setDateTimeFormat, setHebrewCalendar } from '@simplicity/core'
import { supabase } from './supabase'
import { THEME_KEY } from '../theme/theme'
import i18n, { setGenderContext } from './i18n'

const SUPPORTED_LANGS = ['he', 'en', 'es', 'fr']

// Apply saved format prefs to the core formatters (mirrors web PrefsApplier):
// currency → isr, date/time → fmtShortDate/fmtTime, Hebrew calendar → formatWhen.
// Without this, every date/time/money value on mobile was fixed to DD/MM · 24h ·
// ₪ regardless of what the user chose on web.
function applyFormatPrefs(p) {
  if (!p) return
  if (p.format?.currency) setCurrentCurrency(p.format.currency)
  setDateTimeFormat({ date_format: p.format?.date_format, time_format: p.format?.time_format })
  setHebrewCalendar({ enabled: p.design?.hebrew_calendar, dual: p.design?.hebrew_calendar_dual })
}

// Apply a saved UI language over the startup default (which was picked from the
// device locale in setupI18n). Strings swap immediately; a Hebrew↔LTR direction
// flip only fully applies after an app restart (RN I18nManager limitation), so
// we set the flag here for the next launch and the Settings screen shows a hint.
export function applySavedLanguage(lang) {
  if (!lang || !SUPPORTED_LANGS.includes(lang) || lang === i18n.language) return
  i18n.changeLanguage(lang)
  const rtl = lang === 'he'
  if (I18nManager.isRTL !== rtl) {
    try { I18nManager.allowRTL(rtl); I18nManager.forceRTL(rtl) } catch { /* web ignores forceRTL */ }
  }
}

// App-wide user preferences (one row per user, a JSONB `preferences` blob —
// mirrors the web userPreferences API). A single provider loads once and shares
// { prefs, update } so every screen reads the same reactive state (background
// mode, language, sort/scope, etc.). update() is optimistic + persists.
const PreferencesContext = createContext({ prefs: {}, update: async () => {} })

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState({})
  const ref = useRef({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('user_preferences').select('preferences').eq('user_id', session.user.id).maybeSingle()
        const p = (data && data.preferences) || {}
        ref.current = p
        if (alive) setPrefs(p)
        applySavedLanguage(p.language)
        setGenderContext(p.design?.gender)
        applyFormatPrefs(p)
        // Sync the saved theme to the boot cache so a theme chosen on web (or a
        // prior session) applies on the NEXT launch (RN freezes StyleSheet colors
        // at boot — theme.js reads THEME_KEY there). No reload here (avoids a flash).
        if (p.design?.theme === 'dark' || p.design?.theme === 'light') {
          AsyncStorage.setItem(THEME_KEY, p.design.theme).catch(() => {})
        }
      } catch { /* keep defaults */ }
    })()
    return () => { alive = false }
  }, [])

  const update = useCallback(async (patch) => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    setPrefs(next)
    applyFormatPrefs(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('user_preferences').update({ preferences: next }).eq('user_id', session.user.id).select('preferences').maybeSingle()
      if (!data) await supabase.from('user_preferences').insert({ user_id: session.user.id, preferences: next })
    } catch { /* keep optimistic */ }
  }, [])

  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>
}

export const usePreferences = () => useContext(PreferencesContext)

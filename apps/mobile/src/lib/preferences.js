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

// Localized, gender-aware label for a profession key (ported from web
// lib/preferences.js). Roles live under the `common:roles.*` i18n namespace with
// _male/_female context variants — NOT settings:profile.roles.*.
export function roleLabel(key, gender) {
  if (!key) return ''
  const context = gender === 'male' || gender === 'female' ? gender : undefined
  return i18n.t('common:roles.' + key, { context })
}

// App-wide user preferences (one row per user, a JSONB `preferences` blob —
// mirrors the web userPreferences API). A single provider loads once and shares
// { prefs, update } so every screen reads the same reactive state (background
// mode, language, sort/scope, etc.). update() is optimistic + persists.
const PreferencesContext = createContext({ prefs: {}, update: async () => {} })

// One-level deep merge (mirrors web deepMerge): nested objects (design/format/
// widgets/profile…) merge key-by-key instead of being replaced wholesale, so a
// caller can pass just the changed leaf and concurrent updates can't drop each
// other's sibling keys.
function deepMerge(base, patch) {
  const out = { ...(base || {}) }
  Object.keys(patch || {}).forEach((k) => {
    const v = patch[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = v
    }
  })
  return out
}

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState({})
  const ref = useRef({})
  // True once the user has interacted, so the initial server load doesn't revert
  // a change made during cold-start (mirrors web's prefsRef==null guard).
  const touched = useRef(false)
  // Serializes DB writes so an earlier write finishing last can't overwrite a
  // later merge (lost-update race when two update()s land near-simultaneously).
  const writeChain = useRef(Promise.resolve())

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('user_preferences').select('preferences').eq('user_id', session.user.id).maybeSingle()
        const p = (data && data.preferences) || {}
        // RACE FIX: if the user already toggled something before this load
        // resolved, adopting the server value would silently revert their change
        // (the read started BEFORE they clicked). Only adopt when untouched.
        if (!touched.current) {
          ref.current = p
          if (alive) setPrefs(p)
        }
        const eff = ref.current // authoritative value (server p if untouched, else the user's)
        // Language lives at prefs.design.language (the durable store web reads/writes);
        // fall back to a legacy top-level prefs.language so an early mobile-only choice
        // isn't lost on upgrade.
        applySavedLanguage(eff.design?.language || eff.language)
        setGenderContext(eff.design?.gender)
        applyFormatPrefs(eff)
        // Sync the saved theme to the boot cache so a theme chosen on web (or a
        // prior session) applies on the NEXT launch (RN freezes StyleSheet colors
        // at boot — theme.js reads THEME_KEY there). No reload here (avoids a flash).
        if (eff.design?.theme === 'dark' || eff.design?.theme === 'light') {
          AsyncStorage.setItem(THEME_KEY, eff.design.theme).catch(() => {})
        }
      } catch { /* keep defaults */ }
    })()
    return () => { alive = false }
  }, [])

  const update = useCallback(async (patch) => {
    touched.current = true
    const next = deepMerge(ref.current, patch)
    ref.current = next
    setPrefs(next)
    applyFormatPrefs(next)
    // Keep the gender context in sync too (symmetric with applyFormatPrefs) so any
    // update() path that changes design.gender takes effect without a manual call.
    // `next` is the full merged prefs, so this preserves the current gender on
    // unrelated updates rather than resetting it.
    setGenderContext(next.design?.gender)
    // Chain the DB write after any in-flight one, and always send the LATEST
    // merged state (ref.current) so concurrent updates can't lose each other.
    const task = writeChain.current.then(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('user_preferences').update({ preferences: ref.current }).eq('user_id', session.user.id).select('preferences').maybeSingle()
        if (!data) await supabase.from('user_preferences').insert({ user_id: session.user.id, preferences: ref.current })
      } catch { /* keep optimistic */ }
    })
    writeChain.current = task.catch(() => {})
    return task
  }, [])

  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>
}

export const usePreferences = () => useContext(PreferencesContext)

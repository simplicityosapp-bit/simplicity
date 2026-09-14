import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setCurrentCurrency, setDateTimeFormat, setHebrewCalendar } from '@simplicity/core'
import { setLanguage } from '@simplicity/core/i18n'
import { supabase } from './supabase'
import { THEME_KEY } from '../theme/theme'
import { LANG_KEY } from './bootPrefs'
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
  // setLanguage, not changeLanguage — only `he` is bundled into the engine, so
  // the chosen language's bundle has to be pulled in before the swap.
  setLanguage(lang)
  /* Cached for the next boot, like the palette: setupI18n has to know the
     chosen language before the app graph evaluates, because layout direction
     is decided there and can only be applied to the next process. */
  AsyncStorage.setItem(LANG_KEY, lang).catch(() => { /* applies now, forgotten next launch */ })
  const rtl = lang === 'he'
  if (I18nManager.isRTL !== rtl) {
    try { I18nManager.allowRTL(rtl); I18nManager.forceRTL(rtl) } catch { /* web ignores forceRTL */ }
  }
}

// Reset the global format/gender singletons to app defaults — called on sign-out
// so the next user on a shared device doesn't briefly inherit the previous user's
// currency/date-format/gendered wording before their own prefs load.
export function resetPreferenceEffects() {
  setGenderContext('neutral')
  setCurrentCurrency('ILS')
  setDateTimeFormat({ date_format: 'DD/MM/YY', time_format: '24h' })
  setHebrewCalendar({ enabled: false, dual: false })
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
/* `status` matters to anything that GATES on a preference rather than just
   reads one. prefs starts as {} and fills asynchronously, so an absent key
   means "not loaded yet" just as often as it means "not set" — and the
   onboarding gate cannot tell those apart without this. Reading it as "not
   set" would send an existing, long-onboarded user back through the flow on
   every cold start. 'error' is kept distinct from 'ready' for the same
   reason: when the read fails we know nothing. App.js shows a retry screen
   for it, and update() writes nothing until a read has succeeded. */
const PreferencesContext = createContext({
  prefs: {},
  update: async () => {},
  status: 'loading',
  reload: async () => {},
})

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
  const [status, setStatus] = useState('loading')
  const ref = useRef({})
  /* Whether the server's copy has been read. Until it has, ref.current is not
     the user's preferences — it is {} plus whatever changed since — and a
     write sends the WHOLE blob, so writing it replaces everything the user
     has (profile, widgets, WhatsApp templates, onboarding.completed_at) with
     that fragment. A failed read used to do exactly this: supabase-js reports
     a dropped connection as { data: null, error } instead of throwing, the
     error went unchecked, {} was reported as 'ready', and the first thing the
     user changed wiped the row. */
  const loaded = useRef(false)
  /* Changes made before a read succeeded. Re-applied on top of the server's
     copy when it arrives, so the load neither reverts them nor gets
     overwritten by them. */
  const early = useRef(null)
  const alive = useRef(true)
  // Serializes DB writes so an earlier write finishing last can't overwrite a
  // later merge (lost-update race when two update()s land near-simultaneously).
  const writeChain = useRef(Promise.resolve())

  // Chain the DB write after any in-flight one, and always send the LATEST
  // merged state (ref.current) so concurrent updates can't lose each other.
  const persist = useCallback(() => {
    const task = writeChain.current.then(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data, error } = await supabase.from('user_preferences').update({ preferences: ref.current }).eq('user_id', session.user.id).select('preferences').maybeSingle()
        if (error) throw error
        // No row matched: a first-ever write. (A FAILED update also comes back
        // without data; that is the throw above, not a reason to insert.)
        if (!data) await supabase.from('user_preferences').insert({ user_id: session.user.id, preferences: ref.current })
      } catch { /* keep optimistic */ }
    })
    writeChain.current = task.catch(() => {})
    return task
  }, [])

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      /* No session: nothing to load and nothing to gate — this provider only
         mounts inside the authed tree, so treat it as a finished read rather
         than leaving every consumer waiting on 'loading' forever. */
      if (!session) { loaded.current = true; if (alive.current) setStatus('ready'); return }
      const { data, error } = await supabase.from('user_preferences').select('preferences').eq('user_id', session.user.id).maybeSingle()
      if (error) throw error
      /* A user with no row yet reads as {} — genuinely "nothing set", which
         is exactly what a first-run gate should see. Distinct from the catch
         below, where we simply do not know. */
      const server = (data && data.preferences) || {}
      const pending = early.current
      early.current = null
      const eff = pending ? deepMerge(server, pending) : server
      ref.current = eff
      loaded.current = true
      if (alive.current) { setPrefs(eff); setStatus('ready') }
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
      // What changed while we could not write is saved now, over the real copy.
      if (pending) persist()
    } catch { if (alive.current) setStatus('error') /* keep defaults */ }
  }, [persist])

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load])

  const update = useCallback(async (patch) => {
    const next = deepMerge(ref.current, patch)
    ref.current = next
    setPrefs(next)
    applyFormatPrefs(next)
    // Keep the gender context in sync too (symmetric with applyFormatPrefs) so any
    // update() path that changes design.gender takes effect without a manual call.
    // `next` is the full merged prefs, so this preserves the current gender on
    // unrelated updates rather than resetting it.
    setGenderContext(next.design?.gender)
    if (!loaded.current) {
      early.current = deepMerge(early.current, patch)
      return undefined
    }
    return persist()
  }, [persist])

  const value = useMemo(() => ({ prefs, update, status, reload: load }), [prefs, update, status, load])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export const usePreferences = () => useContext(PreferencesContext)

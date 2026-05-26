import { useEffect } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { setCurrentCurrency } from '../lib/finance'

/* ════════════════════════════════════════════════════════════════
   PrefsApplier — one-way bridge from user_preferences to side-effects.
   ════════════════════════════════════════════════════════════════
   Mount-once inside AppShell. Watches the prefs blob and applies
   currency to lib/finance, theme to <html data-theme>, and text size
   to <html data-text-size>. Renders nothing — purely side-effects.
   ════════════════════════════════════════════════════════════════ */
export default function PrefsApplier() {
  const { prefs } = useUserPreferences()

  /* Currency → lib/finance */
  useEffect(() => {
    if (prefs?.format?.currency) setCurrentCurrency(prefs.format.currency)
  }, [prefs?.format?.currency])

  /* Theme → <html data-theme>. Mirrored to localStorage so a refresh
     before prefs load shows the right theme. */
  useEffect(() => {
    if (!prefs?.design?.theme) return
    document.documentElement.setAttribute('data-theme', prefs.design.theme)
    try { localStorage.setItem('mg-theme', prefs.design.theme) } catch { /* noop */ }
  }, [prefs?.design?.theme])

  /* Text size → <html data-text-size> (CSS root variables react). */
  useEffect(() => {
    if (!prefs?.design?.text_size) return
    document.documentElement.setAttribute('data-text-size', prefs.design.text_size)
  }, [prefs?.design?.text_size])

  return null
}

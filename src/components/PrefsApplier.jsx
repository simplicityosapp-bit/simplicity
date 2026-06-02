import { useEffect } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { setCurrentCurrency } from '../lib/finance'
import { setDateTimeFormat } from '../lib/dates'

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

  /* Date + time format → lib/dates (drives fmtShortDate / fmtTime app-wide) */
  useEffect(() => {
    setDateTimeFormat({
      date_format: prefs?.format?.date_format,
      time_format: prefs?.format?.time_format,
    })
  }, [prefs?.format?.date_format, prefs?.format?.time_format])

  /* Theme → <html data-theme>. Mirrored to localStorage so a refresh
     before prefs load shows the right theme. */
  useEffect(() => {
    if (!prefs?.design?.theme) return
    document.documentElement.setAttribute('data-theme', prefs.design.theme)
    try { localStorage.setItem('mg-theme', prefs.design.theme) } catch { /* noop */ }
  }, [prefs?.design?.theme])

  /* Text size → <html data-text-size> (CSS root variables react).
     Mirrored to localStorage so the pre-React inline script in
     index.html can restore it on the very first paint. */
  useEffect(() => {
    if (!prefs?.design?.text_size) return
    document.documentElement.setAttribute('data-text-size', prefs.design.text_size)
    try { localStorage.setItem('mg-text-size', prefs.design.text_size) } catch { /* noop */ }
  }, [prefs?.design?.text_size])

  return null
}

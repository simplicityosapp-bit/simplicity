import { useEffect } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { setCurrentCurrency } from '../lib/finance'
import { setDateTimeFormat, setHebrewCalendar } from '../lib/dates'

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

  /* Hebrew calendar → lib/dates (drives the agenda formatWhen()) */
  useEffect(() => {
    setHebrewCalendar({
      enabled: prefs?.design?.hebrew_calendar,
      dual: prefs?.design?.hebrew_calendar_dual,
    })
  }, [prefs?.design?.hebrew_calendar, prefs?.design?.hebrew_calendar_dual])

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

  /* Background mode → <html data-bg>. 'nature' (default) has no matching CSS,
     so it keeps the per-screen photos; 'simple'/'blank' are handled by the
     [data-bg] rules in index.css. Mirrored to localStorage so the inline
     script in index.html restores it before first paint (no flash). */
  useEffect(() => {
    const bg = prefs?.design?.background || 'nature'
    document.documentElement.setAttribute('data-bg', bg)
    try { localStorage.setItem('mg-bg', bg) } catch { /* noop */ }
  }, [prefs?.design?.background])

  /* Global display (Settings → Widgets & Display) → <html> attributes.
     These used to live on .home-screen only, so the choice was invisible
     everywhere else. Promoted to the root so the --mg-card-* token + weight
     overrides in tokens.css reach every screen. Mirrored to localStorage for
     the index.html first-paint restore. The retired 'outlined' style folds
     back to 'frosted' for any pref saved before it was removed. */
  const g = prefs?.widgets?.global
  useEffect(() => {
    const raw = g?.cardStyle || 'frosted'
    const cardStyle = raw === 'outlined' ? 'frosted' : raw
    document.documentElement.setAttribute('data-card-style', cardStyle)
    try { localStorage.setItem('mg-card-style', cardStyle) } catch { /* noop */ }
  }, [g?.cardStyle])
  useEffect(() => {
    const strength = g?.textStrength || 'normal'
    document.documentElement.setAttribute('data-text-strength', strength)
    try { localStorage.setItem('mg-text-strength', strength) } catch { /* noop */ }
  }, [g?.textStrength])
  useEffect(() => {
    const density = g?.density || 'comfortable'
    document.documentElement.setAttribute('data-density', density)
    try { localStorage.setItem('mg-density', density) } catch { /* noop */ }
  }, [g?.density])

  return null
}

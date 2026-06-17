import { useTranslation } from 'react-i18next'
import { useUserPreferences } from '../hooks/useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useT — the app-wide translation hook (gender-aware).
   ════════════════════════════════════════════════════════════════
   Wraps react-i18next's `t` so the signed-in user's form of address
   (prefs.design.gender) is auto-applied as i18next `context`:

     const { t } = useT('auth')
     t('loggingIn')   // → loggingIn_male / loggingIn_female / loggingIn

   i18next falls back to the base (neutral) key when no gendered
   variant exists, so most keys need only one form. Pass an explicit
   { context } in opts to override. Pre-auth (no prefs provider) the
   gender is null → neutral, so login/landing screens work too.

   Mirrors the older addressUser() pattern (lib/address.js) but routed
   through i18next instead of inline {male,female,neutral} objects.
   ════════════════════════════════════════════════════════════════ */
export function useT(ns) {
  const { t, i18n } = useTranslation(ns)
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender || 'neutral'
  const ctx = gender === 'male' || gender === 'female' ? gender : undefined

  const tg = (key, opts) => t(key, ctx ? { context: ctx, ...opts } : opts)
  /* <Trans> reads the namespace + i18n off the `t` it's given. Our wrapper
     is a fresh function, so copy that metadata across — otherwise <Trans>
     falls back to the default ('common') namespace and renders raw keys. */
  tg.ns = t.ns
  tg.lng = t.lng
  tg.i18n = t.i18n

  return { t: tg, i18n, lang: i18n.language, gender }
}

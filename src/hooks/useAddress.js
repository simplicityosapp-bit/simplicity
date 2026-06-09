import { useUserPreferences } from './useUserPreferences'
import { addressUser } from '../lib/address'

/* ════════════════════════════════════════════════════════════════
   useAddress — the app-wide hook for gendered Hebrew copy.
   ════════════════════════════════════════════════════════════════
   Reads the signed-in user's form of address (prefs.design.gender)
   once and hands back a bound `addr()` so any component can write
   gendered copy without re-reading prefs or scattering ternaries:

     const { addr } = useAddress()
     <p>{addr({ male: 'ברוך הבא', female: 'ברוכה הבאה', neutral: 'ברוך/ה הבא/ה' })}</p>

   Returns:
     gender — 'male' | 'female' | 'neutral' (defaults 'neutral')
     addr(variants)  — addressUser bound to the current gender
     g               — short alias for addr (terse call sites)

   Onboarding step 1 is the ONE exception: the gender is still being
   chosen there (live local state, not yet persisted), so that step
   calls addressUser(localGender, …) directly instead of this hook.
   ════════════════════════════════════════════════════════════════ */
export function useAddress() {
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender || 'neutral'
  const addr = (variants) => addressUser(gender, variants)
  /* The single most-repeated gendered phrase — the "נסה/י שוב" suffix on
     ~25 modal error fallbacks. Exposed here so call sites stay one-liners
     and the wording lives in ONE place (ready for i18n). */
  const tryAgain = addr({ male: 'נסה שוב', female: 'נסי שוב', neutral: 'נסה/י שוב' })
  return { gender, addr, g: addr, tryAgain }
}

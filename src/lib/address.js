/* ════════════════════════════════════════════════════════════════
   ADDRESS — gender-aware Hebrew copy helper.
   ════════════════════════════════════════════════════════════════
   `addressUser(genderPref, { male, female, neutral })` picks the
   right phrasing for the signed-in user.
     gender: 'male' | 'female' | 'neutral' (the prefs.design.gender)
     neutral falls back when the gender is unknown/neutral.
     If the requested variant is missing, the helper degrades:
       male/female missing → neutral
       neutral missing     → first non-empty of male, female.
   Lets us write copy like:
     addressUser(gender, {
       male: 'ברוך הבא',
       female: 'ברוכה הבאה',
       neutral: 'ברוך/ה הבא/ה',
     })
   without scattering ternaries through JSX.
   ════════════════════════════════════════════════════════════════ */

export function addressUser(gender, variants = {}) {
  const g = gender === 'male' || gender === 'female' ? gender : 'neutral'
  if (variants[g]) return variants[g]
  if (variants.neutral) return variants.neutral
  return variants.male || variants.female || ''
}

/* Common reusable phrasings — gathered here so any view can pull
   without re-typing the three variants. Add as needed; we keep this
   light on purpose. */
export const ADDRESS = {
  who_are_you:    { male: 'מי אתה?',     female: 'מי את?',      neutral: 'מי את/ה?' },
  welcome:        { male: 'ברוך הבא',     female: 'ברוכה הבאה',  neutral: 'ברוך/ה הבא/ה' },
  shall_we_meet:  { male: 'נכיר אותך?',   female: 'נכיר אותך?',   neutral: 'נכיר אותך?' },
  pick_one:       { male: 'בחר אחד',      female: 'בחרי אחת',    neutral: 'בחר/י' },
  you_chose:      { male: 'בחרת',         female: 'בחרת',        neutral: 'בחרת' },
  shall_we_skip:  { male: 'לדלג?',        female: 'לדלג?',       neutral: 'לדלג?' },
  next:           { male: 'הלאה',         female: 'הלאה',        neutral: 'הלאה' },
}

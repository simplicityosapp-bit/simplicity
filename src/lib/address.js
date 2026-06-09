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

/* ── Multi-Gender Hebrew auto-merge ──────────────────────────────────
   In NEUTRAL address we render the dual-gender glyph (Alef MultiGndr,
   see index.css) instead of a slash. Rather than hand-author a third
   spelling at every call site, we DERIVE it from the male/female forms
   already provided: find the single letter that differs between them
   (a suffix, or one mid-sentence letter) and swap it for the matching
   merge glyph. Mapping confirmed against the font's official cheat-sheet
   examples: +ה→U+05CC (את/אתה), +ת→U+05CD (לומד/לומדת), +י→U+05CA
   (שיפט+י). Anything not reducible to a single added letter (e.g.
   תרצה/תרצי, הוסף/הוסיפי) returns null → caller keeps the slash form. */
const MERGE_GLYPH = {
  'ה': '׌', // ה → ׌
  'ת': '׍', // ת → ׍
  'י': '׊', // י → ׊
}
export function toMultiGender(male, female) {
  if (!male || !female || male === female) return null
  let a = 0
  while (a < male.length && a < female.length && male[a] === female[a]) a++
  let b = 0
  while (b < male.length - a && b < female.length - a
    && male[male.length - 1 - b] === female[female.length - 1 - b]) b++
  const mMid = male.slice(a, male.length - b)
  const fMid = female.slice(a, female.length - b)
  let glyph = null
  if (mMid === '' && fMid.length === 1) glyph = MERGE_GLYPH[fMid]       // female adds a letter
  else if (fMid === '' && mMid.length === 1) glyph = MERGE_GLYPH[mMid]  // male adds a letter (את/אתה)
  if (!glyph) return null
  return male.slice(0, a) + glyph + (b ? male.slice(male.length - b) : '')
}

export function addressUser(gender, variants = {}) {
  const g = gender === 'male' || gender === 'female' ? gender : 'neutral'
  if (g !== 'neutral' && variants[g]) return variants[g]
  /* neutral: prefer the auto-derived dual-gender glyph, else the slash. */
  if (g === 'neutral') return toMultiGender(variants.male, variants.female) || variants.neutral || variants.male || variants.female || ''
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

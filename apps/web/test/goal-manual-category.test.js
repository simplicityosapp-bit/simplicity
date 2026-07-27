/* ════════════════════════════════════════════════════════════════
   GOALS — one manual bucket, not one per screen.
   ════════════════════════════════════════════════════════════════
   "Not one of the auto metrics" is a single idea, but two screens each
   built their own home for it: the goals screen created a category keyed
   'other' named "אחר", and onboarding created a separate, unkeyed one
   named "אישי". A user who set a personal goal during onboarding and
   another manual goal later ended up with two identical-looking groups on
   their board, and neither name followed their language.

   Both now resolve through findManualCategory(). The matching ORDER is
   the whole point: key first, then the two names WE used to write — so an
   account that already has either row keeps using it instead of growing a
   third — and never a category the user named themselves.

   The matcher is copied below rather than imported: lib/goalPresets
   registers an i18n resource bundle at module load, which this DOM-less
   suite can't construct. Same trade the other tests here make (see
   empty-states.test.js) — the conditions are what's worth pinning.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'

/* ── copied from lib/goalPresets.js ─────────────────────────────── */
const MANUAL_CATEGORY_KEY = 'other'
const LEGACY_MANUAL_NAMES = ['אחר', 'אישי']

const findManualCategory = (categories) =>
  (categories || []).find((c) => c.key === MANUAL_CATEGORY_KEY)
  || (categories || []).find((c) => !c.key && !c.builtin && c.measurement_type === 'manual' && LEGACY_MANUAL_NAMES.includes(c.name))
  || null
/* ───────────────────────────────────────────────────────────────── */

const cat = (over) => ({ id: 'c1', key: null, name: '', builtin: false, measurement_type: 'manual', ...over })

describe('findManualCategory', () => {
  it('finds the bucket by key, ignoring the auto categories around it', () => {
    const rows = [cat({ id: 'auto', key: 'income', measurement_type: 'auto', builtin: true }), cat({ id: 'mine', key: MANUAL_CATEGORY_KEY, name: 'Other' })]
    expect(findManualCategory(rows)?.id).toBe('mine')
  })

  it("adopts the goals screen's pre-unification row", () => {
    expect(findManualCategory([cat({ id: 'legacy', name: 'אחר' })])?.id).toBe('legacy')
  })

  it("adopts onboarding's pre-unification row", () => {
    expect(findManualCategory([cat({ id: 'legacy', name: 'אישי' })])?.id).toBe('legacy')
  })

  it('prefers the keyed row when an account has both', () => {
    const rows = [cat({ id: 'legacy', name: 'אישי' }), cat({ id: 'keyed', key: MANUAL_CATEGORY_KEY, name: 'אחר' })]
    expect(findManualCategory(rows)?.id).toBe('keyed')
  })

  it("leaves the user's own manual categories alone", () => {
    /* A manual category the user named themselves is theirs, not our bucket —
       claiming it would file every future manual goal under their heading. */
    expect(findManualCategory([cat({ id: 'theirs', name: 'ריצה' })])).toBeNull()
    expect(findManualCategory([cat({ id: 'theirs', name: 'Running' })])).toBeNull()
  })

  it('does not claim an auto or builtin category that happens to share the name', () => {
    expect(findManualCategory([cat({ id: 'auto', name: 'אחר', measurement_type: 'auto' })])).toBeNull()
    expect(findManualCategory([cat({ id: 'builtin', name: 'אחר', builtin: true })])).toBeNull()
  })

  it('returns null for an empty or missing list, so the caller creates one', () => {
    expect(findManualCategory([])).toBeNull()
    expect(findManualCategory(undefined)).toBeNull()
  })
})

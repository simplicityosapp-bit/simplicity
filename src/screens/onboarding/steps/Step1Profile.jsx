import { useState, useEffect } from 'react'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { ROLE_LABELS } from '../../../lib/preferences'

const ROLES = [
  { k: 'coach',       l: 'מאמן/ת' },
  { k: 'therapist',   l: 'מטפל/ת' },
  { k: 'facilitator', l: 'מנחה' },
  { k: 'instructor',  l: 'יועץ/ת' },
  { k: 'other',       l: 'אחר' },
]

/* Step 1 — name + role. Writes directly to prefs.profile (same place
   the settings screen reads from) so the data is immediately useful
   elsewhere in the app, even if the user later skips remaining steps. */
export default function Step1Profile({ ob }) {
  const { prefs, update } = useUserPreferences()
  const initial = ob.state.answers?.profile || {}
  const [name, setName] = useState(initial.name || prefs?.profile?.full_name || '')
  const [role, setRole] = useState(initial.role || prefs?.profile?.role || null)
  const canAdvance = name.trim().length > 0

  useEffect(() => { ob.markStarted() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onNext = async () => {
    /* Persist into both the live profile prefs AND the onboarding
       answers record (the latter is the resume-after-close source). */
    await update({ profile: { full_name: name.trim(), role: role || 'other' } })
    await ob.setAnswers('profile', { name: name.trim(), role: role || 'other' })
    await ob.advance()
  }

  return (
    <>
      <p className="ob-intro">ברוך/ה הבא/ה. נכיר אותך?</p>
      <p className="ob-intro-sub">לאורך כל ההכרות אפשר לדלג ולהשלים אחר כך — שום דבר לא נעול.</p>

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-name">שם מלא</label>
        <input
          id="ob-name"
          className="ob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="איך לקרוא לך?"
          autoFocus
        />
      </div>

      <div className="ob-field">
        <p className="ob-label">תחום</p>
        <div className="ob-pills">
          {ROLES.map((r) => (
            <button
              key={r.k}
              type="button"
              className={`ob-pill${role === r.k ? ' on' : ''}`}
              onClick={() => setRole(r.k)}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance}
          title={canAdvance ? '' : 'נא להזין שם'}
        >
          הלאה
        </button>
      </div>
    </>
  )
}

/* eslint-disable-next-line no-unused-vars */
const _roleLabels = ROLE_LABELS /* kept for future role-aware copy */

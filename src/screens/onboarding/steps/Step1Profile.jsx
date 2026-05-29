import { useState, useEffect } from 'react'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { addressUser } from '../../../lib/address'

const ROLES = [
  { k: 'coach',       l: 'מאמן/ת' },
  { k: 'therapist',   l: 'מטפל/ת' },
  { k: 'facilitator', l: 'מנחה' },
  { k: 'instructor',  l: 'יועץ/ת' },
  { k: 'other',       l: 'אחר' },
]

const GENDERS = [
  { k: 'female',  l: 'נקבה' },
  { k: 'male',    l: 'זכר' },
  { k: 'neutral', l: 'נייטרלי' },
]

/* Step 1 — name + gender + role. Writes directly to prefs (profile +
   design.gender) so the data is immediately useful elsewhere. Picking
   "אחר" opens a second input panel for the custom role text. */
export default function Step1Profile({ ob }) {
  const { prefs, update } = useUserPreferences()
  const initial = ob.state.answers?.profile || {}
  const [name, setName] = useState(initial.name || prefs?.profile?.full_name || '')
  const [role, setRole] = useState(initial.role || prefs?.profile?.role || null)
  const [roleOther, setRoleOther] = useState(initial.role_other || prefs?.profile?.role_other || '')
  const [gender, setGender] = useState(initial.gender || prefs?.design?.gender || 'neutral')
  const canAdvance = name.trim().length > 0 && (role !== 'other' || roleOther.trim().length > 0)

  useEffect(() => { ob.markStarted() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const intro = addressUser(gender, {
    male: 'ברוך הבא. נכיר אותך?',
    female: 'ברוכה הבאה. נכיר אותך?',
    neutral: 'ברוך/ה הבא/ה. נכיר אותך?',
  })

  const onNext = async () => {
    await update({
      profile: {
        full_name: name.trim(),
        role: role || 'other',
        role_other: role === 'other' ? roleOther.trim() : '',
      },
      design: { gender },
    })
    await ob.setAnswers('profile', {
      name: name.trim(),
      role: role || 'other',
      role_other: role === 'other' ? roleOther.trim() : '',
      gender,
    })
    await ob.advance()
  }

  return (
    <>
      <p className="ob-intro">{intro}</p>
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
        <p className="ob-label">לשון פנייה</p>
        <div className="ob-pills">
          {GENDERS.map((g) => (
            <button
              key={g.k}
              type="button"
              className={`ob-pill${gender === g.k ? ' on' : ''}`}
              onClick={() => setGender(g.k)}
            >
              {g.l}
            </button>
          ))}
        </div>
        <p className="ob-empty-hint">משפיע על איך המערכת פונה אליך לאורך השימוש.</p>
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

      {role === 'other' && (
        <div className="ob-field ob-other-panel">
          <label className="ob-label" htmlFor="ob-role-other">פרט/י את התחום שלך</label>
          <input
            id="ob-role-other"
            className="ob-input"
            value={roleOther}
            onChange={(e) => setRoleOther(e.target.value)}
            placeholder="לדוגמה: יוגה תרפיסט/ית, מורה למתמטיקה"
            autoFocus
          />
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {!canAdvance && (
          <p className="ob-empty-hint">
            {!name.trim() ? 'נא להזין שם כדי להמשיך.' : 'פרט/י את התחום שבחרת.'}
          </p>
        )}
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance}
        >
          הלאה
        </button>
      </div>
    </>
  )
}

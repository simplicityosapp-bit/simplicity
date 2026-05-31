import { useState, useEffect } from 'react'
import { useUserPreferences } from '../../../hooks/useUserPreferences'

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

/* Step 1 — name + gender (side-by-side) + role + optional "other" panel.
   Writes directly to prefs.profile + prefs.design.gender so the data
   is immediately useful elsewhere in the app. Picking "אחר" opens a
   sub-panel for the custom role text. */
export default function Step1Profile({ ob, setCTA }) {
  const { prefs, update } = useUserPreferences()
  const initial = ob.state.answers?.profile || {}
  const [name, setName] = useState(initial.name || prefs?.profile?.full_name || '')
  const [role, setRole] = useState(initial.role || prefs?.profile?.role || null)
  const [roleOther, setRoleOther] = useState(initial.role_other || prefs?.profile?.role_other || '')
  const [gender, setGender] = useState(initial.gender || prefs?.design?.gender || 'neutral')
  const canAdvance = name.trim().length > 0 && (role !== 'other' || roleOther.trim().length > 0)
  const hint = !canAdvance
    ? (!name.trim() ? 'נא להזין שם כדי להמשיך.' : 'פרט/י את התחום שבחרת.')
    : null

  /* Warm welcome line, gendered by the chosen form of address — updates
     live as the user toggles the לשון פנייה pills. */
  const welcomeGreeting = gender === 'male'
    ? 'ברוך הבא מלך'
    : gender === 'female'
      ? 'ברוכה הבאה מלכה'
      : 'כמה טוב שבאת'

  useEffect(() => { ob.markStarted() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  /* Push the latest CTA state up to the shell so the footer's "הלאה"
     stays in sync with the form. Deps cover every input that affects
     canAdvance / onNext closure. */
  useEffect(() => {
    setCTA({ onNext, canAdvance, busy: false, hint })
  }, [name, role, roleOther, gender, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <p className="ob-intro-sub">{welcomeGreeting}</p>

      <div className="ob-field-row">
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
        </div>
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
    </>
  )
}

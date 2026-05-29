import { useState } from 'react'
import { useProjects } from '../../../hooks/useProjects'
import { useGroups } from '../../../hooks/useGroups'

const COLORS = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const DAYS = [
  { k: 0, l: 'ראשון' }, { k: 1, l: 'שני' }, { k: 2, l: 'שלישי' },
  { k: 3, l: 'רביעי' }, { k: 4, l: 'חמישי' }, { k: 5, l: 'שישי' }, { k: 6, l: 'שבת' },
]

/* Step 3 — first project (always) + optional first group split.
   If user answers "yes" to groups, the form expands to collect the
   first group's tuition + schedule. Both project and group rows are
   created via the live hooks so they're real entities, not drafts. */
export default function Step3Projects({ ob }) {
  const { projects, addProject } = useProjects()
  const { addGroup } = useGroups()
  const initial = ob.state.answers?.projects || {}
  const [name, setName] = useState(initial.name || '')
  const [color, setColor] = useState(initial.color || COLORS[0])
  const [groupMode, setGroupMode] = useState(initial.group_mode) // null | true | false
  /* Group fields (only used when groupMode === true) */
  const [gName, setGName] = useState(initial.group_name || '')
  const [gPrice, setGPrice] = useState(initial.group_price || '')
  const [gSessions, setGSessions] = useState(initial.group_sessions || 6)
  const [gDay, setGDay] = useState(initial.group_day ?? '')
  const [gTime, setGTime] = useState(initial.group_time || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canAdvance = name.trim().length > 0 && (groupMode === false || (groupMode === true && gName.trim().length > 0 && Number(gPrice) > 0))

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const createdProject = await addProject({ name: name.trim(), color })
      const createdIds = [createdProject.id]
      let groupId = null
      if (groupMode === true) {
        const grp = await addGroup({
          project_id: createdProject.id,
          name: gName.trim(),
          color,
          package_price: Number(gPrice),
          package_sessions: Number(gSessions) || 1,
          recurring_day: gDay === '' ? null : Number(gDay),
          recurring_time: gTime || null,
          status: 'active',
        })
        groupId = grp.id
      }
      await ob.setAnswers('projects', {
        name: name.trim(),
        color,
        group_mode: groupMode === true,
        created_ids: createdIds,
        group_id: groupId,
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  const existingHint = projects?.length > 0
  return (
    <>
      <p className="ob-intro">בוא/י נבנה את הפרויקט הראשון.</p>
      <p className="ob-intro-sub">פרויקט הוא ההקשר הרחב — כמו "אימון אישי" או "סדנאות". לקוחות חיים בתוך פרויקט.</p>

      {existingHint && (
        <div className="ob-pre-fill-banner">
          כבר יש לך {projects.length} פרויקטים. ההוספה כאן רק יוצרת אחד נוסף.
        </div>
      )}

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-p-name">שם הפרויקט</label>
        <input
          id="ob-p-name"
          className="ob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: אימון אישי"
          autoFocus
        />
      </div>

      <div className="ob-field">
        <p className="ob-label">צבע</p>
        <div className="ob-color-row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`ob-color-swatch${color === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="ob-field">
        <p className="ob-label">עובד/ת גם עם קבוצות?</p>
        <div className="ob-card-options">
          <button
            type="button"
            className={`ob-option-card${groupMode === false ? ' on' : ''}`}
            onClick={() => setGroupMode(false)}
          >
            <span className="ob-option-card-l">לא, רק 1:1</span>
            <p className="ob-option-card-sub">ממשיכים ללקוח הראשון.</p>
          </button>
          <button
            type="button"
            className={`ob-option-card${groupMode === true ? ' on' : ''}`}
            onClick={() => setGroupMode(true)}
          >
            <span className="ob-option-card-l">כן, יש לי קבוצות</span>
            <p className="ob-option-card-sub">נוסיף קבוצה ראשונה עם חבילה ולוז.</p>
          </button>
        </div>
      </div>

      {groupMode === true && (
        <>
          <div className="ob-field">
            <label className="ob-label" htmlFor="ob-g-name">שם הקבוצה הראשונה</label>
            <input
              id="ob-g-name"
              className="ob-input"
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="לדוגמה: סדנת בוקר"
            />
          </div>
          <div className="ob-step-grid">
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-price">מחיר חבילה ₪</label>
              <input
                id="ob-g-price"
                className="ob-input"
                type="number"
                min="0"
                value={gPrice}
                onChange={(e) => setGPrice(e.target.value)}
              />
            </div>
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-sess">מספר מפגשים</label>
              <input
                id="ob-g-sess"
                className="ob-input"
                type="number"
                min="1"
                value={gSessions}
                onChange={(e) => setGSessions(e.target.value)}
              />
            </div>
          </div>
          <div className="ob-step-grid">
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-day">יום קבוע (אופציונלי)</label>
              <select
                id="ob-g-day"
                className="ob-select"
                value={gDay}
                onChange={(e) => setGDay(e.target.value)}
              >
                <option value="">ללא</option>
                {DAYS.map((d) => <option key={d.k} value={d.k}>{d.l}</option>)}
              </select>
            </div>
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-time">שעה (אופציונלי)</label>
              <input
                id="ob-g-time"
                className="ob-input"
                type="time"
                value={gTime}
                onChange={(e) => setGTime(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance || busy}
        >
          {busy ? 'שומר…' : 'הלאה'}
        </button>
      </div>
    </>
  )
}

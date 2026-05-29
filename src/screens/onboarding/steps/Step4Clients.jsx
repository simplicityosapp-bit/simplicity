import { useMemo, useState } from 'react'
import { useClients } from '../../../hooks/useClients'
import { useProjects } from '../../../hooks/useProjects'

/* Step 4 — first client. Pre-fills the project select to the project
   the user just created (step 3), if any. When path A is active and
   the parsed_data later carries client suggestions, we could surface
   them as chips here — see open follow-ups. */
export default function Step4Clients({ ob }) {
  const { addClient, clients } = useClients()
  const { projects } = useProjects()
  const projectAnswers = ob.state.answers?.projects || {}
  const justCreatedProjectId = projectAnswers.created_ids?.[0]
  const defaultProjectId = justCreatedProjectId || projects[0]?.id || ''
  const initial = ob.state.answers?.clients || {}
  const [name, setName] = useState(initial.name || '')
  const [projectId, setProjectId] = useState(initial.project_id || defaultProjectId)
  const [sessions, setSessions] = useState(initial.sessions || '')
  const [price, setPrice] = useState(initial.price || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canAdvance = name.trim().length > 0
  const existingCount = useMemo(() => clients?.length || 0, [clients])

  /* Idempotent: if the user comes back and the name + project haven't
     changed, advance without creating a duplicate. */
  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const prevName = initial.name
      const sameAsBefore = prevName === name.trim() && initial.project_id === (projectId || null) && initial.created_ids?.length > 0
      let createdIds = initial.created_ids || []
      if (!sameAsBefore) {
        const row = await addClient({
          name: name.trim(),
          status: 'active',
          status_meta: 'active',
          project_id: projectId || null,
          group_id: null,
          sessions: Number(sessions) || 0,
          price_per_session: Number(price) || 0,
          total_override: null,
          has_custom_price: false,
          recurring_day: null,
          recurring_time: null,
          left_mid_process: false,
          phone: null,
          notes: null,
          notes_updated_at: null,
        })
        createdIds = [...createdIds, row.id]
      }
      await ob.setAnswers('clients', {
        name: name.trim(),
        project_id: projectId || null,
        sessions: Number(sessions) || 0,
        price,
        created_ids: createdIds,
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  const pathA = ob.state.parsed_data?.kind === 'csv'
  const suggestions = (pathA && Array.isArray(ob.state.parsed_data.clients)) ? ob.state.parsed_data.clients.slice(0, 12) : []

  const onPickSuggestion = (s) => {
    setName(s.name || '')
    if (s.sessions) setSessions(String(s.sessions))
    if (s.price_per_session) setPrice(String(s.price_per_session))
  }

  return (
    <>
      <p className="ob-intro">הוסף/י לקוח/ה ראשון/ה.</p>
      <p className="ob-intro-sub">לקוח הוא אדם אחד שאת/ה עובד/ת איתו. אפשר להוסיף עוד מאוחר יותר.</p>

      {pathA && suggestions.length > 0 && (
        <div className="ob-field">
          <p className="ob-label">מהקובץ שלך — בחר/י לקוח כדי למלא את השדות</p>
          <div className="ob-pills">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`ob-pill${name === s.name ? ' on' : ''}`}
                onClick={() => onPickSuggestion(s)}
                title={s.email || s.phone || ''}
              >
                {s.name}
              </button>
            ))}
          </div>
          {ob.state.parsed_data.clients.length > suggestions.length && (
            <p className="ob-empty-hint">
              עוד {ob.state.parsed_data.clients.length - suggestions.length} לקוחות מחכים — נוסיף את כולם אחרי שתסיים/י את ההכרות.
            </p>
          )}
        </div>
      )}

      {existingCount > 0 && (
        <div className="ob-pre-fill-banner">כבר יש לך {existingCount} לקוחות במערכת.</div>
      )}

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-c-name">שם</label>
        <input
          id="ob-c-name"
          className="ob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: דנה כהן"
          autoFocus
        />
      </div>

      {projects.length > 0 && (
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-c-proj">פרויקט</label>
          <select
            id="ob-c-proj"
            className="ob-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">בלי פרויקט</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div className="ob-step-grid">
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-c-sess">חבילת פגישות (אופציונלי)</label>
          <input
            id="ob-c-sess"
            className="ob-input"
            type="number"
            min="0"
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
          />
        </div>
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-c-price">מחיר לפגישה ₪</label>
          <input
            id="ob-c-price"
            className="ob-input"
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {!canAdvance && <p className="ob-empty-hint">שם הלקוח חובה.</p>}
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

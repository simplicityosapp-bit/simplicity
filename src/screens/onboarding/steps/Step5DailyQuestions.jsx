import { useState } from 'react'
import { useUserQuestions } from '../../../hooks/useUserQuestions'

/* The 6 starter presets the spec calls out. They are stored with a
   `template_key` so future analytics can compare across users.
   Custom (user-typed) questions get template_key=null + custom_text. */
const PRESETS = [
  { key: 'nutrition', icon: '🥗', text: 'איך אכלת היום?' },
  { key: 'sleep',     icon: '🌙', text: 'איך ישנת אתמול?' },
  { key: 'movement',  icon: '🏃', text: 'כמה תנועה היה לך היום?' },
  { key: 'quiet',     icon: '🫧', text: 'כמה שקט מצאת היום?' },
  { key: 'joy',       icon: '✨', text: 'מה שמח אותך היום?' },
  { key: 'mood',      icon: '🤍', text: 'איך מצב הרוח שלך היום?' },
]

/* Step 5 — daily questions. Multi-select from 6 preset chips + an
   optional custom (reflective) question. Each selected preset becomes
   a real user_questions row (active=true, scale 1-10). The custom
   one is yes_no by default since it's textual reflection. */
export default function Step5DailyQuestions({ ob }) {
  const { addQuestion } = useUserQuestions()
  const initial = ob.state.answers?.daily_questions || {}
  const [picked, setPicked] = useState(initial.preset_keys || [])
  const [custom, setCustom] = useState(initial.custom_text || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const canAdvance = picked.length > 0 || custom.trim().length > 0

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const ids = []
      for (const k of picked) {
        // eslint-disable-next-line no-await-in-loop
        const row = await addQuestion({
          template_key: k,
          custom_text: null,
          scale_type: '1-10',
          icon: PRESETS.find((p) => p.key === k)?.icon || null,
          active: true,
          schedule_pattern: {},
        })
        ids.push(row.id)
      }
      if (custom.trim().length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const row = await addQuestion({
          template_key: null,
          custom_text: custom.trim(),
          scale_type: '1-10',
          icon: '✍️',
          active: true,
          schedule_pattern: {},
        })
        ids.push(row.id)
      }
      await ob.setAnswers('daily_questions', {
        preset_keys: picked,
        custom_text: custom.trim(),
        question_ids: ids,
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="ob-intro">איזו שאלה אחת תרצה/י לשמוע מעצמך בכל יום?</p>
      <p className="ob-intro-sub">בוחר/ים מההצעות שלנו, או מנסחים שלך. אפשר תמיד לערוך אחר כך.</p>

      <div className="ob-field">
        <p className="ob-label">הצעות (ניתן לנתח לאורך זמן)</p>
        <div className="ob-pills">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`ob-pill${picked.includes(p.key) ? ' on' : ''}`}
              onClick={() => toggle(p.key)}
              title={p.text}
            >
              <span style={{ marginInlineEnd: 4 }}>{p.icon}</span>
              {p.text}
            </button>
          ))}
        </div>
      </div>

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-q-custom">שאלה שלך (רפלקטיבית)</label>
        <input
          id="ob-q-custom"
          className="ob-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="לדוגמה: על מה הרגעת היום שעוד לא ראיתי?"
        />
        <p className="ob-empty-hint">שאלות מותאמות שלך = רפלקציה אישית, לא ננתח אותן אוטומטית.</p>
      </div>

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

import { useEffect, useState } from 'react'
import { useUserQuestions } from '../../../hooks/useUserQuestions'

/* 7 starter presets in the order the design spec defines. Each one
   is stored with a `template_key` so future analytics can compare
   across users. All presets use the 1-10 scale. The optional custom
   ("אחר") question is yes/no — used for binary habits like
   "יצירת תוכן" or "למדת היום?". */
const PRESETS = [
  { key: 'sleep',     icon: '🌙', text: 'איך ישנת אתמול?' },
  { key: 'nutrition', icon: '🥗', text: 'איך אכלת היום?' },
  { key: 'movement',  icon: '🏃', text: 'כמה תנועה היה לך היום?' },
  { key: 'mood',      icon: '🤍', text: 'איך מצב הרוח שלך היום?' },
  { key: 'focus',     icon: '🎯', text: 'כמה ממוקד/ת הרגשת היום?' },
  { key: 'joy',       icon: '✨', text: 'מה שמח אותך היום?' },
  { key: 'quiet',     icon: '🫧', text: 'כמה שקט מצאת היום?' },
]

/* Step 5 — daily questions. Multi-select from 7 preset chips + an
   optional custom yes/no question ("אחר"). Each selected preset
   becomes a real user_questions row (active=true, scale 1-10). The
   custom one is yes_no — binary daily habits live there. */
export default function Step5DailyQuestions({ ob, setCTA }) {
  const { addQuestion } = useUserQuestions()
  const initial = ob.state.answers?.daily_questions || {}
  const [picked, setPicked] = useState(initial.preset_keys || [])
  const [custom, setCustom] = useState(initial.custom_text || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const canAdvance = picked.length > 0 || custom.trim().length > 0
  const hint = !canAdvance ? 'בחר/י שאלה אחת לפחות (מהצעות או מותאמת).' : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [picked, custom, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      /* Idempotent: skip recreate if selection identical to prior pass. */
      const prevKeys = initial.preset_keys || []
      const sameKeys = prevKeys.length === picked.length && prevKeys.every((k) => picked.includes(k))
      const sameCustom = (initial.custom_text || '') === custom.trim()
      if (sameKeys && sameCustom && (initial.question_ids?.length || 0) > 0) {
        await ob.advance()
        return
      }
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
          /* "אחר" lives at the yes/no end of the daily-habits spectrum
             — binary "did I do this today?" items. */
          scale_type: 'yes_no',
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
        <label className="ob-label" htmlFor="ob-q-custom">אחר (שאלת כן/לא)</label>
        <input
          id="ob-q-custom"
          className="ob-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="לדוגמה: יצרת תוכן היום? למדת היום?"
        />
        <p className="ob-empty-hint">שאלות כן/לא — מותאמות לך אישית.</p>
      </div>

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

    </>
  )
}

import { useEffect, useState } from 'react'
import { useUserQuestions } from '../../../hooks/useUserQuestions'

/* 6 starter presets in the order the design spec defines. Each one
   is stored with a `template_key` so future analytics can compare
   across users. All presets use the 1-10 scale. The optional custom
   ("אחר") question matches Settings → AddQuestionModal's custom mode
   exactly — text + scale (1-10 / yes-no) + icon picker — so the
   onboarding flow stays faithful to the in-app creation surface.
   NOTE: "joy / מה שמח אותך היום?" lived here briefly but was pulled
   because the phrasing invites a free-text answer and we don't ship
   free_text scoring yet. */
const PRESETS = [
  { key: 'sleep',     icon: '🌙', text: 'איך ישנת אתמול?' },
  { key: 'nutrition', icon: '🥗', text: 'איך אכלת היום?' },
  { key: 'movement',  icon: '🏃', text: 'כמה תנועה היה לך היום?' },
  { key: 'mood',      icon: '🤍', text: 'איך מצב הרוח שלך היום?' },
  { key: 'focus',     icon: '🎯', text: 'כמה ממוקד/ת הרגשת היום?' },
  { key: 'quiet',     icon: '🫧', text: 'כמה שקט מצאת היום?' },
]

/* Mirror AddQuestionModal — same scales + same icon palette so the
   user gets the same affordances they'll see later under Settings. */
const SCALES = [
  { k: '1-10',  l: 'סולם 1–10' },
  { k: 'yes_no', l: 'כן / לא' },
]
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* Step 5 — daily questions. Multi-select from 6 preset chips + an
   optional fully-configurable custom question ("אחר"). Each selected
   preset becomes a real user_questions row (active=true, scale 1-10).
   The custom slot saves with the user-chosen scale + icon. */
export default function Step5DailyQuestions({ ob, setCTA }) {
  const { addQuestion } = useUserQuestions()
  const initial = ob.state.answers?.daily_questions || {}
  const [picked, setPicked] = useState(initial.preset_keys || [])
  const [custom, setCustom] = useState(initial.custom_text || '')
  const [customScale, setCustomScale] = useState(initial.custom_scale || '1-10')
  const [customIcon, setCustomIcon] = useState(initial.custom_icon || ICONS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const canAdvance = picked.length > 0 || custom.trim().length > 0
  const hint = !canAdvance ? 'בחר/י שאלה אחת לפחות (מהצעות או מותאמת).' : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [picked, custom, customScale, customIcon, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      /* Idempotent: skip recreate if selection identical to prior pass. */
      const prevKeys = initial.preset_keys || []
      const sameKeys = prevKeys.length === picked.length && prevKeys.every((k) => picked.includes(k))
      const sameCustom = (initial.custom_text || '') === custom.trim()
        && (initial.custom_scale || '1-10') === customScale
        && (initial.custom_icon || ICONS[0]) === customIcon
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
          scale_type: customScale,
          icon: customIcon,
          active: true,
          schedule_pattern: {},
        })
        ids.push(row.id)
      }
      await ob.setAnswers('daily_questions', {
        preset_keys: picked,
        custom_text: custom.trim(),
        custom_scale: customScale,
        custom_icon: customIcon,
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

      {/* "אחר" — full custom-question creator, identical shape to
          AddQuestionModal's custom mode (text + scale + icon). */}
      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-q-custom">אחר — שאלה משלך</label>
        <input
          id="ob-q-custom"
          className="ob-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="לדוגמה: כמה רגוע/ה הרגשת היום?"
        />
      </div>

      {custom.trim().length > 0 && (
        <>
          <div className="ob-field">
            <p className="ob-label">סוג תשובה</p>
            <div className="ob-pills">
              {SCALES.map((s) => (
                <button
                  key={s.k}
                  type="button"
                  className={`ob-pill${customScale === s.k ? ' on' : ''}`}
                  onClick={() => setCustomScale(s.k)}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          <div className="ob-field">
            <p className="ob-label">אייקון</p>
            <div className="ob-pills">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={`ob-pill${customIcon === ic ? ' on' : ''}`}
                  onClick={() => setCustomIcon(ic)}
                  aria-label={`אייקון ${ic}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

    </>
  )
}

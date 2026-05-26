import { useState } from 'react'
import Modal from './Modal'
import { QUESTION_TEMPLATES, QTEXT } from '../lib/questionTemplates'

const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [
  { k: '1-10', l: 'סולם 1–10' },
  { k: 'yes_no', l: 'כן / לא' },
]

/* Add a daily question — from a ready template or custom (text + scale + icon).
   No questions are seeded; this is how the user builds their set. */
export default function AddQuestionModal({ open, onClose, onSave, nextOrder = 0 }) {
  const [mode, setMode] = useState('template')
  const [tmplKey, setTmplKey] = useState('')
  const [form, setForm] = useState({ text: '', scale_type: '1-10', icon: ICONS[0] })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setMode('template'); setTmplKey(''); setForm({ text: '', scale_type: '1-10', icon: ICONS[0] }); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    let row
    if (mode === 'template') {
      const t = QUESTION_TEMPLATES.find((x) => x.key === tmplKey)
      if (!t) { setErr('יש לבחור שאלה.'); return }
      row = { template_key: t.key, custom_text: null, scale_type: t.scale_type, icon: t.icon, active: true, order: nextOrder }
    } else {
      if (!form.text.trim()) { setErr('יש למלא שאלה.'); return }
      row = { template_key: null, custom_text: form.text.trim(), scale_type: form.scale_type, icon: form.icon, active: true, order: nextOrder }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(row)
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={close} title="שאלה יומית חדשה">
      <div className="m-field">
        <div className="m-pills">
          <button type="button" className={`m-pill${mode === 'template' ? ' on' : ''}`} onClick={() => { setMode('template'); setErr('') }}>תבנית מוכנה</button>
          <button type="button" className={`m-pill${mode === 'custom' ? ' on' : ''}`} onClick={() => { setMode('custom'); setErr('') }}>מותאם אישית</button>
        </div>
      </div>

      {mode === 'template' ? (
        <div className="m-field">
          <label className="m-label">בחר/י שאלה</label>
          <div className="q-tmpl-list">
            {QUESTION_TEMPLATES.map((t) => (
              <button key={t.key} type="button" className={`q-tmpl${tmplKey === t.key ? ' on' : ''}`} onClick={() => { setTmplKey(t.key); if (err) setErr('') }}>
                <span className="q-tmpl-ic">{t.icon}</span>
                <span className="q-tmpl-text">{QTEXT[t.key]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="m-field">
            <label className="m-label">השאלה</label>
            <input
              className={`m-input${err && !form.text.trim() ? ' err' : ''}`}
              value={form.text}
              onChange={(e) => { set('text', e.target.value); if (err) setErr('') }}
              placeholder="לדוגמה: כמה רגוע/ה הרגשת היום?"
            />
          </div>
          <div className="m-field">
            <label className="m-label">סוג תשובה</label>
            <div className="m-pills">
              {SCALES.map((s) => (
                <button key={s.k} type="button" className={`m-pill${form.scale_type === s.k ? ' on' : ''}`} onClick={() => set('scale_type', s.k)}>{s.l}</button>
              ))}
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">אייקון</label>
            <div className="m-pills">
              {ICONS.map((ic) => (
                <button key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}

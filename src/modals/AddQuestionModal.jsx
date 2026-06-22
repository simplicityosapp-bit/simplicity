import { useState } from 'react'
import Modal from './Modal'
import { QUESTION_TEMPLATES, qtext } from '../lib/questionTemplates'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useT } from '../i18n/useT'
import './AddQuestionModal.css'

const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [
  { k: '1-10', l: 'scaleRange' },
  { k: 'yes_no', l: 'scaleYesNo' },
]

/* Add a daily question — from a ready template or custom (text + scale + icon).
   No questions are seeded; this is how the user builds their set. */
export default function AddQuestionModal({ open, onClose, onSave, nextOrder = 0 }) {
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender
  const { t } = useT('modalsTask')
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
      const tmpl = QUESTION_TEMPLATES.find((x) => x.key === tmplKey)
      if (!tmpl) { setErr(t('question.questionRequired')); return }
      row = { template_key: tmpl.key, custom_text: null, scale_type: tmpl.scale_type, icon: tmpl.icon, active: true, order: nextOrder }
    } else {
      if (!form.text.trim()) { setErr(t('question.textRequired')); return }
      row = { template_key: null, custom_text: form.text.trim(), scale_type: form.scale_type, icon: form.icon, active: true, order: nextOrder }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(row)
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('question.title')}>
      <div className="m-field">
        <div className="m-pills">
          <button type="button" className={`m-pill${mode === 'template' ? ' on' : ''}`} onClick={() => { setMode('template'); setErr('') }}>{t('question.modeTemplate')}</button>
          <button type="button" className={`m-pill${mode === 'custom' ? ' on' : ''}`} onClick={() => { setMode('custom'); setErr('') }}>{t('question.modeCustom')}</button>
        </div>
      </div>

      {mode === 'template' ? (
        <div className="m-field">
          <label className="m-label">{t('question.pickQuestion')}</label>
          <div className="q-tmpl-list">
            {QUESTION_TEMPLATES.map((tmpl) => (
              <button key={tmpl.key} type="button" className={`q-tmpl${tmplKey === tmpl.key ? ' on' : ''}`} onClick={() => { setTmplKey(tmpl.key); if (err) setErr('') }}>
                <span className="q-tmpl-ic">{tmpl.icon}</span>
                <span className="q-tmpl-text">{qtext(tmpl.key, gender)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="m-field">
            <label className="m-label">{t('question.theQuestion')}</label>
            <input
              className={`m-input${err && !form.text.trim() ? ' err' : ''}`}
              value={form.text}
              onChange={(e) => { set('text', e.target.value); if (err) setErr('') }}
              placeholder={t('question.textPlaceholder')}
            />
          </div>
          <div className="m-field">
            <label className="m-label">{t('question.answerType')}</label>
            <div className="m-pills">
              {SCALES.map((s) => (
                <button key={s.k} type="button" className={`m-pill${form.scale_type === s.k ? ' on' : ''}`} onClick={() => set('scale_type', s.k)}>{t(`question.${s.l}`)}</button>
              ))}
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">{t('question.icon')}</label>
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
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import Modal from './Modal'
import { QUESTION_TEMPLATES, qtext } from '../lib/questionTemplates'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useT } from '../i18n/useT'
import './AddQuestionModal.css'
import { Box, Txt, Btn, Input } from '../components/ui'

const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [
  { k: '1-10', l: 'scaleRange' },
  { k: 'yes_no', l: 'scaleYesNo' },
]

/* Add a daily question — from a ready template or custom (text + scale + icon).
   No questions are seeded; this is how the user builds their set. */
export default function AddQuestionModal({ open, onClose, onSave, nextOrder = 0, usedTemplateKeys = [] }) {
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

  /* Only offer ready templates the user doesn't already have — once mood,
     sleep, etc. are added they drop off the list. When none are left the
     picker is custom-only (the template/custom toggle is hidden). */
  const availableTemplates = QUESTION_TEMPLATES.filter((tmpl) => !usedTemplateKeys.includes(tmpl.key))
  const onlyCustom = availableTemplates.length === 0
  const effMode = onlyCustom ? 'custom' : mode

  const submit = async () => {
    let row
    if (effMode === 'template') {
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
      {!onlyCustom && (
        <Box className="m-field">
          <Box className="m-pills">
            <Btn type="button" className={`m-pill${effMode === 'template' ? ' on' : ''}`} onClick={() => { setMode('template'); setErr('') }}>{t('question.modeTemplate')}</Btn>
            <Btn type="button" className={`m-pill${effMode === 'custom' ? ' on' : ''}`} onClick={() => { setMode('custom'); setErr('') }}>{t('question.modeCustom')}</Btn>
          </Box>
        </Box>
      )}

      {effMode === 'template' ? (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('question.pickQuestion')}</Box>
          <Box className="q-tmpl-list">
            {availableTemplates.map((tmpl) => (
              <Btn key={tmpl.key} type="button" className={`q-tmpl${tmplKey === tmpl.key ? ' on' : ''}`} onClick={() => { setTmplKey(tmpl.key); if (err) setErr('') }}>
                <Txt className="q-tmpl-ic">{tmpl.icon}</Txt>
                <Txt className="q-tmpl-text">{qtext(tmpl.key, gender)}</Txt>
              </Btn>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('question.theQuestion')}</Box>
            <Input
              className={`m-input${err && !form.text.trim() ? ' err' : ''}`}
              value={form.text}
              onChange={(e) => { set('text', e.target.value); if (err) setErr('') }}
              placeholder={t('question.textPlaceholder')}
            />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('question.answerType')}</Box>
            <Box className="m-pills">
              {SCALES.map((s) => (
                <Btn key={s.k} type="button" className={`m-pill${form.scale_type === s.k ? ' on' : ''}`} onClick={() => set('scale_type', s.k)}>{t(`question.${s.l}`)}</Btn>
              ))}
            </Box>
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('question.icon')}</Box>
            <Box className="m-pills">
              {ICONS.map((ic) => (
                <Btn key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</Btn>
              ))}
            </Box>
          </Box>
        </>
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}

import { useState } from 'react'
import Modal from './Modal'
import { qtext } from '@simplicity/core'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* Edit an existing daily question — text + icon only. scale_type is NOT
   editable on purpose: answers are stored against it, so flipping 1-10 ↔
   yes/no would corrupt the history/heatmap. Rewording a template question
   turns it into a custom one (its text is localized, so once edited it can
   no longer track the template); a template saved unchanged keeps tracking. */
export default function EditQuestionModal({ open, onClose, question, onSave }) {
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender
  const { t } = useT('modalsTask')
  /* The parent keys this modal on question.id, so it mounts fresh for each
     question — initial state can read straight from props, no sync effect. */
  const [text, setText] = useState(() => (question ? (question.custom_text || qtext(question.template_key, gender) || '') : ''))
  const [icon, setIcon] = useState(() => question?.icon || ICONS[0])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const isYn = question?.scale_type === 'yes_no'

  const submit = async () => {
    if (!question) return
    const v = text.trim()
    if (!v) { setErr(t('question.textRequired')); return }
    const sameAsTemplate = question.template_key && !question.custom_text
      && v === (qtext(question.template_key, gender) || '')
    const patch = sameAsTemplate
      ? { icon }
      : { custom_text: v, template_key: null, icon }
    setBusy(true)
    setErr('')
    try {
      await onSave(question.id, patch)
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('question.editTitle')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('question.theQuestion')}</Box>
        <Input
          className={`m-input${err && !text.trim() ? ' err' : ''}`}
          value={text}
          onChange={(e) => { setText(e.target.value); if (err) setErr('') }}
          placeholder={t('question.textPlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('question.icon')}</Box>
        <Box className="m-pills">
          {ICONS.map((ic) => (
            <Btn key={ic} type="button" className={`m-pill${icon === ic ? ' on' : ''}`} onClick={() => setIcon(ic)}>{ic}</Btn>
          ))}
        </Box>
      </Box>
      <Txt as="p" className="m-hint">{isYn ? t('question.scaleLockedYesNo') : t('question.scaleLockedRange')}</Txt>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}

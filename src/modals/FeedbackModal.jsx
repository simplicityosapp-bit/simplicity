import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useFeedback } from '../hooks/useFeedback'
import { useT } from '../i18n/useT'
import './FeedbackModal.css'

/* Feedback type — optional. Sent to the team so they can triage; the
   key is sent to the edge function which maps it to the email subject. */
const TYPES = ['bug', 'idea', 'praise', 'other']

/* ════════════════════════════════════════════════════════════════
   FeedbackModal — free-text feedback + optional type, emailed to the
   team and stored. Reuses the shared <Modal> shell.
   ════════════════════════════════════════════════════════════════ */
export default function FeedbackModal({ open, onClose }) {
  const { t } = useT('modalsSystem')
  const { submitFeedback, submitting } = useFeedback()
  const [message, setMessage] = useState('')
  const [type, setType] = useState(null)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const closeTimer = useRef(null)

  /* Clear the success auto-close timer if the modal unmounts within the 1.6s
     window, so reset()/onClose() never fire on an unmounted component. */
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const reset = () => { setMessage(''); setType(null); setDone(false); setFailed(false) }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim() || submitting) return
    const res = await submitFeedback(message, type)
    if (res.ok) {
      setDone(true)
      closeTimer.current = setTimeout(() => { reset(); onClose() }, 1600)
    } else {
      setFailed(true)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('feedback.title')}>
      {done ? (
        <div className="fb-done">
          <CheckCircle2 size={40} strokeWidth={1.5} aria-hidden="true" />
          <p>{t('feedback.thanks')}</p>
        </div>
      ) : (
        <form className="fb-form" onSubmit={handleSubmit}>
          <p className="fb-lead">{t('feedback.lead')}</p>

          <div className="fb-field">
            <span className="fb-label">{t('feedback.typeLabel')}</span>
            <div className="m-pills">
              {TYPES.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`m-pill${type === k ? ' on' : ''}`}
                  onClick={() => setType((cur) => (cur === k ? null : k))}
                >
                  {t(`feedback.types.${k}`)}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="fb-textarea m-textarea"
            value={message}
            onChange={(e) => { setMessage(e.target.value); setFailed(false) }}
            placeholder={t('feedback.placeholder', { write: t('feedback.writeVerb') })}
            rows={6}
            autoFocus
            dir="rtl"
          />
          <p className="fb-hint" style={{ fontSize: 'calc(13px * var(--text-scale))', opacity: 0.7, margin: '8px 2px 0', lineHeight: 1.5 }}>
            {t('feedback.privacyHint')}
          </p>
          {failed && (
            <p className="fb-error">{t('feedback.sendFailed')}</p>
          )}
          <button
            type="submit"
            className="fb-submit"
            disabled={!message.trim() || submitting}
          >
            {submitting ? (
              <><Loader2 size={18} strokeWidth={1.7} className="fb-spin" aria-hidden="true" /> {t('feedback.sending')}</>
            ) : (
              <><Send size={18} strokeWidth={1.7} aria-hidden="true" /> {t('feedback.send')}</>
            )}
          </button>
        </form>
      )}
    </Modal>
  )
}

import { useState } from 'react'
import { Send, Loader2, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useFeedback } from '../hooks/useFeedback'
import './FeedbackModal.css'

/* ════════════════════════════════════════════════════════════════
   FeedbackModal — free-text feedback, emailed to the team + stored.
   Reuses the shared <Modal> shell; body is a single textarea + send.
   ════════════════════════════════════════════════════════════════ */
export default function FeedbackModal({ open, onClose }) {
  const { submitFeedback, submitting } = useFeedback()
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)

  const reset = () => { setMessage(''); setDone(false); setFailed(false) }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim() || submitting) return
    const res = await submitFeedback(message)
    if (res.ok) {
      setDone(true)
      setTimeout(() => { reset(); onClose() }, 1600)
    } else {
      setFailed(true)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="דברו אלינו">
      {done ? (
        <div className="fb-done">
          <CheckCircle2 size={40} strokeWidth={1.5} aria-hidden="true" />
          <p>תודה! הפידבק נשלח.</p>
        </div>
      ) : (
        <form className="fb-form" onSubmit={handleSubmit}>
          <p className="fb-lead">נשמח לשמוע ממך — כל הערה עוזרת לנו לשפר.</p>
          <textarea
            className="fb-textarea m-textarea"
            value={message}
            onChange={(e) => { setMessage(e.target.value); setFailed(false) }}
            placeholder="כתבו לנו כל מה שעולה לכם לראש…"
            rows={6}
            autoFocus
            dir="rtl"
          />
          {failed && (
            <p className="fb-error">משהו השתבש בשליחה. אפשר לנסות שוב.</p>
          )}
          <button
            type="submit"
            className="fb-submit"
            disabled={!message.trim() || submitting}
          >
            {submitting ? (
              <><Loader2 size={18} strokeWidth={1.7} className="fb-spin" aria-hidden="true" /> שולח…</>
            ) : (
              <><Send size={18} strokeWidth={1.7} aria-hidden="true" /> שליחה</>
            )}
          </button>
        </form>
      )}
    </Modal>
  )
}

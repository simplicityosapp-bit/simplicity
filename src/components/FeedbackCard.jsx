import { MessageSquarePlus } from 'lucide-react'
import { useT } from '../i18n/useT'
import './FeedbackCard.css'

/* Subtle home-feed card inviting feedback. Opens the FeedbackModal
   via the handler threaded down from App → HomeScreen. */
export default function FeedbackCard({ onOpenFeedback }) {
  const { t } = useT('components')
  return (
    <button type="button" className="feedback-card" onClick={() => onOpenFeedback?.()}>
      <span className="feedback-card-icon" aria-hidden="true">
        <MessageSquarePlus size={20} strokeWidth={1.6} />
      </span>
      <span className="feedback-card-text">
        <span className="feedback-card-title">{t('feedback.title')}</span>
        <span className="feedback-card-sub">{t('feedback.sub')}</span>
      </span>
    </button>
  )
}

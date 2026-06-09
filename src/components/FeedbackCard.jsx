import { MessageSquarePlus } from 'lucide-react'
import './FeedbackCard.css'

/* Subtle home-feed card inviting feedback. Opens the FeedbackModal
   via the handler threaded down from App → HomeScreen. */
export default function FeedbackCard({ onOpenFeedback }) {
  return (
    <button type="button" className="feedback-card" onClick={() => onOpenFeedback?.()}>
      <span className="feedback-card-icon" aria-hidden="true">
        <MessageSquarePlus size={20} strokeWidth={1.6} />
      </span>
      <span className="feedback-card-text">
        <span className="feedback-card-title">יש לך משוב?</span>
        <span className="feedback-card-sub">מה עובד, מה חסר, ומה אפשר לשפר — דברו אלינו</span>
      </span>
    </button>
  )
}

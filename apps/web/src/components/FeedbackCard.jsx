import { MessageSquarePlus } from 'lucide-react'
import { useT } from '../i18n/useT'
import './FeedbackCard.css'
import { Txt, Btn } from './ui'

/* Subtle home-feed card inviting feedback. Opens the FeedbackModal
   via the handler threaded down from App → HomeScreen. */
export default function FeedbackCard({ onOpenFeedback }) {
  const { t } = useT('components')
  return (
    <Btn type="button" className="feedback-card" onClick={() => onOpenFeedback?.()}>
      <Txt className="feedback-card-icon" aria-hidden="true">
        <MessageSquarePlus size={17} strokeWidth={1.7} />
      </Txt>
      <Txt className="feedback-card-text">
        <Txt className="feedback-card-title">{t('feedback.title')}</Txt>
        <Txt className="feedback-card-sub">{t('feedback.sub')}</Txt>
      </Txt>
    </Btn>
  )
}

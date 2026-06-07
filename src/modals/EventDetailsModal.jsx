import { Check, X, CalendarDays, Clock } from 'lucide-react'
import Modal from './Modal'
import { formatWhen, fmtTime } from '../lib/dates'

/* Lightweight detail+action modal opened by tapping an event in any
   calendar view. Lives outside the view components so they can stay
   pure renderers. Actions wire to the parent's handlers — the
   parent decides whether confirming a meeting also touches linked
   transactions (we don't repeat that cascade here). */
export default function EventDetailsModal({ open, onClose, event, onConfirmMeeting, onSkipMeeting, onCompleteReminder, onRemoveReminder }) {
  if (!event) return <Modal open={open} onClose={onClose} title="פרטי אירוע" />

  const isMeeting = event.kind === 'meeting'
  const isCalendar = event.kind === 'calendar'
  const Icon = (isMeeting || isCalendar) ? CalendarDays : Clock
  const title = event.title || 'אירוע'

  const handle = (fn) => async () => {
    try { await fn(event) } finally { onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="פרטי אירוע">
      <div className="evt-detail-head">
        <span className={`evt-detail-icon ${event.kind}`}>
          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <div className="evt-detail-text">
          <p className="evt-detail-title">{title}</p>
          <p className="evt-detail-when">
            {formatWhen(event.when)}
            {event.allDay ? ' · כל היום' : (event.end ? `–${fmtTime(event.end)}` : '')}
          </p>
        </div>
      </div>

      {isMeeting && event.status === 'pending' && (
        <div className="evt-detail-row">
          <p className="evt-detail-question">האם הפגישה התקיימה?</p>
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onConfirmMeeting)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> כן
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={handle(onSkipMeeting)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> לא
            </button>
          </div>
        </div>
      )}

      {isMeeting && event.status === 'confirmed' && (
        <p className="evt-detail-status sage">הפגישה אושרה.</p>
      )}

      {isCalendar && (
        <p className="evt-detail-status">
          {(() => {
            const links = [event.clientName && `לקוח: ${event.clientName}`, event.projectName && `פרויקט: ${event.projectName}`].filter(Boolean)
            return links.length ? `${links.join(' · ')} · ` : ''
          })()}
          אירוע מ-Google Calendar (לקריאה בלבד).
        </p>
      )}

      {!isMeeting && !isCalendar && (
        <div className="evt-detail-row">
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onCompleteReminder)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> סמן כבוצע
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={handle(onRemoveReminder)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> מחק
            </button>
          </div>
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}

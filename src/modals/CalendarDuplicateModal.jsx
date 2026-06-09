import { CalendarClock, RefreshCw } from 'lucide-react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'
import './CalendarDuplicateModal.css'

const fmtTime = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
const fmtDay = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
}

/* Resolve calendar duplicates one by one. The user picks, per pair, whether
   to hide the app's recurring meeting or the synced Google event — we never
   auto-resolve and never delete from Google (one-way sync). Resolving a pair
   removes it from `duplicates` (re-derived by the parent), so the list shrinks
   live; when it empties we close. */
export default function CalendarDuplicateModal({ open, onClose, duplicates = [], onHideMeeting, onHideEvent }) {
  const { addr } = useAddress()
  return (
    <Modal open={open} onClose={onClose} title="כפילויות ביומן">
      <p className="m-sub">
        <CalendarClock size={15} strokeWidth={1.7} aria-hidden="true" />
        פגישות חוזרות שכבר קיימות כאירוע ביומן גוגל. {addr({ male: 'בחר מה להשאיר בכל אחת', female: 'בחרי מה להשאיר בכל אחת', neutral: 'בחר/י מה להשאיר בכל אחת' })}
      </p>

      {duplicates.length === 0 ? (
        <p className="cdup-empty">אין כרגע כפילויות לטיפול. 🎉</p>
      ) : (
        <div className="cdup-list">
          {duplicates.map((d) => (
            <div key={d.id} className="cdup-card">
              <div className="cdup-head">
                <span className="cdup-name">{d.subjectName}</span>
                <span className="cdup-when">{fmtDay(d.when)} · {fmtTime(d.when)}</span>
              </div>

              <div className="cdup-rows">
                <div className="cdup-row">
                  <span className="cdup-row-lbl">פגישה חוזרת (האפליקציה) · {fmtTime(d.meeting.scheduled_at)}</span>
                  <button type="button" className="cdup-btn" onClick={() => onHideMeeting(d)}>הסתר</button>
                </div>
                <div className="cdup-row">
                  <span className="cdup-row-lbl">
                    יומן גוגל: {d.event.title || 'אירוע'} · {fmtTime(d.event.start_time)}
                  </span>
                  <button type="button" className="cdup-btn" onClick={() => onHideEvent(d)}>הסתר</button>
                </div>
              </div>

              <p className="cdup-note">
                <RefreshCw size={11} strokeWidth={1.7} aria-hidden="true" />
                הסתרת אירוע גוגל עשויה לחזור בסנכרון הבא.
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>
          {duplicates.length === 0 ? 'סגירה' : 'אטפל בזה אחר כך'}
        </button>
      </div>
    </Modal>
  )
}

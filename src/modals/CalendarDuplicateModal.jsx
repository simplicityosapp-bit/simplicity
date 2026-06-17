import { CalendarClock, RefreshCw, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
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
  const { t } = useT('modalsTask')
  return (
    <Modal open={open} onClose={onClose} title={t('duplicate.title')}>
      <p className="m-sub">
        <CalendarClock size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('duplicate.intro')}
      </p>

      {duplicates.length === 0 ? (
        <p className="cdup-empty">
          <CheckCircle2 size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--sage)' }} />
          {t('duplicate.empty')}
        </p>
      ) : (
        <div className="cdup-list">
          {duplicates.map((d) => (
            <div key={d.id} className="cdup-card">
              <div className="cdup-head">
                <span className="cdup-name">{d.subjectName}</span>
                <span className="cdup-when">{t('duplicate.when', { day: fmtDay(d.when), time: fmtTime(d.when) })}</span>
              </div>

              <div className="cdup-rows">
                <div className="cdup-row">
                  <span className="cdup-row-lbl">{t('duplicate.rowMeeting', { time: fmtTime(d.meeting.scheduled_at) })}</span>
                  <button type="button" className="cdup-btn" onClick={() => onHideMeeting(d)}>{t('duplicate.hide')}</button>
                </div>
                <div className="cdup-row">
                  <span className="cdup-row-lbl">
                    {t('duplicate.rowEvent', { title: d.event.title || t('duplicate.eventFallback'), time: fmtTime(d.event.start_time) })}
                  </span>
                  <button type="button" className="cdup-btn" onClick={() => onHideEvent(d)}>{t('duplicate.hide')}</button>
                </div>
              </div>

              <p className="cdup-note">
                <RefreshCw size={11} strokeWidth={1.7} aria-hidden="true" />
                {t('duplicate.note')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>
          {duplicates.length === 0 ? t('duplicate.closeEmpty') : t('duplicate.closeLater')}
        </button>
      </div>
    </Modal>
  )
}

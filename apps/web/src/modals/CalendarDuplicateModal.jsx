import { CalendarClock, RefreshCw, CheckCircle2 } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import './CalendarDuplicateModal.css'
import { Box, Txt, Btn } from '../components/ui'

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
      <Txt as="p" className="m-sub">
        <CalendarClock size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('duplicate.intro')}
      </Txt>

      {duplicates.length === 0 ? (
        <Txt as="p" className="cdup-empty">
          <CheckCircle2 size={16} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--sage)' }} />
          {t('duplicate.empty')}
        </Txt>
      ) : (
        <Box className="cdup-list">
          {duplicates.map((d) => (
            <Box key={d.id} className="cdup-card">
              <Box className="cdup-head">
                <Txt className="cdup-name">{d.subjectName}</Txt>
                <Txt className="cdup-when">{t('duplicate.when', { day: fmtDay(d.when), time: fmtTime(d.when) })}</Txt>
              </Box>

              <Box className="cdup-rows">
                <Box className="cdup-row">
                  <Txt className="cdup-row-lbl">{t('duplicate.rowMeeting', { time: fmtTime(d.meeting.scheduled_at) })}</Txt>
                  <Btn type="button" className="cdup-btn" onClick={() => onHideMeeting(d)}>{t('duplicate.hide')}</Btn>
                </Box>
                <Box className="cdup-row">
                  <Txt className="cdup-row-lbl">
                    {t('duplicate.rowEvent', { title: d.event.title || t('duplicate.eventFallback'), time: fmtTime(d.event.start_time) })}
                  </Txt>
                  <Btn type="button" className="cdup-btn" onClick={() => onHideEvent(d)}>{t('duplicate.hide')}</Btn>
                </Box>
              </Box>

              <Txt as="p" className="cdup-note">
                <RefreshCw size={11} strokeWidth={1.7} aria-hidden="true" />
                {t('duplicate.note')}
              </Txt>
            </Box>
          ))}
        </Box>
      )}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>
          {duplicates.length === 0 ? t('duplicate.closeEmpty') : t('duplicate.closeLater')}
        </Btn>
      </Box>
    </Modal>
  )
}

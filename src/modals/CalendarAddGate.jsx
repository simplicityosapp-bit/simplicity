import { CalendarPlus, CheckSquare, Banknote, Clock } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'

/* The calendar "+ אירוע חדש" gate (D2): pick what to add. onPick gets the
   type key; the calendar opens the matching modal. The reminder hint is
   gender-aware (תגיד/תגידי) via the namespace's _male/_female variants. */
const OPTIONS = [
  { key: 'meeting', label: 'meetingLabel', hint: 'meetingHint', Icon: CalendarPlus },
  { key: 'reminder', label: 'reminderLabel', hint: 'reminderHint', Icon: Clock },
  { key: 'task', label: 'taskLabel', hint: 'taskHint', Icon: CheckSquare },
  { key: 'transaction', label: 'transactionLabel', hint: 'transactionHint', Icon: Banknote },
]
export default function CalendarAddGate({ open, onClose, onPick }) {
  const { t } = useT('modalsTask')
  return (
    <Modal open={open} onClose={onClose} title={t('addGate.title')}>
      <div className="cal-gate">
        {OPTIONS.map(({ key, label, hint, Icon }) => (
          <button key={key} type="button" className="cal-gate-opt" onClick={() => { onPick(key); onClose() }}>
            <span className="cal-gate-ic"><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="cal-gate-name">{t(`addGate.${label}`)}</span>
            <span className="cal-gate-hint">{t(`addGate.${hint}`)}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

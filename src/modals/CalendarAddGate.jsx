import { CalendarPlus, CheckSquare, Banknote, Clock } from 'lucide-react'
import Modal from './Modal'

/* The calendar "+ אירוע חדש" gate (D2): pick what to add. onPick gets the
   type key; the calendar opens the matching modal. */
const OPTIONS = [
  { key: 'meeting', label: 'פגישה ללקוח', hint: 'פגישה מתוכננת', Icon: CalendarPlus },
  { key: 'reminder', label: 'תזכורת', hint: 'משימה עם תאריך', Icon: Clock },
  { key: 'task', label: 'משימה', hint: 'משימה פתוחה', Icon: CheckSquare },
  { key: 'transaction', label: 'תנועה', hint: 'הכנסה או הוצאה', Icon: Banknote },
]

export default function CalendarAddGate({ open, onClose, onPick }) {
  return (
    <Modal open={open} onClose={onClose} title="אירוע חדש">
      <div className="cal-gate">
        {OPTIONS.map(({ key, label, hint, Icon }) => (
          <button key={key} type="button" className="cal-gate-opt" onClick={() => { onPick(key); onClose() }}>
            <span className="cal-gate-ic"><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="cal-gate-name">{label}</span>
            <span className="cal-gate-hint">{hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

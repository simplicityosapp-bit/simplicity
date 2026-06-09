import { CalendarPlus, CheckSquare, Banknote, Clock } from 'lucide-react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'

/* The calendar "+ אירוע חדש" gate (D2): pick what to add. onPick gets the
   type key; the calendar opens the matching modal. Hints are built per-render
   so the reminder hint can address the user (תגיד/תגידי, dual-gender in
   neutral) via addr(). */
export default function CalendarAddGate({ open, onClose, onPick }) {
  const { addr } = useAddress()
  const OPTIONS = [
    { key: 'meeting', label: 'פגישה ללקוח', hint: 'פגישה מתוכננת', Icon: CalendarPlus },
    { key: 'reminder', label: 'תזכורת', hint: `נזכיר לך מתי ש${addr({ male: 'תגיד', female: 'תגידי', neutral: 'תגיד/י' })}`, Icon: Clock },
    { key: 'task', label: 'משימה', hint: 'משימות שמחכות לך', Icon: CheckSquare },
    { key: 'transaction', label: 'תנועה', hint: 'הכנסה או הוצאה', Icon: Banknote },
  ]
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

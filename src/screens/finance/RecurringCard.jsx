import { Pencil, Trash2, Pause, Play } from 'lucide-react'
import { isr } from '../../lib/finance'
import { describeCadence } from '../../lib/recurring'

/* One row in the "תבניות חוזרות" section: the template's identity
   (desc + amount + cadence), an Active toggle (pause/play), and
   secondary edit/delete actions. Soft visual difference for paused
   templates so the user can see at a glance which series isn't
   generating right now. */
export default function RecurringCard({ template, onEdit, onDelete, onToggleActive }) {
  const isIncome = template.type === 'income'
  const sign = isIncome ? '+' : '−'
  const amount = `${sign}${isr(Math.abs(template.amount || 0))}`
  const cadence = describeCadence(template)
  const paused = !template.active

  return (
    <div className={`rec-card${paused ? ' paused' : ''}`}>
      <div className="rec-card-main">
        <p className="rec-card-desc">{template.desc || (isIncome ? 'הכנסה' : 'הוצאה')}</p>
        <p className="rec-card-meta">{cadence}{paused ? ' · מושהה' : ''}</p>
      </div>
      <p className={`rec-card-amount mono${isIncome ? ' income' : ' expense'}`}>{amount}</p>
      <div className="rec-card-actions">
        <button
          type="button"
          className="rec-card-btn"
          onClick={() => onToggleActive(template)}
          aria-label={paused ? 'הפעלה' : 'השהיה'}
          title={paused ? 'הפעלה' : 'השהיה'}
        >
          {paused
            ? <Play size={14} strokeWidth={1.6} aria-hidden="true" />
            : <Pause size={14} strokeWidth={1.6} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="rec-card-btn"
          onClick={() => onEdit(template)}
          aria-label="עריכה"
          title="עריכה"
        >
          <Pencil size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rec-card-btn rec-card-btn-danger"
          onClick={() => onDelete(template)}
          aria-label="מחיקה"
          title="מחיקה"
        >
          <Trash2 size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

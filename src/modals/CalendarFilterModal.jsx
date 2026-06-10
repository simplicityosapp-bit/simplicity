import Modal from './Modal'

/* "פילטר תצוגה" — toggles which event types appear in the calendar. Scoped
   to the kinds the app actually renders (the prototype also listed recurring
   income/expense + sessions; those aren't on the React calendar yet). The
   selection is persisted in prefs.calendarFilter by the parent. */
const OPTS = [
  { key: 'meeting',  label: 'פגישות',           sub: 'ממתינות ומאושרות' },
  { key: 'reminder', label: 'תזכורות',          sub: 'חד-פעמיות וחוזרות' },
  { key: 'calendar', label: 'אירועי יומן גוגל', sub: 'מסונכרנים' },
]

export default function CalendarFilterModal({ open, onClose, filter = {}, onChange }) {
  return (
    <Modal open={open} onClose={onClose} title="פילטר תצוגה">
      <p className="m-hint">בחר/י אילו סוגי אירועים יופיעו ביומן.</p>
      <div className="cal-filter-list">
        {OPTS.map((o) => (
          <label key={o.key} className="cal-filter-opt">
            <span className="cal-filter-opt-text">
              {o.label}
              <span className="cal-filter-opt-sub">{o.sub}</span>
            </span>
            <input
              type="checkbox"
              className="cal-filter-checkbox"
              checked={filter[o.key] !== false}
              onChange={(e) => onChange?.(o.key, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <div className="m-actions">
        <button type="button" className="m-btn-save" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}

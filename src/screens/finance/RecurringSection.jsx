import { Repeat } from 'lucide-react'
import RecurringCard from './RecurringCard'

/* Recurring-templates strip above the transaction list. Collapses to
   nothing when there are no templates — the "+ תבנית חדשה" CTA is
   always visible so the user has a clear entry point. */
export default function RecurringSection({ templates, onAdd, onEdit, onDelete, onToggleActive }) {
  const live = templates.filter((t) => !t.deleted_at)
  return (
    <section className="rec-section">
      <div className="rec-section-head">
        <span className="rec-section-title">
          <Repeat size={15} strokeWidth={1.5} aria-hidden="true" />
          תבניות חוזרות
          {live.length > 0 && <span className="rec-section-count mono">{live.length}</span>}
        </span>
        <button type="button" className="rec-section-add" onClick={onAdd}>
          + תבנית חדשה
        </button>
      </div>
      {live.length === 0 ? (
        <p className="rec-section-empty">אין תבניות חוזרות עדיין. הוספה תיצור תנועות ממתינות באופן אוטומטי בכל חודש או שבוע.</p>
      ) : (
        <div className="rec-section-list">
          {live.map((t) => (
            <RecurringCard
              key={t.id}
              template={t}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </section>
  )
}

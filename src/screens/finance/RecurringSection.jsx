import { Repeat } from 'lucide-react'
import RecurringCard from './RecurringCard'
import { useT } from '../../i18n/useT'

/* Recurring-templates strip above the transaction list. Collapses to
   nothing when there are no templates — the "+ תבנית חדשה" CTA is
   always visible so the user has a clear entry point. */
export default function RecurringSection({ templates, onAdd, onEdit, onDelete, onToggleActive }) {
  const { t } = useT('finance')
  const live = templates.filter((tpl) => !tpl.deleted_at)
  return (
    <section className="rec-section">
      <div className="rec-section-head">
        <span className="rec-section-title">
          <Repeat size={15} strokeWidth={1.5} aria-hidden="true" />
          {t('recurring.title')}
          {live.length > 0 && <span className="rec-section-count mono">{live.length}</span>}
        </span>
        <button type="button" className="rec-section-add" onClick={onAdd}>
          {t('recurring.add')}
        </button>
      </div>
      {live.length === 0 ? (
        <p className="rec-section-empty">{t('recurring.empty')}</p>
      ) : (
        <div className="rec-section-list">
          {live.map((tpl) => (
            <RecurringCard
              key={tpl.id}
              template={tpl}
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

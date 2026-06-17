import Modal from './Modal'
import { useT } from '../i18n/useT'

/* "פילטר תצוגה" — toggles which event types appear in the calendar. Scoped
   to the kinds the app actually renders (the prototype also listed recurring
   income/expense + sessions; those aren't on the React calendar yet). The
   selection is persisted in prefs.calendarFilter by the parent. */
const OPTS = [
  { key: 'meeting',      label: 'meetingLabel',  sub: 'meetingSub' },
  { key: 'reminder',     label: 'reminderLabel', sub: 'reminderSub' },
  { key: 'leadFollowup', label: 'followupLabel', sub: 'followupSub' },
  { key: 'calendar',     label: 'calendarLabel', sub: 'calendarSub' },
]

export default function CalendarFilterModal({ open, onClose, filter = {}, onChange }) {
  const { t } = useT('modalsTask')
  return (
    <Modal open={open} onClose={onClose} title={t('filter.title')}>
      <p className="m-hint">{t('filter.hint')}</p>
      <div className="cal-filter-list">
        {OPTS.map((o) => (
          <label key={o.key} className="cal-filter-opt">
            <span className="cal-filter-opt-text">
              {t(`filter.${o.label}`)}
              <span className="cal-filter-opt-sub">{t(`filter.${o.sub}`)}</span>
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
        <button type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Modal>
  )
}

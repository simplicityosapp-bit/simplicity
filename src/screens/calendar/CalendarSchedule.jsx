import { useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'
import { formatWhen } from '../../lib/dates'
import { useT } from '../../i18n/useT'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'

const PAGE = 30

/* The agenda list view (merged meetings + reminders + synced events, sorted).
   Paginates with "טען עוד" so a long horizon isn't silently truncated. The
   window only grows; a shrinking feed is handled by slice, and switching away
   from the agenda view remounts this and resets to the first page. */
export default function CalendarSchedule({ items, onSelect }) {
  const { t } = useT('calendar')
  const waMsg = useWhatsAppMessage()
  const [limit, setLimit] = useState(PAGE)

  if (!items.length) {
    return (
      <div className="empty">
        <p className="empty-text">{t('list.empty')}</p>
      </div>
    )
  }
  const shown = items.slice(0, limit)
  const remaining = items.length - shown.length
  return (
    <section className="cal-list">
      {shown.map((it) => (
        <div
          key={`${it.kind}-${it.id}-${+it.when}`}
          className="cal-item"
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(it)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(it) } }}
        >
          <span className={`cal-icon ${it.kind}`}>
            {it.kind === 'reminder'
              ? <Clock size={16} strokeWidth={1.6} aria-hidden="true" />
              : <CalendarDays size={16} strokeWidth={1.6} aria-hidden="true" />}
          </span>
          <div className="cal-body">
            <p className="cal-title">{it.title}</p>
            <p className="cal-when">{it.allDay ? t('allDay') : formatWhen(it.when)}{it.kind === 'calendar' && (it.clientName || it.projectName) ? ` · ${it.clientName || it.projectName}` : ''}</p>
          </div>
          {it.kind === 'meeting' && it.status === 'pending' && <span className="cal-tag">{t('tag.pending')}</span>}
          {it.kind === 'reminder' && <span className="cal-tag rem">{t('tag.reminder')}</span>}
          {it.kind === 'calendar' && <span className="cal-tag cal">{t('tag.calendar')}</span>}
          {it.whatsapp && (
            <WhatsAppButton phone={it.whatsapp.phone} message={waMsg(it.whatsapp.key, it.whatsapp.vars)} />
          )}
        </div>
      ))}
      {remaining > 0 && (
        <button type="button" className="cal-load-more" onClick={() => setLimit((n) => n + PAGE)}>
          {t('list.loadMore', { count: remaining })}
        </button>
      )}
    </section>
  )
}

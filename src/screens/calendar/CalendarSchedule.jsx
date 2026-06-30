import { useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'
import { formatWhen } from '../../lib/dates'
import { weekdayNamesShort } from '../../lib/calendar'
import { useT } from '../../i18n/useT'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'

const PAGE = 30

/* Context line for a calendar event: a booking shows its source page (+ type);
   otherwise the linked client / project / lead. */
function calContext(it) {
  if (it.kind !== 'calendar') return ''
  if (it.booking) {
    return [it.booking.pageName, it.booking.meetingTypeName].filter(Boolean).join(' · ')
  }
  return it.clientName || it.projectName || it.leadName || ''
}

/* The agenda list view (merged meetings + reminders + synced events, sorted).
   Paginates with "טען עוד" so a long horizon isn't silently truncated. The
   window only grows; a shrinking feed is handled by slice, and switching away
   from the agenda view remounts this and resets to the first page. */
export default function CalendarSchedule({ items, onSelect }) {
  const { t } = useT('calendar')
  const waMsg = useWhatsAppMessage()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [limit, setLimit] = useState(PAGE)

  if (!items.length) {
    return (
      <div className="empty">
        <p className="empty-text">{t('list.empty')}</p>
      </div>
    )
  }

  // Weekday show/hide chips — a coach can hide non-working days from the agenda.
  // Stored as the list of HIDDEN weekday indices (0=Sun…6=Sat); absent/empty =
  // every day shown, mirroring the calendarFilter "absent = shown" convention.
  const dayLabels = weekdayNamesShort()
  const hidden = Array.isArray(prefs?.scheduleHiddenDays) ? prefs.scheduleHiddenDays : []
  const hiddenSet = new Set(hidden)
  const toggleDay = (d) => {
    const next = hiddenSet.has(d) ? hidden.filter((x) => x !== d) : [...hidden, d]
    updatePrefs({ scheduleHiddenDays: next })
  }

  const filtered = hiddenSet.size
    ? items.filter((it) => !hiddenSet.has(new Date(it.when).getDay()))
    : items
  const shown = filtered.slice(0, limit)
  const remaining = filtered.length - shown.length
  return (
    <>
      {Array.isArray(dayLabels) && dayLabels.length === 7 && (
        <div className="cal-day-filter" role="group" aria-label={t('filter')}>
          {dayLabels.map((lbl, d) => (
            <button
              key={d}
              type="button"
              className={`cal-day-chip${hiddenSet.has(d) ? '' : ' on'}`}
              aria-pressed={!hiddenSet.has(d)}
              onClick={() => toggleDay(d)}
            >
              {lbl}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="empty">
          <p className="empty-text">{t('list.empty')}</p>
        </div>
      ) : (
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
            <p className="cal-when">{it.allDay ? t('allDay') : formatWhen(it.when)}{calContext(it) ? ` · ${calContext(it)}` : ''}</p>
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
      )}
    </>
  )
}

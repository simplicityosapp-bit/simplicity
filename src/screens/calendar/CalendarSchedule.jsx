import { useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'
import { formatWhen } from '../../lib/dates'
import { weekdayNamesShort } from '../../lib/calendar'
import { useT } from '../../i18n/useT'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import { Box, Txt, Btn } from '../../components/ui'

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
      <Box className="empty">
        <Txt as="p" className="empty-text">{t('list.empty')}</Txt>
      </Box>
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
        <Box className="cal-day-filter" role="group" aria-label={t('filter')}>
          {dayLabels.map((lbl, d) => (
            <Btn
              key={d}
              type="button"
              className={`cal-day-chip${hiddenSet.has(d) ? '' : ' on'}`}
              aria-pressed={!hiddenSet.has(d)}
              onClick={() => toggleDay(d)}
            >
              {lbl}
            </Btn>
          ))}
        </Box>
      )}
      {filtered.length === 0 ? (
        <Box className="empty">
          <Txt as="p" className="empty-text">{t('list.empty')}</Txt>
        </Box>
      ) : (
    <Box as="section" className="cal-list">
      {shown.map((it) => (
        <Box
          key={`${it.kind}-${it.id}-${+it.when}`}
          className="cal-item"
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(it)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(it) } }}
        >
          <Txt className={`cal-icon ${it.kind}`}>
            {it.kind === 'reminder'
              ? <Clock size={16} strokeWidth={1.6} aria-hidden="true" />
              : <CalendarDays size={16} strokeWidth={1.6} aria-hidden="true" />}
          </Txt>
          <Box className="cal-body">
            <Txt as="p" className="cal-title">{it.title}</Txt>
            <Txt as="p" className="cal-when">{it.allDay ? t('allDay') : formatWhen(it.when)}{calContext(it) ? ` · ${calContext(it)}` : ''}</Txt>
          </Box>
          {it.kind === 'meeting' && it.status === 'pending' && <Txt className="cal-tag">{t('tag.pending')}</Txt>}
          {it.kind === 'reminder' && <Txt className="cal-tag rem">{t('tag.reminder')}</Txt>}
          {it.kind === 'calendar' && <Txt className="cal-tag cal">{t('tag.calendar')}</Txt>}
          {it.whatsapp && (
            <WhatsAppButton phone={it.whatsapp.phone} message={waMsg(it.whatsapp.key, it.whatsapp.vars)} />
          )}
        </Box>
      ))}
      {remaining > 0 && (
        <Btn type="button" className="cal-load-more" onClick={() => setLimit((n) => n + PAGE)}>
          {t('list.loadMore', { count: remaining })}
        </Btn>
      )}
    </Box>
      )}
    </>
  )
}

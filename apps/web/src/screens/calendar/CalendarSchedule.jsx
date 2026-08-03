import { useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'
import { formatWhen, formatDaySpan } from '@simplicity/core'
import { useT } from '../../i18n/useT'
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
/* `hiddenDays` is the list of weekday indices (0=Sun…6=Sat) the coach has
   switched off, owned by the calendar screen and edited in the view-filter
   modal. It used to be read here and toggled from a chip row above the list,
   which made this screen carry TWO filter surfaces — a modal for the event
   types and these chips for the days — announcing the same name to a screen
   reader and tracked by only one "filter is on" dot. The list still applies
   the rule; it no longer owns the control. */
export default function CalendarSchedule({ items, onSelect, hiddenDays = [] }) {
  const { t } = useT('calendar')
  const waMsg = useWhatsAppMessage()
  const [limit, setLimit] = useState(PAGE)

  if (!items.length) {
    return (
      <Box className="empty">
        <Txt as="p" className="empty-text">{t('list.empty')}</Txt>
      </Box>
    )
  }

  const hiddenSet = new Set(hiddenDays)
  const filtered = hiddenSet.size
    ? items.filter((it) => !hiddenSet.has(new Date(it.when).getDay()))
    : items
  const shown = filtered.slice(0, limit)
  const remaining = filtered.length - shown.length
  return (
    <>
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
            {/* An all-day row said only "כל היום" — the one line on the card
                that carries WHEN, spending itself on a fact the tag already
                gives. A vacation sat between the 10/08 and 16/08 rows with
                nothing to say which day, or how many, it was. It keeps the
                words but leads with the date, or the range for a span. */}
            <Txt as="p" className="cal-when">{it.allDay ? `${formatDaySpan(it)} · ${t('allDay')}` : formatWhen(it.when)}{calContext(it) ? ` · ${calContext(it)}` : ''}</Txt>
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

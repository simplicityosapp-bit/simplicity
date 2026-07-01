import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ChevronLeft, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { remindersUpcoming } from '../../../lib/homeData'
import { formatWhen } from '../../../lib/dates'
import { useReminders } from '../../../hooks/useReminders'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* Upcoming reminders (today → +60d). The ✓ marks a reminder done. */
export default function RemindersWidget() {
  const { t } = useT('home')
  const navigate = useNavigate()
  const { reminders, completeReminder } = useReminders()
  const items = useMemo(() => remindersUpcoming(new Date(), reminders, 60, 0), [reminders])   /* all upcoming */
  /* Closed = title + summary; click opens the full list of every reminder. */
  const [open, setOpen] = useState(false)

  const todayCount = useMemo(() => {
    const now = new Date()
    const isToday = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    return items.filter((r) => isToday(new Date(r.when))).length
  }, [items])

  const summary = items.length === 0
    ? t('widgets.reminders.none')
    : todayCount > 0
      ? t('widgets.reminders.todaySummary', { count: items.length, today: todayCount })
      : t('widgets.reminders.soonSummary', { count: items.length })

  return (
    <Box
      className={`h-card is-expandable${open ? ' is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
    >
      <Box className="h-card-head">
        <Txt className="h-card-title">
          <Clock size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.reminders.title')}
        </Txt>
        <Btn type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.CALENDAR) }}>
          {t('widgets.reminders.link', { count: items.length })}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
      </Box>
      {open ? (
        <Box className="h-card-list">
          {items.length ? (
            items.map((r) => (
              <Box
                key={r.id}
                className="h-rem-row"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigate(ROUTES.CALENDAR) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(ROUTES.CALENDAR) } }}
              >
                <Txt className="h-rem-text">{r.title}</Txt>
                <Txt className="h-rem-when">{formatWhen(r.when)}</Txt>
                <Btn type="button" className="h-check" title={t('widgets.reminders.markDone')} aria-label={t('widgets.reminders.markDoneAria')} onClick={(e) => { e.stopPropagation(); completeReminder(r.id) }}>
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Box>
            ))
          ) : (
            <Txt as="p" className="h-card-empty">{t('widgets.reminders.empty')}</Txt>
          )}
        </Box>
      ) : (
        <Txt as="p" className="h-card-summary">{summary}</Txt>
      )}
    </Box>
  )
}

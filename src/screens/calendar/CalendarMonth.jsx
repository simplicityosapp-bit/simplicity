import { useMemo } from 'react'
import {
  monthGrid, hebrewMonthGrid, hebrewParts,
  eventsByDate, isSameDay, dateKey, weekdayNamesShort, weekStartIndex,
} from '../../lib/calendar'
import { useT } from '../../i18n/useT'

const MAX_DOTS = 3

/* 6-week month grid (always 42 cells — every layout fits, no
   exceptions). Cells outside the month dim. Each cell shows up to
   3 dots tinted by event kind (sage = meeting, amber = reminder,
   moon = synced calendar) — keyed by the legend below the grid.
   Tap a cell → switch to the day view on that date. */
export default function CalendarMonth({ date, events, onPickDay, weekStart = 'sunday', hebrew = false, dual = false }) {
  const { t, lang } = useT('calendar')
  /* Enriched cells — Hebrew parts (gematria day, in-month flag, aria label)
     are derived ONCE per date/weekStart change here, not recomputed for all
     42 cells on every render. The reference month is read a single time. */
  const cells = useMemo(() => {
    if (!hebrew) {
      const m = date.getMonth()
      return monthGrid(date, weekStart).map((d) => ({ d, inMonth: d.getMonth() === m, num: String(d.getDate()), aria: d.toDateString() }))
    }
    const ref = hebrewParts(date)
    return hebrewMonthGrid(date, weekStart).map((d) => {
      const p = hebrewParts(d)
      return { d, inMonth: p.month === ref.month && p.year === ref.year, num: p.dayText, aria: `${p.dayText} ב${p.month} ${p.yearText}` }
    })
  }, [date, weekStart, hebrew])
  const eventsMap = useMemo(() => eventsByDate(events), [events])
  const today = new Date()

  /* Re-order the weekday header to match the user's weekStart. */
  const weekdayHeader = useMemo(() => {
    const names = weekdayNamesShort(lang)
    const start = weekStartIndex(weekStart)
    const out = []
    for (let i = 0; i < 7; i++) out.push(names[(start + i) % 7])
    return out
  }, [weekStart, lang])

  return (
    <div className="cal-month">
      <div className="cal-month-dow-row">
        {weekdayHeader.map((d, i) => (
          <span key={i} className="cal-month-dow">{d}</span>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells.map(({ d, inMonth, num, aria }) => {
          const isToday = isSameDay(d, today)
          const dayEvents = eventsMap.get(dateKey(d)) || []
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={`cal-month-cell${inMonth ? '' : ' dim'}${isToday ? ' today' : ''}`}
              onClick={() => onPickDay?.(d)}
              aria-label={aria}
            >
              {hebrew ? (
                <span className="cal-month-num heb">
                  {num}
                  {dual && <span className="cal-month-num-greg mono">{d.getDate()}</span>}
                </span>
              ) : (
                <span className="cal-month-num mono">{num}</span>
              )}
              {dayEvents.length > 0 && (
                <span className="cal-month-dots">
                  {dayEvents.slice(0, MAX_DOTS).map((ev, i) => (
                    <span key={i} className={`cal-month-dot ${ev.kind}`} aria-hidden="true" />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className="cal-month-more mono">+{dayEvents.length - MAX_DOTS}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="cal-month-legend">
        <span className="cal-month-leg"><span className="cal-month-dot meeting" aria-hidden="true" /> {t('legend.meetings')}</span>
        <span className="cal-month-leg"><span className="cal-month-dot reminder" aria-hidden="true" /> {t('legend.reminders')}</span>
        <span className="cal-month-leg"><span className="cal-month-dot calendar" aria-hidden="true" /> {t('legend.calendar')}</span>
      </div>
    </div>
  )
}

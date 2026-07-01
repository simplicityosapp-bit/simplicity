import { useMemo } from 'react'
import {
  monthGrid, hebrewMonthGrid, hebrewParts,
  eventsByDate, isSameDay, dateKey, weekdayNamesShort, weekStartIndex,
} from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

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
    <Box className="cal-month">
      <Box className="cal-month-dow-row">
        {weekdayHeader.map((d, i) => (
          <Txt key={i} className="cal-month-dow">{d}</Txt>
        ))}
      </Box>
      <Box className="cal-month-grid">
        {cells.map(({ d, inMonth, num, aria }) => {
          const isToday = isSameDay(d, today)
          const dayEvents = eventsMap.get(dateKey(d)) || []
          return (
            <Btn
              key={d.toISOString()}
              type="button"
              className={`cal-month-cell${inMonth ? '' : ' dim'}${isToday ? ' today' : ''}`}
              onClick={() => onPickDay?.(d)}
              aria-label={aria}
            >
              {hebrew ? (
                <Txt className="cal-month-num heb">
                  {num}
                  {dual && <Txt className="cal-month-num-greg mono">{d.getDate()}</Txt>}
                </Txt>
              ) : (
                <Txt className="cal-month-num mono">{num}</Txt>
              )}
              {dayEvents.length > 0 && (
                <Txt className="cal-month-dots">
                  {dayEvents.slice(0, MAX_DOTS).map((ev, i) => (
                    <Txt key={i} className={`cal-month-dot ${ev.kind}`} aria-hidden="true" />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <Txt className="cal-month-more mono">+{dayEvents.length - MAX_DOTS}</Txt>
                  )}
                </Txt>
              )}
            </Btn>
          )
        })}
      </Box>
      <Box className="cal-month-legend">
        <Txt className="cal-month-leg"><Txt className="cal-month-dot meeting" aria-hidden="true" /> {t('legend.meetings')}</Txt>
        <Txt className="cal-month-leg"><Txt className="cal-month-dot reminder" aria-hidden="true" /> {t('legend.reminders')}</Txt>
        <Txt className="cal-month-leg"><Txt className="cal-month-dot calendar" aria-hidden="true" /> {t('legend.calendar')}</Txt>
      </Box>
    </Box>
  )
}

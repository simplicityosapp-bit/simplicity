import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  monthGrid, hebrewMonthGrid, hebrewParts, fmtDayLabel, fmtTime,
  eventsByDate, isSameDay, dateKey, weekdayNamesShort, weekStartIndex,
} from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

const MAX_DOTS = 3

/* The one place in this screen where a breakpoint has to live in JS rather
   than in CSS: below it a tap SELECTS a day, above it a tap opens that day.
   CSS can hide an element, not change what a press means. Kept identical to
   the stylesheet's own boundary so the two can't disagree about which world
   the reader is in. */
const NARROW = '(max-width: 767px)'
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW)
    if (!mq) return undefined
    /* No resync on mount: the lazy initialiser above already read `matches`
       at first render, and react-hooks/set-state-in-effect rightly objects to
       repeating it here. Every later change arrives through the listener. */
    const onChange = (e) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/* 6-week month grid (always 42 cells — every layout fits, no
   exceptions). Cells outside the month dim. Each cell shows up to
   3 dots tinted by event kind (sage = meeting, amber = reminder,
   moon = synced calendar) — keyed by the legend below the grid.
   Tap a cell → switch to the day view on that date. */
export default function CalendarMonth({ date, events, onPickDay, onSelect, weekStart = 'sunday', hebrew = false, dual = false }) {
  const { t, lang } = useT('calendar')
  const narrow = useNarrow()
  /* Which day the strip is describing. Only ever set on a narrow screen; a
     resize back to desktop leaves it harmlessly stale behind a hidden strip,
     and the next narrow tap replaces it. */
  const [selected, setSelected] = useState(null)
  /* Wide: the cell already NAMES the day's events, so a tap has nothing left
     to reveal and goes straight in. Narrow: the cell can only afford dots, so
     the first tap spends itself on showing what they stand for. */
  const pickDay = (d) => (narrow ? setSelected(d) : onPickDay?.(d))
  /* Enriched cells — Hebrew parts (gematria day, in-month flag, aria label)
     are derived ONCE per date/weekStart change here, not recomputed for all
     42 cells on every render. The reference month is read a single time. */
  const cells = useMemo(() => {
    if (!hebrew) {
      const m = date.getMonth()
      /* fmtDayLabel, not toDateString: the latter is always English ("Wed Aug
         12 2026"), which a Hebrew screen reader spells out letter by letter.
         This is the same label the day view puts in its header, so the cell
         announces itself the way the screen it opens names that day. */
      return monthGrid(date, weekStart).map((d) => ({ d, inMonth: d.getMonth() === m, num: String(d.getDate()), aria: fmtDayLabel(d) }))
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
              className={`cal-month-cell${inMonth ? '' : ' dim'}${isToday ? ' today' : ''}${selected && isSameDay(d, selected) ? ' selected' : ''}`}
              onClick={() => pickDay(d)}
              aria-label={aria}
              aria-pressed={narrow ? !!(selected && isSameDay(d, selected)) : undefined}
            >
              {hebrew ? (
                <Txt className="cal-month-num heb">
                  {num}
                  {dual && <Txt className="cal-month-num-greg mono">{d.getDate()}</Txt>}
                </Txt>
              ) : (
                <Txt className="cal-month-num mono">{num}</Txt>
              )}
              {/* Both summaries are rendered and CSS picks one, rather than a
                  breakpoint in JS: the cell is ~41px wide on a phone, where a
                  name would be two ellipsed characters, and ~160px on desktop,
                  where three dots were spending the room on a riddle the
                  legend had to answer. Same slice and the same "+N" for both,
                  so the two can never disagree about how much is hidden. */}
              {dayEvents.length > 0 && (
                <>
                  <Txt className="cal-month-dots">
                    {dayEvents.slice(0, MAX_DOTS).map((ev, i) => (
                      <Txt key={i} className={`cal-month-dot ${ev.kind}`} aria-hidden="true" />
                    ))}
                    {dayEvents.length > MAX_DOTS && (
                      <Txt className="cal-month-more mono">+{dayEvents.length - MAX_DOTS}</Txt>
                    )}
                  </Txt>
                  {/* Chips, not lines of text: stacked plain names ran
                      together into one grey paragraph per cell, and the eye
                      had to find the word boundaries to count the day's load.
                      Each name now carries its own tinted edge — the same
                      treatment the week view gives its events, so the two
                      grids describe an event the same way — and the tint
                      replaces the leading dot rather than joining it. */}
                  <Txt className="cal-month-titles">
                    {dayEvents.slice(0, MAX_DOTS).map((ev, i) => (
                      <Txt key={i} className={`cal-month-title ${ev.kind}`}>{ev.title}</Txt>
                    ))}
                    {dayEvents.length > MAX_DOTS && (
                      <Txt className="cal-month-more mono">+{dayEvents.length - MAX_DOTS}</Txt>
                    )}
                  </Txt>
                </>
              )}
            </Btn>
          )
        })}
      </Box>

      {/* The phone's answer to a 42px cell. Seven columns inside 375px leave
          room for a dot and nothing else — not even the shortest real title,
          which needs 32px against the 23px a chip there could offer. So the
          names move OUT of the grid to a full-width strip under it, where
          they fit, and the grid stays what it is good at: the shape of the
          month. Its heading opens the day view, which is where the first tap
          used to go, so nothing was taken away — only delayed by one press
          that now buys an answer. */}
      {narrow && selected && (
        <Box className="cal-month-strip">
          <Btn type="button" className="cal-month-strip-head" onClick={() => onPickDay?.(selected)}>
            <Txt className="cal-month-strip-day">{fmtDayLabel(selected)}</Txt>
            <Txt className="cal-month-strip-cta">{t('views.day')} <ArrowLeft size={13} strokeWidth={1.6} aria-hidden="true" /></Txt>
          </Btn>
          {(eventsMap.get(dateKey(selected)) || []).length === 0 ? (
            <Txt as="p" className="cal-month-strip-empty">{t('list.empty')}</Txt>
          ) : (
            (eventsMap.get(dateKey(selected)) || []).map((ev, i) => (
              <Btn
                key={i}
                type="button"
                className={`cal-month-title strip ${ev.kind}`}
                onClick={() => onSelect?.(ev)}
              >
                <Txt className="cal-month-title-text">{ev.title}</Txt>
                {!ev.allDay && <Txt className="cal-month-title-time mono">{fmtTime(ev.when)}</Txt>}
              </Btn>
            ))
          )}
        </Box>
      )}

      <Box className="cal-month-legend">
        <Txt className="cal-month-leg"><Txt className="cal-month-dot meeting" aria-hidden="true" /> {t('legend.meetings')}</Txt>
        <Txt className="cal-month-leg"><Txt className="cal-month-dot reminder" aria-hidden="true" /> {t('legend.reminders')}</Txt>
        <Txt className="cal-month-leg"><Txt className="cal-month-dot calendar" aria-hidden="true" /> {t('legend.calendar')}</Txt>
      </Box>
    </Box>
  )
}

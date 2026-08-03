import { useEffect, useMemo, useRef, useState } from 'react'
import { eventsForDay, isSameDay, fmtTime } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

const DEFAULT_START = 6
const DEFAULT_END = 22
const HOUR_H = 56            // px per hour row
const MIN_EVENT_H = 24       // floor so short / point events stay tappable
const DEFAULT_DUR_MIN = 60   // assumed duration when an event carries no end
const DAY_MIN = 24 * 60      // end-of-day clamp for an event continuing past midnight
/* One minute. The line moves 56/60 of a pixel per minute, so a coarser tick
   would be visible as a jump and a finer one would re-render for nothing. */
const NOW_TICK_MS = 60_000

const minutesOf = (d) => { const x = new Date(d); return x.getHours() * 60 + x.getMinutes() }

/* Greedy column packing for overlapping events. Walks start-sorted events,
   groups them into overlap clusters, and within each cluster assigns the
   first free lane (column). Returns a Map(event -> { col, cols }). */
function assignColumns(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const result = new Map()
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const laneEnds = []
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.start)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end) } else { laneEnds[lane] = it.end }
      result.set(it.ev, { col: lane })
    }
    for (const it of cluster) result.get(it.ev).cols = laneEnds.length || 1
    cluster = []
    clusterEnd = -1
  }
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return result
}

/* Positioned day timeline (Google-Calendar style): one row per visible hour,
   timed events absolutely positioned so they span their full start→end range
   (height ∝ duration) instead of sitting only in their start hour. Overlapping
   events share the width in side-by-side columns. All-day events get a band
   above; events that start outside the visible window keep the edge bands. */
export default function CalendarDay({ date, events, onSelect, onPickSlot, dayViewStart = DEFAULT_START, dayViewEnd = DEFAULT_END }) {
  const { t } = useT('calendar')
  const startH = Math.max(0, Math.min(23, dayViewStart))
  const endH = Math.max(startH, Math.min(23, dayViewEnd))
  const gridStartMin = startH * 60
  const gridEndMin = (endH + 1) * 60
  const gridH = (endH - startH + 1) * HOUR_H

  /* "Now" is state, not a render-time clock read: react-hooks/purity forbids
     the latter, and a line drawn once at mount would drift a pixel a minute
     until it was quietly lying. The lazy initialiser is the same shape the
     calendar screen already uses for its selected date. */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const dayEvents = useMemo(() => eventsForDay(events, date), [events, date])
  const allDayEvents = useMemo(() => dayEvents.filter((e) => e.allDay), [dayEvents])
  const timedEvents = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents])

  const hours = useMemo(() => {
    const out = []
    for (let h = startH; h <= endH; h++) out.push(h)
    return out
  }, [startH, endH])

  /* The minute range each event occupies WITHIN the displayed day. An event
     that began on an earlier day enters at 00:00 and one that ends on a later
     day runs to 24:00 — otherwise a continuing event would be positioned by
     the previous day's clock time, which is where it used to land. */
  const dayRanges = useMemo(() => {
    const map = new Map()
    for (const ev of timedEvents) {
      const startsToday = isSameDay(ev.when, date)
      const endDate = ev.end ? new Date(ev.end) : null
      const hasEnd = !!endDate && endDate > new Date(ev.when)
      const sMin = startsToday ? minutesOf(ev.when) : 0
      let eMin
      if (hasEnd) eMin = isSameDay(endDate, date) ? minutesOf(endDate) : DAY_MIN
      else eMin = sMin + DEFAULT_DUR_MIN
      map.set(ev, { sMin, eMin: Math.max(eMin, sMin + 1) })
    }
    return map
  }, [timedEvents, date])

  /* Events lying FULLY outside the visible window keep their own bands (a
     fully off-hours meeting shouldn't silently vanish or stretch the grid).
     Anything that overlaps the window at all goes in the grid, clamped —
     including one that opened hours before the window did. */
  const earlyEvents = useMemo(
    () => timedEvents.filter((e) => (dayRanges.get(e)?.eMin ?? 0) <= gridStartMin),
    [timedEvents, dayRanges, gridStartMin],
  )
  const lateEvents = useMemo(
    () => timedEvents.filter((e) => (dayRanges.get(e)?.sMin ?? 0) >= gridEndMin),
    [timedEvents, dayRanges, gridEndMin],
  )

  /* In-grid events → absolute boxes (top/height) + overlap columns. */
  const boxes = useMemo(() => {
    const inGrid = timedEvents.filter((e) => {
      const r = dayRanges.get(e)
      return r && r.eMin > gridStartMin && r.sMin < gridEndMin
    })
    const items = inGrid.map((ev) => {
      const { sMin, eMin } = dayRanges.get(ev)
      const top = (Math.max(sMin, gridStartMin) - gridStartMin) / 60 * HOUR_H
      const bottom = (Math.min(eMin, gridEndMin) - gridStartMin) / 60 * HOUR_H
      const height = Math.max(MIN_EVENT_H, bottom - top)
      return { ev, start: sMin, end: eMin, top, height }
    })
    const cols = assignColumns(items)
    return items.map((it) => {
      const c = cols.get(it.ev) || { col: 0, cols: 1 }
      return { ...it, col: c.col, cols: c.cols }
    })
  }, [timedEvents, dayRanges, gridStartMin, gridEndMin])

  /* Where "now" sits in the grid, or null when it doesn't belong on it — the
     day being looked at isn't today, or the clock is outside the visible
     window. The day view is the one place that shows a stretch of hours with
     no marker for which of them is happening, so a coach scanning it had to
     read the labels and do the arithmetic to find themselves. */
  const nowTop = useMemo(() => {
    if (!isSameDay(now, date)) return null
    const mins = now.getHours() * 60 + now.getMinutes()
    if (mins < gridStartMin || mins > gridEndMin) return null
    return (mins - gridStartMin) / 60 * HOUR_H
  }, [now, date, gridStartMin, gridEndMin])

  /* Open on the current hour instead of on the top of the window. The grid is
     nearly a thousand pixels tall, so entering it at 06:00 put a coach who
     works afternoons below the fold of their own day and made the marker they
     came for something they had to go looking for.

     Keyed on the `date` OBJECT, not on the day it represents. Every route into
     this view hands over a fresh Date — the arrows build one, "היום" builds
     one — so a re-entry re-centres while the minute tick, which changes
     `nowTop` but not `date`, does not yank a scroll out from under someone who
     has scrolled somewhere else on purpose. */
  const nowRef = useRef(null)
  const scrolledFor = useRef(null)
  useEffect(() => {
    if (nowTop === null || scrolledFor.current === date) return
    scrolledFor.current = date
    nowRef.current?.scrollIntoView({
      block: 'center',
      /* The one animation on this screen that moves the whole page; honour the
         OS setting the same way the stylesheet's reduced-motion rules do. */
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [date, nowTop])

  return (
    <Box className="cal-day">
      {allDayEvents.length > 0 && (
        <Box className="cal-day-allday">
          <Txt as="p" className="cal-day-edge-lbl">{t('allDay')}</Txt>
          <Box className="cal-day-allday-items">
            {allDayEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
          </Box>
        </Box>
      )}

      {earlyEvents.length > 0 && (
        <Box className="cal-day-edge">
          <Txt as="p" className="cal-day-edge-lbl">{t('before', { time: `${String(hours[0]).padStart(2, '0')}:00` })}</Txt>
          {earlyEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
        </Box>
      )}

      <Box className="cal-day-grid" style={{ height: `${gridH}px` }}>
        {hours.map((h, i) => (
          <Btn
            key={h}
            type="button"
            className="cal-day-hourline"
            style={{ top: `${i * HOUR_H}px`, height: `${HOUR_H}px` }}
            onClick={onPickSlot ? () => { const s = new Date(date); s.setHours(h, 0, 0, 0); onPickSlot(s) } : undefined}
            aria-label={onPickSlot ? t('scheduleAt', { time: `${String(h).padStart(2, '0')}:00` }) : undefined}
          >
            <Txt className="cal-day-hour mono">{String(h).padStart(2, '0')}:00</Txt>
          </Btn>
        ))}
        <Box className="cal-day-events">
          {boxes.map(({ ev, top, height, col, cols }) => (
            <Btn
              key={`${ev.kind}-${ev.id}-${+ev.when}`}
              type="button"
              className={`cal-day-evt placed ${ev.kind}`}
              onClick={() => onSelect?.(ev)}
              style={{
                top: `${top}px`,
                height: `${height}px`,
                insetInlineStart: `calc(${(col / cols) * 100}% + 2px)`,
                width: `calc(${(1 / cols) * 100}% - 6px)`,
              }}
            >
              {/* Time + status share the top row so the tag is always visible
                  and never sits on top of the title below it. */}
              <Txt className="cal-day-evt-head">
                <Txt className="cal-day-evt-time mono">
                  {fmtTime(ev.when)}{ev.end ? `–${fmtTime(ev.end)}` : ''}
                </Txt>
                {ev.kind === 'meeting' && ev.status === 'pending' && <Txt className="cal-tag">{t('tag.pending')}</Txt>}
                {ev.kind === 'reminder' && <Txt className="cal-tag rem">{t('tag.reminder')}</Txt>}
                {ev.kind === 'calendar' && <Txt className="cal-tag cal">{t('tag.calendar')}</Txt>}
              </Txt>
              <Txt className="cal-day-evt-title">{ev.title}</Txt>
            </Btn>
          ))}
        </Box>

        {/* Drawn LAST so it rides over the event blocks — an event in progress
            is exactly when the marker matters most, and a line hidden behind
            the thing it is marking is no marker at all. aria-hidden because it
            restates the device's own clock; the hour labels already carry the
            grid's structure for a reader who isn't looking at it. */}
        {nowTop !== null && (
          <Box ref={nowRef} className="cal-day-now" style={{ top: `${nowTop}px` }} aria-hidden="true" />
        )}
      </Box>

      {lateEvents.length > 0 && (
        <Box className="cal-day-edge">
          <Txt as="p" className="cal-day-edge-lbl">{t('after', { time: `${String(hours[hours.length - 1]).padStart(2, '0')}:00` })}</Txt>
          {lateEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
        </Box>
      )}
    </Box>
  )
}

/* Bare (non-positioned) event chip — used in the all-day + early/late bands. */
function DayEvent({ event, onSelect, t }) {
  return (
    <Btn
      type="button"
      className={`cal-day-evt ${event.kind}`}
      onClick={() => onSelect?.(event)}
    >
      {!event.allDay && (
        <Txt className="cal-day-evt-time mono">
          {fmtTime(event.when)}{event.end ? `–${fmtTime(event.end)}` : ''}
        </Txt>
      )}
      <Txt className="cal-day-evt-title">{event.title}</Txt>
      {event.kind === 'meeting' && event.status === 'pending' && <Txt className="cal-tag">{t('tag.pending')}</Txt>}
      {event.kind === 'reminder' && <Txt className="cal-tag rem">{t('tag.reminder')}</Txt>}
      {event.kind === 'calendar' && <Txt className="cal-tag cal">{t('tag.calendar')}</Txt>}
    </Btn>
  )
}

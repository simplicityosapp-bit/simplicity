import { useMemo } from 'react'
import { eventsForDay, isSameDay } from '../../lib/calendar'
import { fmtTime } from '../../lib/dates'
import { useT } from '../../i18n/useT'

const DEFAULT_START = 6
const DEFAULT_END = 22
const HOUR_H = 56            // px per hour row
const MIN_EVENT_H = 24       // floor so short / point events stay tappable
const DEFAULT_DUR_MIN = 60   // assumed duration when an event carries no end

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

  const dayEvents = useMemo(() => eventsForDay(events, date), [events, date])
  const allDayEvents = useMemo(() => dayEvents.filter((e) => e.allDay), [dayEvents])
  const timedEvents = useMemo(() => dayEvents.filter((e) => !e.allDay), [dayEvents])

  const hours = useMemo(() => {
    const out = []
    for (let h = startH; h <= endH; h++) out.push(h)
    return out
  }, [startH, endH])

  /* Events whose START falls outside the visible window keep their own bands
     (a fully off-hours meeting shouldn't silently vanish or stretch the grid). */
  const earlyEvents = useMemo(() => timedEvents.filter((e) => new Date(e.when).getHours() < startH), [timedEvents, startH])
  const lateEvents = useMemo(() => timedEvents.filter((e) => new Date(e.when).getHours() > endH), [timedEvents, endH])

  /* In-grid events → absolute boxes (top/height) + overlap columns. */
  const boxes = useMemo(() => {
    const inGrid = timedEvents.filter((e) => {
      const h = new Date(e.when).getHours()
      return h >= startH && h <= endH
    })
    const items = inGrid.map((ev) => {
      const sMin = minutesOf(ev.when)
      const endDate = ev.end ? new Date(ev.end) : null
      let eMin
      if (endDate && endDate > new Date(ev.when)) {
        eMin = isSameDay(endDate, ev.when) ? minutesOf(endDate) : gridEndMin
      } else {
        eMin = sMin + DEFAULT_DUR_MIN
      }
      const top = (Math.max(sMin, gridStartMin) - gridStartMin) / 60 * HOUR_H
      const bottom = (Math.min(eMin, gridEndMin) - gridStartMin) / 60 * HOUR_H
      const height = Math.max(MIN_EVENT_H, bottom - top)
      return { ev, start: sMin, end: Math.max(eMin, sMin + 1), top, height }
    })
    const cols = assignColumns(items)
    return items.map((it) => {
      const c = cols.get(it.ev) || { col: 0, cols: 1 }
      return { ...it, col: c.col, cols: c.cols }
    })
  }, [timedEvents, startH, endH, gridStartMin, gridEndMin])

  return (
    <div className="cal-day">
      {allDayEvents.length > 0 && (
        <div className="cal-day-allday">
          <p className="cal-day-edge-lbl">{t('allDay')}</p>
          <div className="cal-day-allday-items">
            {allDayEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
          </div>
        </div>
      )}

      {earlyEvents.length > 0 && (
        <div className="cal-day-edge">
          <p className="cal-day-edge-lbl">{t('before', { time: `${String(hours[0]).padStart(2, '0')}:00` })}</p>
          {earlyEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
        </div>
      )}

      <div className="cal-day-grid" style={{ height: `${gridH}px` }}>
        {hours.map((h, i) => (
          <button
            key={h}
            type="button"
            className="cal-day-hourline"
            style={{ top: `${i * HOUR_H}px`, height: `${HOUR_H}px` }}
            onClick={onPickSlot ? () => { const s = new Date(date); s.setHours(h, 0, 0, 0); onPickSlot(s) } : undefined}
            aria-label={onPickSlot ? t('scheduleAt', { time: `${String(h).padStart(2, '0')}:00` }) : undefined}
          >
            <span className="cal-day-hour mono">{String(h).padStart(2, '0')}:00</span>
          </button>
        ))}
        <div className="cal-day-events">
          {boxes.map(({ ev, top, height, col, cols }) => (
            <button
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
              <span className="cal-day-evt-head">
                <span className="cal-day-evt-time mono">
                  {fmtTime(ev.when)}{ev.end ? `–${fmtTime(ev.end)}` : ''}
                </span>
                {ev.kind === 'meeting' && ev.status === 'pending' && <span className="cal-tag">{t('tag.pending')}</span>}
                {ev.kind === 'reminder' && <span className="cal-tag rem">{t('tag.reminder')}</span>}
                {ev.kind === 'calendar' && <span className="cal-tag cal">{t('tag.calendar')}</span>}
              </span>
              <span className="cal-day-evt-title">{ev.title}</span>
            </button>
          ))}
        </div>
      </div>

      {lateEvents.length > 0 && (
        <div className="cal-day-edge">
          <p className="cal-day-edge-lbl">{t('after', { time: `${String(hours[hours.length - 1]).padStart(2, '0')}:00` })}</p>
          {lateEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}-${+ev.when}`} event={ev} onSelect={onSelect} t={t} />)}
        </div>
      )}
    </div>
  )
}

/* Bare (non-positioned) event chip — used in the all-day + early/late bands. */
function DayEvent({ event, onSelect, t }) {
  return (
    <button
      type="button"
      className={`cal-day-evt ${event.kind}`}
      onClick={() => onSelect?.(event)}
    >
      {!event.allDay && (
        <span className="cal-day-evt-time mono">
          {fmtTime(event.when)}{event.end ? `–${fmtTime(event.end)}` : ''}
        </span>
      )}
      <span className="cal-day-evt-title">{event.title}</span>
      {event.kind === 'meeting' && event.status === 'pending' && <span className="cal-tag">{t('tag.pending')}</span>}
      {event.kind === 'reminder' && <span className="cal-tag rem">{t('tag.reminder')}</span>}
      {event.kind === 'calendar' && <span className="cal-tag cal">{t('tag.calendar')}</span>}
    </button>
  )
}

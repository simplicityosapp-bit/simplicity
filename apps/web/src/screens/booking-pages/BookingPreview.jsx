import { useMemo, useState } from 'react'
import { previewDayTimes, weekdayLabels, leadPageSurface, durationFor } from '../../lib/bookingPageSchema'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   BOOKING PREVIEW — what the visitor meets, shown inside the builder.
   ════════════════════════════════════════════════════════════════
   The builder's canvas is a branding mock: logo, heading, body, a hint line
   and a button that does nothing. The slot picker — the entire point of the
   page — could only be seen by publishing it and opening the link, which is a
   strange thing to ask of someone still setting it up.

   This renders the visitor's actual flow from the DRAFT, in the public page's
   own markup (lp-* / bk2-*), so it cannot look like something the visitor will
   never see: the same surface and branding, the meeting types on offer with
   their lengths, and the days and start times those hours produce.

   What it does not do is pretend to be live. Real slots come from the edge
   function, which also removes what is already booked and what the connected
   calendar is busy with — none of which a draft can know. The note under the
   times says exactly that rather than letting a coach believe an empty
   afternoon here means an empty afternoon there. */

const DAYS_SHOWN = 7

export default function BookingPreview({ draft, meetingTypes }) {
  const { t } = useT('booking')
  const content = draft?.content || {}
  /* Memoised: `draft.availability || {}` hands back a NEW empty object on every
     render when it is missing, which would make both useMemos below recompute
     forever. */
  const av = useMemo(() => draft?.availability || {}, [draft?.availability])

  /* The types the page offers, resolved the way booking-intake resolves them:
     the ones picked, each with its per-page length override, and — when none
     are picked — a single synthetic meeting at the page default. */
  const types = useMemo(() => {
    const picked = (draft?.meeting_type_ids || [])
      .map((id) => (meetingTypes || []).find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({
        id: m.id,
        name: m.name,
        minutes: Number(draft?.meeting_type_durations?.[m.id]) > 0
          ? Number(draft.meeting_type_durations[m.id])
          : durationFor(m, av),
        price: m.default_price,
      }))
    if (picked.length) return picked
    return [{ id: '__d', name: t('preview.defaultType'), minutes: durationFor(null, av), price: null }]
  }, [draft, meetingTypes, av, t])

  const [typeId, setTypeId] = useState(types[0]?.id ?? '__d')
  const chosen = types.find((x) => x.id === typeId) || types[0]

  /* The next few days that can actually offer this meeting. Weekday order is
     the app's own (0 = ראשון), the same index the weekly hours are keyed by. */
  const days = useMemo(() => {
    const labels = weekdayLabels()
    const out = []
    for (let i = 0; i < DAYS_SHOWN; i += 1) {
      const wd = i % 7
      const times = previewDayTimes(av, chosen?.minutes, wd)
      if (times.length) out.push({ wd, label: labels[wd], times })
    }
    return out
  }, [av, chosen])

  const [dayIdx, setDayIdx] = useState(0)
  const day = days[dayIdx] || days[0] || null

  const { style, cls } = leadPageSurface(content)

  return (
    <Box className={`lp-root lp-surface bk2-page bkp-root${cls ? ` ${cls}` : ''}`} dir="rtl" style={style}>
      <Box className="lp-card">
        {content.logoText ? <Box className="lp-logo">{content.logoText}</Box> : null}
        {content.heading ? <Txt as="h1" className="lp-heading">{content.heading}</Txt> : null}
        {content.body ? <Txt as="p" className="lp-body">{content.body}</Txt> : null}

        {types.length > 1 && (
          <Box className="bk2-section">
            <Txt as="p" className="bk2-step-label">{t('publicPage.stepType')}</Txt>
            <Box className="bk2-types">
              {types.map((mt) => (
                <Btn key={mt.id} type="button" className={`bk2-type${typeId === mt.id ? ' on' : ''}`}
                  onClick={() => { setTypeId(mt.id); setDayIdx(0) }}>
                  <Txt className="bk2-type-name">{mt.name}</Txt>
                  <Txt className="bk2-type-meta">
                    {t('minutes', { count: mt.minutes })}{mt.price ? ` · ₪${mt.price}` : ''}
                  </Txt>
                </Btn>
              ))}
            </Box>
          </Box>
        )}

        <Box className="bk2-section">
          <Txt as="p" className="bk2-step-label">{t('publicPage.stepWhen')}</Txt>
          {!days.length ? (
            /* The same emptiness a visitor would meet — and the reason for it,
               which the visitor would never be told. */
            <Txt as="p" className="lp-muted bkp-empty">{t('preview.noTimes', { minutes: chosen?.minutes ?? 0 })}</Txt>
          ) : (
            <>
              <Box className="bk2-days">
                {days.map((d, i) => (
                  <Btn key={d.wd} type="button" className={`bk2-day${i === dayIdx ? ' on' : ''}`}
                    onClick={() => setDayIdx(i)}>
                    {d.label}
                  </Btn>
                ))}
              </Box>
              {day ? (
                <Box className="bk2-slots">
                  {day.times.map((hhmm) => (
                    <Txt key={hhmm} className="bk2-slot bkp-slot">{hhmm}</Txt>
                  ))}
                </Box>
              ) : null}
            </>
          )}
        </Box>

        <Box className="lp-submit bkp-submit" aria-hidden="true">{t('pages.submitPreview')}</Box>
      </Box>

      <Txt as="p" className="bkp-note">{t('preview.note')}</Txt>
    </Box>
  )
}

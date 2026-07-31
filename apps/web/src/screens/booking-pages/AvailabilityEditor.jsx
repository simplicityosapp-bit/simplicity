import { useState } from 'react'
import { Plus, X, Copy, SlidersHorizontal } from 'lucide-react'
import InfoPopover from '../../components/InfoPopover'
import Modal from '../../modals/Modal'
import {
  weekdayLabels, copyDayWindows, describeWindows, applyWorkweek,
} from '../../lib/bookingPageSchema'
import { openDays } from '../../lib/bookingWizard'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   WHEN AM I FREE — the week, and the numbers behind it.
   ════════════════════════════════════════════════════════════════
   Shared by the creation wizard and the builder so the two can never drift:
   this was the builder's own inline markup, lifted out whole.

   Two things changed in the lifting. The five numeric settings — slot interval,
   default length, buffer, notice, range — used to sit ABOVE the days, so the
   most technical controls on the screen stood between a coach and the simplest
   question they came to answer. They fold away now, below the week.

   And a page no longer arrives with hours nobody chose, so an empty week offers
   the work week rather than assuming it. Taking it is one press; not taking it
   is also a decision, which is the point.
   ════════════════════════════════════════════════════════════════ */
export default function AvailabilityEditor({ availability, onChange }) {
  const { t } = useT('booking')
  const [advanced, setAdvanced] = useState(false)
  const [copyFrom, setCopyFrom] = useState(null)
  const [copyTo, setCopyTo] = useState([])

  const av = availability
  const setAvail = (patch) => onChange({ ...av, ...patch })
  const setWeekly = (day, windows) => onChange({ ...av, weekly: { ...av.weekly, [day]: windows } })

  const dayWindows = (day) => (Array.isArray(av.weekly?.[day]) ? av.weekly[day] : [])
  const addWindow = (day) => setWeekly(day, [...dayWindows(day), { start: '09:00', end: '17:00' }])
  const updateWindow = (day, i, patch) => setWeekly(day, dayWindows(day).map((w, idx) => (idx === i ? { ...w, ...patch } : w)))
  const removeWindow = (day, i) => setWeekly(day, dayWindows(day).filter((_, idx) => idx !== i))

  const openCopy = (day) => { setCopyTo([]); setCopyFrom(day) }
  const closeCopy = () => setCopyFrom(null)
  const toggleCopyTo = (day) => setCopyTo((s) => (s.includes(day) ? s.filter((d) => d !== day) : [...s, day]))
  const applyCopy = () => {
    onChange({ ...av, weekly: copyDayWindows(av.weekly, copyFrom, copyTo) })
    closeCopy()
  }

  const nothingOpen = openDays(av.weekly) === 0

  const NUMBERS = [
    { key: 'slotMinutes', label: 'slotIntervalLabel', info: 'slotIntervalInfo', min: 5, step: 5 },
    { key: 'defaultDurationMinutes', label: 'defaultDurationLabel', info: 'defaultDurationInfo', min: 5, step: 5 },
    { key: 'bufferMinutes', label: 'bufferLabel', info: 'bufferInfo', min: 0, step: 5 },
    { key: 'minNoticeHours', label: 'minNoticeLabel', info: 'minNoticeInfo', min: 0, step: 1 },
    { key: 'maxDaysAhead', label: 'maxDaysLabel', info: 'maxDaysInfo', min: 1, step: 1 },
  ]

  return (
    <>
      {/* An empty week is the starting point now, so it has to offer a way out
          of itself that is faster than opening five days by hand. */}
      {nothingOpen && (
        <Box className="bk-preset">
          <Txt as="p" className="bk-preset-text">{t('pages.presetPrompt')}</Txt>
          <Btn type="button" className="bk-mini-btn" onClick={() => onChange(applyWorkweek(av))}>
            {t('pages.presetWorkweek')}
          </Btn>
        </Box>
      )}

      <Box className="bk-week">
        {weekdayLabels().map((label, day) => {
          const windows = dayWindows(day)
          const open = windows.length > 0
          return (
            <Box key={day} className={`bk-day${open ? ' open' : ''}`}>
              <Box className="bk-day-head">
                <Txt className="bk-day-name">{label}</Txt>
                {open ? (
                  <Btn type="button" className="bk-mini-btn" onClick={() => addWindow(day)}><Plus size={13} strokeWidth={1.9} /> {t('pages.addWindow')}</Btn>
                ) : (
                  <Btn type="button" className="bk-day-add" onClick={() => addWindow(day)}>{t('pages.addAvailability')}</Btn>
                )}
              </Box>
              {open && (
                <Box className="bk-windows">
                  {windows.map((w, i) => (
                    <Box className="bk-window" key={i}>
                      <Input type="time" value={w.start} onChange={(e) => updateWindow(day, i, { start: e.target.value })} />
                      <Txt className="bk-window-sep">–</Txt>
                      <Input type="time" value={w.end} onChange={(e) => updateWindow(day, i, { end: e.target.value })} />
                      <Btn type="button" className="lpe-ctrl-btn danger" onClick={() => removeWindow(day, i)} aria-label={t('pages.removeWindowLabel')}><X size={14} /></Btn>
                    </Box>
                  ))}
                  <Btn type="button" className="bk-day-copy" onClick={() => openCopy(day)}>
                    <Copy size={12} strokeWidth={1.9} aria-hidden="true" /> {t('pages.copyDayBtn')}
                  </Btn>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      {/* Below the week, and shut. These five decide how slots are generated and
          every one of them has a sane value already; a coach who never opens
          this has lost nothing. */}
      <Btn type="button" className="bk-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)}>
        <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" /> {t('pages.advancedTitle')}
      </Btn>
      {advanced && (
        <Box className="bk-settings-grid">
          {NUMBERS.map((n) => (
            <Box as="label" className="bk-num-field" key={n.key}>
              <Txt className="bk-num-label">{t(`pages.${n.label}`)}<InfoPopover label={t(`pages.${n.label}`)} text={t(`pages.${n.info}`)} /></Txt>
              <Input type="number" min={String(n.min)} step={String(n.step)} value={av[n.key]} onChange={(e) => setAvail({ [n.key]: Number(e.target.value) })} />
            </Box>
          ))}
        </Box>
      )}

      {copyFrom != null ? (
        <Modal open onClose={closeCopy} title={t('pages.copyDayTitle', { day: weekdayLabels()[copyFrom] })}>
          <Txt as="p" className="bk-copy-src">{describeWindows(dayWindows(copyFrom))}</Txt>
          <Txt as="p" className="bk-copy-hint">{t('pages.copyDayHint')}</Txt>
          <Box className="bk-copy-tools">
            <Btn type="button" className="bk-copy-tool" onClick={() => setCopyTo(weekdayLabels().map((_, d) => d).filter((d) => d !== copyFrom))}>
              {t('pages.copyDaySelectAll')}
            </Btn>
            <Btn type="button" className="bk-copy-tool" onClick={() => setCopyTo([])} disabled={!copyTo.length}>
              {t('pages.copyDayClear')}
            </Btn>
          </Box>
          <Box className="bk-copy-list">
            {weekdayLabels().map((label, day) => {
              if (day === copyFrom) return null
              const current = describeWindows(dayWindows(day))
              const checked = copyTo.includes(day)
              return (
                <Box as="label" key={day} className={`bk-copy-row${checked ? ' on' : ''}`}>
                  <Input type="checkbox" checked={checked} onChange={() => toggleCopyTo(day)} />
                  <Txt className="bk-copy-day">{label}</Txt>
                  <Txt className="bk-copy-now">{current || t('pages.copyDayClosed')}</Txt>
                  {checked && current ? <Txt className="bk-copy-warn">{t('pages.copyDayWillReplace')}</Txt> : null}
                </Box>
              )
            })}
          </Box>
          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={closeCopy}>{t('pages.cancel')}</Btn>
            <Btn type="button" className="m-btn-save" onClick={applyCopy} disabled={!copyTo.length}>
              {copyTo.length ? t('pages.copyDayApply', { count: copyTo.length }) : t('pages.copyDayApplyEmpty')}
            </Btn>
          </Box>
        </Modal>
      ) : null}
    </>
  )
}

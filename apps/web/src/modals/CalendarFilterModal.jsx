import Modal from './Modal'
import { weekdayNamesShort } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* "פילטר תצוגה" — everything that decides what the calendar shows, in one
   place. Two groups, because the screen has two genuinely different rules
   and used to express them through two unrelated surfaces: event TYPES here
   in the modal, and weekday visibility through a chip row that sat above the
   agenda list. Both were reachable, but only the types lit the header's
   "filter is on" dot, so a coach who had switched off Wednesday months ago
   had nothing on screen to explain the gap — and both controls announced
   themselves to a screen reader as "פילטר תצוגה".

   The day group carries its scope in its heading rather than implying one.
   Hiding a day affects the "לוח" list ONLY; the day, week and month views
   still draw every day, because a week grid missing a column is a different
   feature (and a bigger one) than an agenda that skips your days off.

   Types are persisted in prefs.calendarFilter and days in
   prefs.scheduleHiddenDays, both by the parent. */
const OPTS = [
  { key: 'meeting',      label: 'meetingLabel',  sub: 'meetingSub' },
  { key: 'reminder',     label: 'reminderLabel', sub: 'reminderSub' },
  { key: 'leadFollowup', label: 'followupLabel', sub: 'followupSub' },
  { key: 'calendar',     label: 'calendarLabel', sub: 'calendarSub' },
]

export default function CalendarFilterModal({ open, onClose, filter = {}, onChange, hiddenDays = [], onToggleDay }) {
  const { t } = useT('modalsTask')
  const dayLabels = weekdayNamesShort()
  const hiddenSet = new Set(hiddenDays)
  return (
    <Modal open={open} onClose={onClose} title={t('filter.title')}>
      <Txt as="p" className="m-hint">{t('filter.hint')}</Txt>

      <Txt as="p" className="cal-filter-group">{t('filter.typesHeading')}</Txt>
      <Box className="cal-filter-list">
        {OPTS.map((o) => (
          <Box as="label" key={o.key} className="cal-filter-opt">
            <Txt className="cal-filter-opt-text">
              {t(`filter.${o.label}`)}
              <Txt className="cal-filter-opt-sub">{t(`filter.${o.sub}`)}</Txt>
            </Txt>
            <Input
              type="checkbox"
              className="cal-filter-checkbox"
              checked={filter[o.key] !== false}
              onChange={(e) => onChange?.(o.key, e.target.checked)}
            />
          </Box>
        ))}
      </Box>

      {/* A pressed chip is a day that SHOWS — the same polarity the chips had
          above the list, so a coach who knew the old control isn't taught a
          new one. Guarded on a 7-name list because the labels come from i18n
          and a half-loaded namespace would otherwise render a ragged row. */}
      {onToggleDay && Array.isArray(dayLabels) && dayLabels.length === 7 && (
        <>
          <Txt as="p" className="cal-filter-group">{t('filter.daysHeading')}</Txt>
          <Txt as="p" className="cal-filter-group-sub">{t('filter.daysSub')}</Txt>
          <Box className="cal-day-filter in-modal" role="group" aria-label={t('filter.daysHeading')}>
            {dayLabels.map((lbl, d) => (
              <Btn
                key={d}
                type="button"
                className={`cal-day-chip${hiddenSet.has(d) ? '' : ' on'}`}
                aria-pressed={!hiddenSet.has(d)}
                onClick={() => onToggleDay(d)}
              >
                {lbl}
              </Btn>
            ))}
          </Box>
        </>
      )}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</Btn>
      </Box>
    </Modal>
  )
}

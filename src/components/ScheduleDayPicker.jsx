/* ════════════════════════════════════════════════════════════════
   ScheduleDayPicker — controlled weekday / interval picker.
   ════════════════════════════════════════════════════════════════
   The same schedule UI the prototype defined (and QuestionScheduleEditor
   uses), but fully controlled so a parent form can derive a goal target
   from it live. Three modes: every day / specific weekdays / every X days.

   Props:
     - mode:   'every_day' | 'days_of_week' | 'every_x_days'
     - days:   number[] of weekday indexes (0=Sun … 6=Sat) for days_of_week
     - x:      interval for every_x_days
     - onChange({ mode, days, x }): fired on any change
     - className: optional extra class on the wrapper

   Styling reuses the existing .qs-* classes (settings) so it looks
   identical wherever it's mounted.
   ════════════════════════════════════════════════════════════════ */

import { useT } from '../i18n/useT'
import './ScheduleDayPicker.css'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export default function ScheduleDayPicker({ mode, days, x, onChange, className = '' }) {
  const { t } = useT('components')
  const setMode = (m) => onChange({ mode: m, days, x })
  const toggleDay = (k) => {
    const next = days.includes(k) ? days.filter((d) => d !== k) : [...days, k]
    onChange({ mode, days: next, x })
  }
  const setX = (v) => onChange({ mode, days, x: v })

  return (
    <div className={`qs-editor${className ? ` ${className}` : ''}`}>
      <div className="qs-modes">
        <button type="button" className={`qs-mode${mode === 'every_day' ? ' on' : ''}`} onClick={() => setMode('every_day')}>{t('schedule.everyDay')}</button>
        <button type="button" className={`qs-mode${mode === 'days_of_week' ? ' on' : ''}`} onClick={() => setMode('days_of_week')}>{t('schedule.specificDays')}</button>
        <button type="button" className={`qs-mode${mode === 'every_x_days' ? ' on' : ''}`} onClick={() => setMode('every_x_days')}>{t('schedule.everyXDays')}</button>
      </div>

      {mode === 'days_of_week' && (
        <div className="qs-day-pills">
          {DAY_KEYS.map((dk, k) => (
            <button
              key={k}
              type="button"
              className={`qs-day${days.includes(k) ? ' on' : ''}`}
              onClick={() => toggleDay(k)}
              aria-pressed={days.includes(k)}
            >
              {t(`schedule.dayShort.${dk}`)}
            </button>
          ))}
        </div>
      )}

      {mode === 'every_x_days' && (
        <div className="qs-x-row">
          <span>{t('schedule.every')}</span>
          <input
            type="number"
            min="2"
            max="30"
            value={x}
            onChange={(e) => setX(e.target.value)}
            className="qs-x-input"
          />
          <span>{t('schedule.days')}</span>
        </div>
      )}
    </div>
  )
}

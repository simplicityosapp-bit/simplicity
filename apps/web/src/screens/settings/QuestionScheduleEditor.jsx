import { useState } from 'react'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* Weekday keys; short labels are translated via t(`schedule.weekdays.${k}`). */
const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6]

function modeOf(question) {
  const p = question?.schedule_pattern
  if (!p) return 'every_day'
  if (p.type === 'days_of_week') {
    const arr = Array.isArray(p.values) ? p.values : []
    if (!arr.length || arr.length === 7) return 'every_day'
    return 'days_of_week'
  }
  if (p.type === 'every_x_days') {
    const x = Number(p.x) || 1
    if (x <= 1) return 'every_day'
    return 'every_x_days'
  }
  return 'every_day'
}

/* Inline editor for a question's schedule_pattern. Three modes:
   "כל יום" (no pattern), "ימים מסוימים" (multi-pill weekday picker),
   "כל X ימים" (number stepper). Saving translates to the data-model
   shape and writes back via onUpdate. */
export default function QuestionScheduleEditor({ question, onClose, onUpdate }) {
  const { t } = useT('settings')
  const [mode, setMode] = useState(() => modeOf(question))
  const [days, setDays] = useState(() => {
    const p = question?.schedule_pattern
    if (p?.type === 'days_of_week' && Array.isArray(p.values)) return p.values
    return [0, 1, 2, 3, 4, 5, 6]
  })
  const [x, setX] = useState(() => {
    const p = question?.schedule_pattern
    if (p?.type === 'every_x_days') return Number(p.x) || 2
    return 2
  })
  const [busy, setBusy] = useState(false)

  const toggleDay = (k) => {
    setDays((prev) => prev.includes(k) ? prev.filter((d) => d !== k) : [...prev, k])
  }

  const submit = async () => {
    let nextPattern = null
    if (mode === 'days_of_week') {
      const v = days.slice().sort((a, b) => a - b)
      nextPattern = v.length === 7 || v.length === 0 ? null : { type: 'days_of_week', values: v }
    } else if (mode === 'every_x_days') {
      /* The user explicitly chose "every X days", so floor at 2 (X=1 is
         just "every day" and has its own mode). A blank/invalid field
         normalises to 2 rather than silently flipping to every-day. */
      const xi = Math.max(2, Math.min(30, parseInt(x, 10) || 2))
      nextPattern = { type: 'every_x_days', x: xi }
    }
    setBusy(true)
    try {
      await onUpdate(question.id, { schedule_pattern: nextPattern })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box className="qs-editor">
      <Box className="qs-modes">
        <Btn type="button" className={`qs-mode${mode === 'every_day' ? ' on' : ''}`} onClick={() => setMode('every_day')}>{t('schedule.everyDay')}</Btn>
        <Btn type="button" className={`qs-mode${mode === 'days_of_week' ? ' on' : ''}`} onClick={() => setMode('days_of_week')}>{t('schedule.daysOfWeek')}</Btn>
        <Btn type="button" className={`qs-mode${mode === 'every_x_days' ? ' on' : ''}`} onClick={() => setMode('every_x_days')}>{t('schedule.everyXDays')}</Btn>
      </Box>

      {mode === 'days_of_week' && (
        <Box className="qs-day-pills">
          {DAY_KEYS.map((k) => (
            <Btn
              key={k}
              type="button"
              className={`qs-day${days.includes(k) ? ' on' : ''}`}
              onClick={() => toggleDay(k)}
              aria-pressed={days.includes(k)}
            >
              {t(`schedule.weekdays.${k}`)}
            </Btn>
          ))}
        </Box>
      )}

      {mode === 'every_x_days' && (
        <Box className="qs-x-row">
          <Txt>{t('schedule.every')}</Txt>
          <Input
            type="number"
            min="2"
            max="30"
            value={x}
            onChange={(e) => setX(e.target.value)}
            onBlur={() => setX((v) => String(Math.max(2, Math.min(30, parseInt(v, 10) || 2))))}
            className="qs-x-input"
          />
          <Txt>{t('schedule.days')}</Txt>
        </Box>
      )}

      <Box className="qs-actions">
        <Btn type="button" className="qs-cancel" onClick={onClose} disabled={busy}>{t('schedule.cancel')}</Btn>
        <Btn type="button" className="qs-save" onClick={submit} disabled={busy}>{busy ? t('schedule.saving') : t('schedule.save')}</Btn>
      </Box>
    </Box>
  )
}

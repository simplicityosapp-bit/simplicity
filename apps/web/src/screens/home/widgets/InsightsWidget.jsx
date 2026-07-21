import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Check, Bell, SkipForward } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { questionText, isQuestionDueToday } from '@simplicity/core'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../../hooks/useDailyAnswers'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import InfoPopover from '../../../components/InfoPopover'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* LOCAL YYYY-MM-DD — must match how daily answers are bucketed elsewhere
   (profileHealth `ymd`, overview `dayKey`). A UTC `toISOString()` here would
   roll an evening answer (Israel UTC+2/+3) to tomorrow's date, so it would
   reappear as unanswered and land on the wrong day in correlations/health. */
const dayStr = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Custom glyph — a question-mark hook whose bottom dot is a heart (matches the
   prototype's "מה איתך היום" collapse control). */
function HeartQIcon() {
  return (
    <svg className="ins-hq-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M8.4 8.6a3.6 3.6 0 1 1 5.5 3.05c-1.25 .8-1.9 1.45-1.9 2.75v.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 20.2c-1.6-1.15-2.9-2.05-2.9-3.45a1.45 1.45 0 0 1 2.9-.5 1.45 1.45 0 0 1 2.9 .5c0 1.4-1.3 2.3-2.9 3.45z" fill="currentColor" />
    </svg>
  )
}

/* Daily-question widget: next unanswered active question for today + live input.
   Answers persist to Supabase; once answered the widget advances. */
export default function InsightsWidget() {
  const { t, gender } = useT('home')
  const navigate = useNavigate()
  const { questions } = useUserQuestions()
  const { answers, addAnswer } = useDailyAnswers()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [val, setVal] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)

  const today = dayStr(0)
  const todayDate = useMemo(() => new Date(), [])
  /* Per-day skip set — shares prefs.insSkipped with the "מה איתך היום"
     screen (identical {date, ids} shape + local ymd key). A question skipped
     here is skipped there too and vice-versa; it auto-expires next day. */
  const skippedToday = useMemo(() => {
    const s = prefs?.insSkipped
    return (s && s.date === today && Array.isArray(s.ids)) ? s.ids : []
  }, [prefs?.insSkipped, today])
  const skippedSet = useMemo(() => new Set(skippedToday), [skippedToday])
  /* "Due today" combines `active` with the per-question
     schedule_pattern (days-of-week / every-X-days). Null pattern
     means "always". */
  const activeQuestions = useMemo(
    () => questions.filter((x) => x.active && isQuestionDueToday(x, todayDate)),
    [questions, todayDate],
  )
  const q = useMemo(
    () => activeQuestions.find((x) => !skippedSet.has(x.id) && !answers.some((a) => a.user_question_id === x.id && a.date === today)),
    [activeQuestions, answers, today, skippedSet],
  )

  /* S1 — soft in-app reminder: if the user enabled the daily reminder and
     the chosen time has passed but a question is still unanswered, show a
     gentle nudge right where they'd answer it (no push, no permissions). */
  const reminder = prefs?.insightsReminder
  const isOverdue = useMemo(() => {
    if (!reminder?.enabled || !q) return false
    const [h, m] = String(reminder.time || '20:00').split(':').map((n) => parseInt(n, 10) || 0)
    const now = new Date()
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
  }, [reminder, q])

  /* The slider renders at 5 while `val` is still null (nothing touched yet).
     Saving used to be gated on `val != null`, so answering the honest value 5
     was impossible: dropping the thumb where it already sits fires no change
     event, leaving the button disabled with no hint why. The displayed number
     and the saved value now both read through this, so what you see on the
     slider is what gets stored. */
  const SLIDER_DEFAULT = 5
  const effectiveVal = val ?? SLIDER_DEFAULT

  const save = async (value) => {
    if (busy || !q) return
    setBusy(true)
    try {
      await addAnswer({ user_question_id: q.id, date: today, value_num: value, value_text: null, note: null })
      setVal(null)
    } catch {
      /* leave value so the user can retry */
    } finally {
      setBusy(false)
    }
  }

  /* Skip one question for today — writes NO answer (streak/averages untouched),
     just drops it from today's queue so the widget advances. Moved here from the
     "מה איתך היום" screen (beta 13/07/2026). */
  const skip = () => {
    if (busy || !q || skippedSet.has(q.id)) return
    updatePrefs?.({ insSkipped: { date: today, ids: [...skippedToday, q.id] } })
    setVal(null)
  }
  const skipBtn = (
    <Btn type="button" className="ins-skip-btn" disabled={busy} onClick={skip} aria-label={t('widgets.insights.skipAria')}>
      <SkipForward size={13} strokeWidth={1.7} aria-hidden="true" />
      {t('widgets.insights.skip')}
    </Btn>
  )

  const collapseBtn = (
    <Btn
      type="button"
      className="ins-collapse-btn"
      aria-label={collapsed ? t('widgets.insights.expand') : t('widgets.insights.collapse')}
      title={collapsed ? t('widgets.insights.expand') : t('widgets.insights.collapse')}
      onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c) }}
    >
      <HeartQIcon />
    </Btn>
  )

  if (collapsed) {
    return (
      <Box className="ins-widget is-collapsed">
        <Box className="ins-collapsed">{collapseBtn}</Box>
      </Box>
    )
  }

  /* No questions yet — soft nudge to add one in settings. */
  if (activeQuestions.length === 0) {
    return (
      <Box className="ins-widget has-collapse">
        {collapseBtn}
        <Txt as="p" className="ins-q"><Sparkles size={16} strokeWidth={1.6} aria-hidden="true" /> {t('widgets.insights.prompt')}</Txt>
        <Btn type="button" className="ins-add-link" onClick={() => navigate(ROUTES.SETTINGS)}>
          {t('widgets.insights.addQuestion')}
        </Btn>
      </Box>
    )
  }

  if (!q) {
    return (
      <Box className="ins-widget has-collapse">
        {collapseBtn}
        <Txt as="p" className="ins-empty">{t('widgets.insights.done')}</Txt>
      </Box>
    )
  }

  const text = questionText(q, gender)
  const yAns = answers.find((a) => a.user_question_id === q.id && a.date === dayStr(-1))
  const yVal = yAns && typeof yAns.value_num === 'number' ? Number(yAns.value_num) : null

  let compare = ''
  if (val != null && yVal != null && q.scale_type !== 'yes_no') {
    if (val > yVal) compare = t('widgets.insights.improved')
    else if (val === yVal) compare = t('widgets.insights.stable')
    else compare = t('widgets.insights.lower')
  }

  const isYesNo = q.scale_type === 'yes_no'

  return (
    <Box className={`ins-widget${isYesNo ? ' has-collapse' : ' ins-slider-mode'}`}>
      {/* Skip sits in the widget's top corner (absolute) so it costs no row. */}
      {skipBtn}
      {/* Yes/no keeps the floating collapse toggle; the slider layout folds
          the toggle into the control row so it sits inline beside the
          slider (see below). */}
      {isYesNo && collapseBtn}
      {isOverdue && (
        <Txt as="p" className="ins-reminder">
          <Bell size={12} strokeWidth={1.8} aria-hidden="true" /> {t('widgets.insights.reminder')}
        </Txt>
      )}
      <Txt as="p"
        className="ins-q ins-q-link"
        role="button"
        tabIndex={0}
        onClick={() => navigate(ROUTES.INSIGHTS)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(ROUTES.INSIGHTS) } }}
      >
        <Sparkles size={16} strokeWidth={1.6} aria-hidden="true" /> {text}
        <InfoPopover
          label={t('widgets.insights.infoLabel')}
          text={t('widgets.insights.infoText')}
        />
      </Txt>

      {isYesNo ? (
        <Box className="ins-yn">
          <Btn type="button" className="ins-yn-btn" disabled={busy} onClick={() => save(1)}>{t('widgets.insights.yes')}</Btn>
          <Btn type="button" className="ins-yn-btn" disabled={busy} onClick={() => save(0)}>{t('widgets.insights.no')}</Btn>
        </Box>
      ) : (
        /* One compact line: collapse toggle and the save check sit at the two
           ends with the slider stretched between them. The current value is
           shown as a fixed number stacked above the check (no floating pill),
           which lets the row keep a single, short height. */
        <Box className="ins-slider-wrap">
          {/* The live value floats centred just above the slider; the day-over-day
              comparison sits out of flow at the inline-end so they never overlap. */}
          {compare && <Txt as="p" className="ins-compare">{compare}</Txt>}
          <Txt className="ins-slider-val mono" aria-hidden="true">{effectiveVal}</Txt>
          {collapseBtn}
          <Input
            type="range"
            min="1"
            max="10"
            step="1"
            value={effectiveVal}
            className="ins-slider"
            aria-label={text}
            onChange={(e) => setVal(parseInt(e.target.value, 10))}
          />
          <Btn type="button" className="ins-save-btn" disabled={busy} onClick={() => save(effectiveVal)} aria-label={t('widgets.insights.saveAria')}>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
          </Btn>
        </Box>
      )}
    </Box>
  )
}

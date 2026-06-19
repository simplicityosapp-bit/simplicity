import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Check, Bell } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { questionText, isQuestionDueToday } from '../../../lib/questionTemplates'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../../hooks/useDailyAnswers'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import InfoPopover from '../../../components/InfoPopover'
import { useT } from '../../../i18n/useT'

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
  const { prefs } = useUserPreferences()
  const [val, setVal] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)

  const today = dayStr(0)
  const todayDate = useMemo(() => new Date(), [])
  /* "Due today" combines `active` with the per-question
     schedule_pattern (days-of-week / every-X-days). Null pattern
     means "always". */
  const activeQuestions = useMemo(
    () => questions.filter((x) => x.active && isQuestionDueToday(x, todayDate)),
    [questions, todayDate],
  )
  const q = useMemo(
    () => activeQuestions.find((x) => !answers.some((a) => a.user_question_id === x.id && a.date === today)),
    [activeQuestions, answers, today],
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

  const collapseBtn = (
    <button
      type="button"
      className="ins-collapse-btn"
      aria-label={collapsed ? t('widgets.insights.expand') : t('widgets.insights.collapse')}
      title={collapsed ? t('widgets.insights.expand') : t('widgets.insights.collapse')}
      onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c) }}
    >
      <HeartQIcon />
    </button>
  )

  if (collapsed) {
    return (
      <div className="ins-widget is-collapsed">
        <div className="ins-collapsed">{collapseBtn}</div>
      </div>
    )
  }

  /* No questions yet — soft nudge to add one in settings. */
  if (activeQuestions.length === 0) {
    return (
      <div className="ins-widget has-collapse">
        {collapseBtn}
        <p className="ins-q"><Sparkles size={16} strokeWidth={1.6} aria-hidden="true" /> {t('widgets.insights.prompt')}</p>
        <button type="button" className="ins-add-link" onClick={() => navigate(ROUTES.SETTINGS)}>
          {t('widgets.insights.addQuestion')}
        </button>
      </div>
    )
  }

  if (!q) {
    return (
      <div className="ins-widget has-collapse">
        {collapseBtn}
        <p className="ins-empty">{t('widgets.insights.done')}</p>
      </div>
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

  return (
    <div className="ins-widget has-collapse">
      {collapseBtn}
      {isOverdue && (
        <p className="ins-reminder">
          <Bell size={12} strokeWidth={1.8} aria-hidden="true" /> {t('widgets.insights.reminder')}
        </p>
      )}
      <p
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
      </p>

      {q.scale_type === 'yes_no' ? (
        <div className="ins-yn">
          <button type="button" className="ins-yn-btn" disabled={busy} onClick={() => save(1)}>{t('widgets.insights.yes')}</button>
          <button type="button" className="ins-yn-btn" disabled={busy} onClick={() => save(0)}>{t('widgets.insights.no')}</button>
        </div>
      ) : (
        <div className="ins-slider-wrap">
          <div className="ins-slider-track">
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={val ?? 5}
              className="ins-slider"
              aria-label={text}
              onChange={(e) => setVal(parseInt(e.target.value, 10))}
            />
            {/* Value pill that rides above the thumb (RTL: value grows
                right→left, so anchor from the right). 9px = half the 18px
                thumb, keeping the pill centred over it at both ends. */}
            <span
              className="ins-slider-bubble mono"
              style={{ right: `calc(${(((val ?? 5) - 1) / 9)} * (100% - 18px) + 9px)` }}
            >
              {val ?? '—'}
            </span>
          </div>
          <button type="button" className="ins-save-btn" disabled={busy || val == null} onClick={() => save(val)} aria-label={t('widgets.insights.saveAria')}>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      {compare && <p className="ins-compare">{compare}</p>}
    </div>
  )
}

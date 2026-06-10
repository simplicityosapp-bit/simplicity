import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Check, ChevronDown, ChevronUp, RotateCcw, SkipForward } from 'lucide-react'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { questionText, isQuestionDueToday } from '../../lib/questionTemplates'
import {
  averageForWindow, deltaVsPrevWindow, trendPoints, heatmapWeeks,
  mirrorReflections, indexAnswers, dateKey,
} from '../../lib/insights'
import { fmtShortDate } from '../../lib/dates'
import './InsightsScreen.css'

/* ── Inline trend line — last 30 days, missing days drawn as gaps. */
function TrendLine({ points }) {
  const W = 240, H = 48, pad = 4
  const numeric = points.filter((p) => p.value != null)
  if (numeric.length < 2) {
    return <div className="ins-trend-empty">אין מספיק נתונים</div>
  }
  const min = Math.min(...numeric.map((p) => p.value))
  const max = Math.max(...numeric.map((p) => p.value))
  const range = max - min || 1
  const xs = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad)
  const ys = (v) => H - pad - ((v - min) / range) * (H - 2 * pad)
  /* Build segments that skip null days so the line doesn't connect
     across gaps. */
  const segments = []
  let curr = []
  points.forEach((p, i) => {
    if (p.value == null) { if (curr.length) { segments.push(curr); curr = [] } }
    else curr.push([xs(i), ys(p.value)])
  })
  if (curr.length) segments.push(curr)
  return (
    <svg className="ins-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מגמת השאלה ב-30 הימים האחרונים">
      {segments.map((seg, i) => (
        <polyline key={i} className="ins-trend-line" points={seg.map((p) => p.join(',')).join(' ')} />
      ))}
      {points.map((p, i) => p.value == null ? null : (
        <circle key={i} className="ins-trend-dot" cx={xs(i)} cy={ys(p.value)} r="1.6" />
      ))}
    </svg>
  )
}

/* ── 53 × 7 heatmap. Cells are <rect>s — small enough to render
   ~370 in a single SVG without slowing. Colour scales linearly from
   the question's observed min to its observed max. */
function Heatmap({ weeks, scale }) {
  const CELL = 9, GAP = 2
  const W = weeks.length * (CELL + GAP)
  const H = 7 * (CELL + GAP)
  /* Determine min/max for the value→opacity map. yes_no is binary. */
  const values = weeks.flat().filter(Boolean).map((c) => c.value).filter((v) => v != null)
  const min = values.length ? Math.min(...values) : 1
  const max = values.length ? Math.max(...values) : 10
  const range = (max - min) || 1
  const opacity = (v) => {
    if (scale === 'yes_no') return v >= 1 ? 0.85 : 0.2
    return 0.18 + ((v - min) / range) * 0.72
  }
  return (
    <svg className="ins-heat-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMin meet" role="img" aria-label="היסטוריית תשובות שנתית">
      {weeks.map((col, ci) => col.map((cell, ri) => {
        if (!cell) return null
        const x = ci * (CELL + GAP)
        const y = ri * (CELL + GAP)
        const filled = cell.value != null
        return (
          <rect
            key={`${ci}-${ri}`}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            rx="1.5"
            className={filled ? 'ins-heat-cell on' : 'ins-heat-cell off'}
            opacity={filled ? opacity(cell.value) : 1}
          >
            <title>{`${fmtShortDate(cell.date)}${filled ? ` · ${cell.value}` : ''}`}</title>
          </rect>
        )
      }))}
    </svg>
  )
}

function DeltaPill({ delta }) {
  if (delta == null || Math.abs(delta) < 0.05) return null
  const tone = delta > 0 ? 'pos' : 'neg'
  const sign = delta > 0 ? '+' : '−'
  return <span className={`ins-delta ${tone} mono`}>{sign}{Math.abs(delta).toFixed(1)}</span>
}

function QuestionCard({ question, idx, latestAnswerToday, onSubmit, busy, draft, setDraft, canAnswer, onToggle, skipped, onSkip }) {
  const avg7 = averageForWindow(idx, question.id, 7)
  const avg30 = averageForWindow(idx, question.id, 30)
  const d7 = deltaVsPrevWindow(idx, question.id, 7)
  const points = useMemo(() => trendPoints(idx, question.id, 30), [idx, question.id])
  const heat  = useMemo(() => heatmapWeeks(idx, question.id, new Date(), 26), [idx, question.id])
  const isYn = question.scale_type === 'yes_no'
  const active = !!question.active

  return (
    <section className={`ins-q-card${active ? '' : ' inactive'}`}>
      <div className="ins-q-head">
        <span className="ins-q-icon">{question.icon || '🫧'}</span>
        <p className="ins-q-text">{questionText(question)}</p>
        {latestAnswerToday != null && <span className="ins-q-today-pill mono">היום · {latestAnswerToday}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? `כיבוי השאלה "${questionText(question)}"` : `הפעלת השאלה "${questionText(question)}"`}
          title={active ? 'כיבוי השאלה' : 'הפעלת השאלה'}
          className={`ins-q-toggle${active ? ' on' : ''}`}
          onClick={onToggle}
        >
          <span className="ins-q-toggle-knob" />
        </button>
      </div>

      {/* Entry row — only for an active, due-today question not yet
          answered AND not skipped-for-today (beta 07/06/2026: a small
          "דלג" lets the user dismiss one question for the day without
          answering — no answer is written, so streak/averages are
          untouched). */}
      {canAnswer && latestAnswerToday == null && !skipped && (
        <div className="ins-q-entry">
          {isYn ? (
            <div className="ins-yn">
              <button type="button" disabled={busy} onClick={() => onSubmit(1)} className="ins-yn-btn">כן</button>
              <button type="button" disabled={busy} onClick={() => onSubmit(0)} className="ins-yn-btn">לא</button>
            </div>
          ) : (
            <>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={draft ?? 5}
                onChange={(e) => setDraft(parseInt(e.target.value, 10))}
                className="ins-slider"
              />
              <span className="ins-slider-val mono">{draft ?? '—'}</span>
              <button
                type="button"
                className="ins-save"
                disabled={busy || draft == null}
                onClick={() => onSubmit(draft)}
                aria-label="שמור"
              >
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
          <button
            type="button"
            className="ins-skip-btn"
            disabled={busy}
            onClick={onSkip}
            aria-label="דלג על השאלה להיום"
          >
            <SkipForward size={13} strokeWidth={1.7} aria-hidden="true" />
            דלג
          </button>
        </div>
      )}

      <div className="ins-q-stats">
        <div className="ins-stat">
          <p className="ins-stat-l">ממוצע 7 ימים</p>
          <p className="ins-stat-v mono">
            {avg7 != null ? avg7.toFixed(1) : '—'}
            <DeltaPill delta={d7} />
          </p>
        </div>
        <div className="ins-stat divided">
          <p className="ins-stat-l">ממוצע 30 ימים</p>
          <p className="ins-stat-v mono">{avg30 != null ? avg30.toFixed(1) : '—'}</p>
        </div>
        <div className="ins-stat">
          <p className="ins-stat-l">30 ימים אחרונים</p>
          <TrendLine points={points} />
        </div>
      </div>

      <div className="ins-q-heat">
        <p className="ins-heat-h">חצי שנה אחרונה</p>
        <div className="ins-heat-wrap">
          <Heatmap weeks={heat} scale={question.scale_type} />
        </div>
      </div>
    </section>
  )
}

export default function InsightsScreen() {
  const { questions, loading: questionsLoading, error: questionsError, addQuestion: _add, updateQuestion, toggleActive } = useUserQuestions()
  const { answers, addAnswer } = useDailyAnswers()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [drafts, setDrafts] = useState({}) /* qId → slider draft */
  const [busy, setBusy] = useState({})     /* qId → bool */
  const [historyOpen, setHistoryOpen] = useState(!!prefs?.insShowHistory)

  /* Keep the controlled toggle in sync if prefs hydrate after mount. */
  useEffect(() => { setHistoryOpen(!!prefs?.insShowHistory) }, [prefs?.insShowHistory])

  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const idx = useMemo(() => indexAnswers(answers), [answers])
  /* Show every question (active + off) so the on/off toggle works in place.
     Off questions render greyed; only active+due-today ones can be answered. */
  const visible = useMemo(() => questions || [], [questions])
  const canAnswer = useMemo(() => {
    const m = new Map()
    for (const q of visible) m.set(q.id, q.active && isQuestionDueToday(q, today))
    return m
  }, [visible, today])
  const reflections = useMemo(() => mirrorReflections(questions || [], idx, today), [questions, idx, today])

  /* Per-day skip set (beta 07/06/2026). Stored as a single-day object in
     prefs JSONB ({date, ids}) so it auto-expires next day and never grows —
     no migration. Skipping writes NO answer, so streak/averages are untouched. */
  const skippedToday = useMemo(() => {
    const s = prefs?.insSkipped
    return (s && s.date === todayKey && Array.isArray(s.ids)) ? s.ids : []
  }, [prefs?.insSkipped, todayKey])
  const skippedSet = useMemo(() => new Set(skippedToday), [skippedToday])

  const skipQuestion = (qId) => {
    if (skippedSet.has(qId)) return
    updatePrefs?.({ insSkipped: { date: todayKey, ids: [...skippedToday, qId] } })
  }
  const unskipAll = () => updatePrefs?.({ insSkipped: { date: todayKey, ids: [] } })

  /* Count of today's skipped questions that are still answerable (active,
     due, unanswered) — drives the "ענה על N שדולגו" button below the grid. */
  const skippedCount = useMemo(() => visible.filter((q) => {
    if (!skippedSet.has(q.id) || !canAnswer.get(q.id)) return false
    const v = idx.get(q.id)?.get(todayKey)
    return !(v && v.value_num != null)
  }).length, [visible, skippedSet, canAnswer, idx, todayKey])

  const setDraft = (qId, v) => setDrafts((d) => ({ ...d, [qId]: v }))

  const submit = async (q, value) => {
    if (busy[q.id]) return
    setBusy((b) => ({ ...b, [q.id]: true }))
    try {
      await addAnswer({
        user_question_id: q.id,
        date: todayKey,
        value_num: value,
        value_text: null,
        note: null,
      })
      setDraft(q.id, null)
    } finally {
      setBusy((b) => ({ ...b, [q.id]: false }))
    }
  }

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    updatePrefs?.({ insShowHistory: next })
  }

  /* Sort recent answers desc by date for the history list. */
  const recent = useMemo(() => {
    const live = (answers || []).filter((a) => !a.deleted_at)
    return live.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30)
  }, [answers])

  const questionById = useMemo(() => {
    const m = new Map()
    for (const q of questions || []) m.set(q.id, q)
    return m
  }, [questions])

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{(questions || []).filter((q) => q.active).length} פעילות</p>
              <span className="lbl dot">·</span>
              <p className="lbl">תובנות יומיות</p>
            </div>
            <p className="lbl-sm">הקשבה לעצמך, יום אחרי יום.</p>
          </div>
          <p className="t-screen">מה איתך היום</p>
        </header>
      </div>

      {/* Reflections card */}
      {reflections.length > 0 && (
        <section className="ins-mirror">
          <div className="ins-mirror-head">
            <Sparkles size={16} strokeWidth={1.6} aria-hidden="true" />
            <p className="ins-mirror-title">שיקוף יומי</p>
          </div>
          <ul className="ins-mirror-list">
            {reflections.map((r, i) => (
              <li key={i} className={`ins-mirror-line ${r.kind}`}>{r.text}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-question cards */}
      {questionsLoading ? (
        <div className="empty"><p className="empty-text">טוען…</p></div>
      ) : questionsError ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינת השאלות. אפשר לנסות לרענן.</p></div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p className="empty-text">עדיין אין שאלות יומיות. אפשר להוסיף בהגדרות.</p>
        </div>
      ) : (
        <div className="ins-q-grid">
          {visible.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              idx={idx}
              canAnswer={!!canAnswer.get(q.id)}
              onToggle={() => toggleActive(q)}
              latestAnswerToday={(() => {
                const v = idx.get(q.id)?.get(todayKey)
                return v && v.value_num != null ? Number(v.value_num) : null
              })()}
              busy={!!busy[q.id]}
              draft={drafts[q.id]}
              setDraft={(v) => setDraft(q.id, v)}
              onSubmit={(v) => submit(q, v)}
              skipped={skippedSet.has(q.id)}
              onSkip={() => skipQuestion(q.id)}
            />
          ))}
        </div>
      )}

      {/* Re-open today's skipped questions so they can still be answered. */}
      {skippedCount > 0 && (
        <div className="ins-unskip-row">
          <button type="button" className="ins-unskip-btn" onClick={unskipAll}>
            <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" />
            {skippedCount === 1 ? 'ענה על שאלה אחת שדולגה' : `ענה על ${skippedCount} שאלות שדולגו`}
          </button>
        </div>
      )}

      {/* History */}
      <section className="ins-history">
        <button type="button" className="ins-history-toggle" onClick={toggleHistory} aria-expanded={historyOpen}>
          היסטוריה
          {historyOpen
            ? <ChevronUp size={15} strokeWidth={1.7} aria-hidden="true" />
            : <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />}
        </button>
        {historyOpen && (
          recent.length === 0
            ? <p className="ins-history-empty">אין עדיין תשובות בהיסטוריה.</p>
            : (
              <div className="ins-history-list">
                {recent.map((a) => {
                  const q = questionById.get(a.user_question_id)
                  return (
                    <div key={a.id} className="ins-history-row">
                      <span className="ins-history-icon">{q?.icon || '🫧'}</span>
                      <span className="ins-history-text">{q ? questionText(q) : 'שאלה שנמחקה'}</span>
                      <span className="ins-history-meta">
                        <span className="ins-history-date">{fmtShortDate(a.date)}</span>
                        <span className="ins-history-val mono">{a.value_num != null ? a.value_num : (a.value_text || '—')}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )
        )}
      </section>
    </div>
  )
}

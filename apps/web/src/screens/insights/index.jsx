import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Check, ChevronDown, ChevronUp, RotateCcw, SkipForward, Plus, Pencil, Trash2 } from 'lucide-react'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import AddQuestionModal from '../../modals/AddQuestionModal'
import EditQuestionModal from '../../modals/EditQuestionModal'
import ConfirmModal from '../../modals/ConfirmModal'
import { questionText, isQuestionDueToday } from '../../lib/questionTemplates'
import {
  averageForWindow, deltaVsPrevWindow, trendPoints, heatmapWeeks,
  mirrorReflections, indexAnswers, dateKey,
} from '../../lib/insights'
import { fmtShortDate } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import './InsightsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* ── Inline trend line — last 30 days, missing days drawn as gaps. */
function TrendLine({ points, t }) {
  const W = 240, H = 48, pad = 4
  const numeric = points.filter((p) => p.value != null)
  if (numeric.length < 2) {
    return <Box className="ins-trend-empty">{t('trend.notEnough')}</Box>
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
    <svg className="ins-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('trend.aria')}>
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
function Heatmap({ weeks, scale, t }) {
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
    <svg className="ins-heat-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMin meet" role="img" aria-label={t('heatmap.aria')}>
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
  return <Txt className={`ins-delta ${tone} mono`}>{sign}{Math.abs(delta).toFixed(1)}</Txt>
}

function QuestionCard({ question, idx, latestAnswerToday, onSubmit, busy, draft, setDraft, canAnswer, onToggle, onEdit, onDelete, skipped, onSkip, t, gender }) {
  const avg7 = useMemo(() => averageForWindow(idx, question.id, 7), [idx, question.id])
  const avg30 = useMemo(() => averageForWindow(idx, question.id, 30), [idx, question.id])
  const d7 = useMemo(() => deltaVsPrevWindow(idx, question.id, 7), [idx, question.id])
  const points = useMemo(() => trendPoints(idx, question.id, 30), [idx, question.id])
  const heat  = useMemo(() => heatmapWeeks(idx, question.id, new Date(), 26), [idx, question.id])
  const isYn = question.scale_type === 'yes_no'
  const active = !!question.active

  return (
    <Box as="section" className={`ins-q-card${active ? '' : ' inactive'}`}>
      <Box className="ins-q-head">
        <Txt className="ins-q-icon">{question.icon || '🫧'}</Txt>
        <Txt as="p" className="ins-q-text">{questionText(question, gender)}</Txt>
        {latestAnswerToday != null && <Txt className="ins-q-today-pill mono">{t('card.todayPill', { value: latestAnswerToday })}</Txt>}
        <Btn
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? t('card.turnOffAria', { question: questionText(question, gender) }) : t('card.turnOnAria', { question: questionText(question, gender) })}
          title={active ? t('card.turnOffTitle') : t('card.turnOnTitle')}
          className={`ins-q-toggle${active ? ' on' : ''}`}
          onClick={onToggle}
        >
          <Txt className="ins-q-toggle-knob" />
        </Btn>
        <Btn
          type="button"
          className="ins-q-icon-btn"
          onClick={onEdit}
          aria-label={t('card.editAria', { question: questionText(question, gender) })}
          title={t('card.editTitle')}
        >
          <Pencil size={14} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        <Btn
          type="button"
          className="ins-q-icon-btn danger"
          onClick={onDelete}
          aria-label={t('card.deleteAria', { question: questionText(question, gender) })}
          title={t('card.deleteTitle')}
        >
          <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
      </Box>

      {/* Entry row — only for an active, due-today question not yet
          answered AND not skipped-for-today (beta 07/06/2026: a small
          "דלג" lets the user dismiss one question for the day without
          answering — no answer is written, so streak/averages are
          untouched). */}
      {canAnswer && latestAnswerToday == null && !skipped && (
        <Box className="ins-q-entry">
          {isYn ? (
            <Box className="ins-yn">
              <Btn type="button" disabled={busy} onClick={() => onSubmit(1)} className="ins-yn-btn">{t('card.yes')}</Btn>
              <Btn type="button" disabled={busy} onClick={() => onSubmit(0)} className="ins-yn-btn">{t('card.no')}</Btn>
            </Box>
          ) : (
            <>
              <Input
                type="range"
                min="1"
                max="10"
                step="1"
                value={draft ?? 5}
                onChange={(e) => setDraft(parseInt(e.target.value, 10))}
                className="ins-slider"
              />
              <Txt className="ins-slider-val mono">{draft ?? '—'}</Txt>
              <Btn
                type="button"
                className="ins-save"
                disabled={busy || draft == null}
                onClick={() => onSubmit(draft)}
                aria-label={t('card.save')}
              >
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </>
          )}
          <Btn
            type="button"
            className="ins-skip-btn"
            disabled={busy}
            onClick={onSkip}
            aria-label={t('card.skipAria')}
          >
            <SkipForward size={13} strokeWidth={1.7} aria-hidden="true" />
            {t('card.skip')}
          </Btn>
        </Box>
      )}

      <Box className="ins-q-stats">
        <Box className="ins-stat">
          <Txt as="p" className="ins-stat-l">{t('card.avg7')}</Txt>
          <Txt as="p" className="ins-stat-v mono">
            {avg7 != null ? avg7.toFixed(1) : '—'}
            <DeltaPill delta={d7} />
          </Txt>
        </Box>
        <Box className="ins-stat divided">
          <Txt as="p" className="ins-stat-l">{t('card.avg30')}</Txt>
          <Txt as="p" className="ins-stat-v mono">{avg30 != null ? avg30.toFixed(1) : '—'}</Txt>
        </Box>
        <Box className="ins-stat">
          <Txt as="p" className="ins-stat-l">{t('card.last30')}</Txt>
          <TrendLine points={points} t={t} />
        </Box>
      </Box>

      <Box className="ins-q-heat">
        <Txt as="p" className="ins-heat-h">{t('heatmap.heading')}</Txt>
        <Box className="ins-heat-wrap">
          <Heatmap weeks={heat} scale={question.scale_type} t={t} />
        </Box>
      </Box>
    </Box>
  )
}

export default function InsightsScreen() {
  const { t, gender } = useT('insights')
  const { questions, loading: questionsLoading, error: questionsError, addQuestion, updateQuestion, toggleActive, removeQuestion } = useUserQuestions()
  const { answers, addAnswer } = useDailyAnswers()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [drafts, setDrafts] = useState({}) /* qId → slider draft */
  const [busy, setBusy] = useState({})     /* qId → bool */
  const [historyOpen, setHistoryOpen] = useState(!!prefs?.insShowHistory)
  const [showAddQuestion, setShowAddQuestion] = useState(false)
  const [editQuestion, setEditQuestion] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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
  const reflections = useMemo(() => mirrorReflections(questions || [], idx, today, gender), [questions, idx, today, gender])

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
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('activeCount', { count: (questions || []).filter((q) => q.active).length })}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{t('dailyInsights')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('tagline')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('title')}</Txt>
        </Box>
        <Btn
          className="cta-add"
          type="button"
          aria-label={t('addQuestionAria')}
          onClick={() => setShowAddQuestion(true)}
        >
          {t('addQuestion')}
        </Btn>
      </Box>

      {/* Reflections card */}
      {reflections.length > 0 && (
        <Box as="section" className="ins-mirror">
          <Box className="ins-mirror-head">
            <Sparkles size={16} strokeWidth={1.6} aria-hidden="true" />
            <Txt as="p" className="ins-mirror-title">{t('mirror.title')}</Txt>
          </Box>
          <Box as="ul" className="ins-mirror-list">
            {reflections.map((r) => (
              <Box as="li" key={`${r.kind}-${r.text}`} className={`ins-mirror-line ${r.kind}`}>{r.text}</Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Per-question cards */}
      {questionsLoading ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
      ) : questionsError ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loadError')}</Txt></Box>
      ) : visible.length === 0 ? (
        <Box className="empty">
          <Txt as="p" className="empty-text">{t('empty')}</Txt>
          <Btn type="button" className="ins-empty-add" onClick={() => setShowAddQuestion(true)}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('emptyAdd')}
          </Btn>
        </Box>
      ) : (
        <Box className="ins-q-grid">
          {visible.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              idx={idx}
              canAnswer={!!canAnswer.get(q.id)}
              onToggle={() => toggleActive(q)}
              onEdit={() => setEditQuestion(q)}
              onDelete={() => setPendingDelete(q)}
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
              t={t}
              gender={gender}
            />
          ))}
        </Box>
      )}

      {/* Re-open today's skipped questions so they can still be answered. */}
      {skippedCount > 0 && (
        <Box className="ins-unskip-row">
          <Btn type="button" className="ins-unskip-btn" onClick={unskipAll}>
            <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" />
            {skippedCount === 1 ? t('unskip.one') : t('unskip.many', { count: skippedCount })}
          </Btn>
        </Box>
      )}

      {/* History */}
      <Box as="section" className="ins-history">
        <Btn type="button" className="ins-history-toggle" onClick={toggleHistory} aria-expanded={historyOpen}>
          {t('history.title')}
          {historyOpen
            ? <ChevronUp size={15} strokeWidth={1.7} aria-hidden="true" />
            : <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />}
        </Btn>
        {historyOpen && (
          recent.length === 0
            ? <Txt as="p" className="ins-history-empty">{t('history.empty')}</Txt>
            : (
              <Box className="ins-history-list">
                {recent.map((a) => {
                  const q = questionById.get(a.user_question_id)
                  return (
                    <Box key={a.id} className="ins-history-row">
                      <Txt className="ins-history-icon">{q?.icon || '🫧'}</Txt>
                      <Txt className="ins-history-text">{q ? questionText(q, gender) : t('history.deletedQuestion')}</Txt>
                      <Txt className="ins-history-meta">
                        <Txt className="ins-history-date">{fmtShortDate(a.date)}</Txt>
                        <Txt className="ins-history-val mono">{a.value_num != null ? a.value_num : (a.value_text || '—')}</Txt>
                      </Txt>
                    </Box>
                  )
                })}
              </Box>
            )
        )}
      </Box>

      <AddQuestionModal
        open={showAddQuestion}
        onClose={() => setShowAddQuestion(false)}
        onSave={addQuestion}
        nextOrder={(questions || []).length}
        usedTemplateKeys={(questions || []).filter((q) => q.template_key).map((q) => q.template_key)}
      />
      <EditQuestionModal
        key={editQuestion?.id}
        open={!!editQuestion}
        onClose={() => setEditQuestion(null)}
        question={editQuestion}
        onSave={updateQuestion}
      />
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('delete.title')}
        message={pendingDelete ? t('delete.message', { question: questionText(pendingDelete, gender) }) : ''}
        confirmLabel={t('delete.confirm')}
        danger
        onConfirm={() => { if (pendingDelete) removeQuestion(pendingDelete.id) }}
      />
    </Box>
  )
}

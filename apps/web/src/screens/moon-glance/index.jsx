import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { Moon, BarChart3 } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { moonGetData, moonGetCategories, moonTrend, moonReflection, questionText, buildOverviewTrend, buildOverviewCorrelations, OVERVIEW_METRICS } from '@simplicity/core'
import MoonDualBars from '../../components/MoonDualBars'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useMoonSnapshots } from '../../hooks/useMoonSnapshots'
import { useSessions } from '../../hooks/useSessions'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import MultiTrendChart from '../../components/MultiTrendChart'
import { Box, Txt, Btn } from '../../components/ui'
import { useT } from '../../i18n/useT'
import './MoonGlanceScreen.css'

/* Shared window (days) for BOTH the cross-module trend overlay and the
   guarded correlations beneath it, so they always describe the same period. */
const OV_WINDOW = 30

/* Tiny scatter for a correlation card — honest display so the user sees
   the spread, not just a number. Points are min-max scaled per axis. */
function Scatter({ points, driverText, outcomeText }) {
  const { t } = useT('moon')
  const W = 120, H = 78, PAD = 6
  if (!points || points.length < 3) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys), ymax = Math.max(...ys)
  const sx = (x) => (xmax === xmin ? W / 2 : PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD))
  const sy = (y) => (ymax === ymin ? H / 2 : H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD))
  return (
    <svg className="mg-scatter" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('scatter.aria', { driver: driverText || t('scatter.xFallback'), outcome: outcomeText || t('scatter.yFallback') })}>
      <title>{t('scatter.title', { driver: driverText || '', outcome: outcomeText || '' })}</title>
      {points.map((p, i) => (
        <circle key={i} cx={Math.round(sx(p.x) * 10) / 10} cy={Math.round(sy(p.y) * 10) / 10} r="2.2" className="mg-scatter-dot" />
      ))}
    </svg>
  )
}

function CorrCard({ driverText, outcomeText, c }) {
  const { t } = useT('moon')
  /* Symmetric co-movement phrasing — deliberately NOT "X drives Y". */
  const lineKey = c.direction === 'pos' ? 'corr.moveTogether' : 'corr.moveOpposite'
  return (
    <Box className="mg-corr-card">
      <Box className="mg-corr-text">
        <Txt as="p" className="mg-corr-line">
          <Trans t={t} i18nKey={lineKey} values={{ driver: driverText, outcome: outcomeText }} components={[<b key="d" />, <b key="o" />]} />
        </Txt>
        <Txt as="p" className="mg-corr-sub">{t('corr.sub', { strength: c.strength, n: c.n })}</Txt>
      </Box>
      <Scatter points={c.points} driverText={driverText} outcomeText={outcomeText} />
    </Box>
  )
}

/* Metric toggles for the cross-module trend overlay (§8.1). */
const OVERVIEW_PILLS = [
  { key: 'income',   labelKey: 'pills.income' },
  { key: 'leads',    labelKey: 'pills.leads' },
  { key: 'sessions', labelKey: 'pills.sessions' },
  { key: 'score',    labelKey: 'pills.score' },
  { key: 'question', labelKey: 'pills.question' },
]
const dayKeyOf = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function TrendChart({ data }) {
  const { t } = useT('moon')
  const W = 300
  const H = 84
  const pad = 5
  if (data.length < 2) return null
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
    const y = H - pad - (d.score / 100) * (H - 2 * pad)
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  })
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`
  return (
    <svg className="mg-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('trend.aria')}>
      <polygon className="mg-trend-area" points={area} />
      <polyline className="mg-trend-line" points={line} />
    </svg>
  )
}

export default function MoonGlanceScreen() {
  const { t, gender } = useT('moon')
  const navigate = useNavigate()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { entries } = useGoalEntries()
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { answers } = useDailyAnswers()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { sessions } = useSessions()
  const { questions } = useUserQuestions()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const liveTrend = useMemo(() => moonTrend(30, new Date(), data), [data])
  const { snapshots } = useMoonSnapshots(30)

  /* Prefer real persisted snapshots once we have enough to draw a
     meaningful line; fall back to the live recompute for users who
     just started (no historical snapshots yet). */
  const trend = useMemo(() => {
    if (snapshots && snapshots.length >= 2) {
      return snapshots.map((s) => ({
        date: new Date(s.date),
        score: Number(s.confidence ?? s.score ?? 0),
      }))
    }
    return liveTrend
  }, [snapshots, liveTrend])

  const scores = trend.map((t) => t.score)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const peak = scores.length ? Math.max(...scores) : 0

  /* ── Cross-module trend overlay (§8.1) ───────────────────────── */
  const activeQuestions = useMemo(() => (questions || []).filter((q) => q.active), [questions])
  const [overviewKeys, setOverviewKeys] = useState(['income', 'score'])
  const [questionId, setQuestionId] = useState('')
  const toggleOverviewKey = (k) => {
    setOverviewKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
    if (k === 'question' && !questionId && activeQuestions.length) setQuestionId(activeQuestions[0].id)
  }
  const scoreByDay = useMemo(() => {
    const m = {}
    trend.forEach((t) => { m[dayKeyOf(t.date)] = t.score })
    return m
  }, [trend])
  const selectedQuestion = activeQuestions.find((q) => q.id === questionId)
  const overview = useMemo(
    () => buildOverviewTrend(overviewKeys, {
      transactions, leads, sessions, answers, scoreByDay, questionId: questionId || null,
    }, { window: OV_WINDOW, questionLabel: selectedQuestion ? questionText(selectedQuestion, gender) : undefined }),
    [overviewKeys, transactions, leads, sessions, answers, scoreByDay, questionId, selectedQuestion, gender],
  )
  /* Guarded correlations (§8.2) — Spearman + permutation + split-half;
     the common result is an honest "no significant link". Same window as the
     trend overlay above so both describe the identical period. */
  const correlations = useMemo(
    () => buildOverviewCorrelations({ transactions, leads, sessions, answers }, { questions: activeQuestions, window: OV_WINDOW }),
    [transactions, leads, sessions, answers, activeQuestions],
  )

  if (!overall) {
    return (
      <Box className="screen moon-screen">
        <Box className="moon-head">
          <Box className="moon-head-title"><Moon size={20} strokeWidth={1.5} aria-hidden="true" /> {t('title')}</Box>
        </Box>
        <Box className="empty">
          <Txt as="p" className="empty-text">{t('empty.noGoals', { action: t('empty.action') })}</Txt>
        </Box>
      </Box>
    )
  }

  const conf = overall.confidence

  return (
    <Box className="screen moon-screen">
      <Box className="moon-head">
        <Box className="moon-head-title"><Moon size={20} strokeWidth={1.5} aria-hidden="true" /> {t('title')}</Box>
        <Btn className="moon-head-link" onClick={() => navigate(ROUTES.REPORTS)}>
          <BarChart3 size={16} strokeWidth={1.6} aria-hidden="true" /> {t('reports')}
        </Btn>
      </Box>

      <Box className="mg-hero">
        <Box className="mg-ring" style={{ '--ring-pct': `${conf}%` }}>
          <Box className="mg-ring-pct mono">{conf}%</Box>
          {/* Micro-word naming the big number as pace — mirrors the home
              MoonWidget kicker so the full screen reads the same. */}
          <Box className="mg-ring-kicker">{t('ring.kicker')}</Box>
          <Box className="mg-ring-sub">{t('ring.sub', { pct: overall.pure })}</Box>
        </Box>
        <Txt as="p" className="mg-reflection">{moonReflection(conf, gender)}</Txt>
      </Box>

      <Box className="mg-cats">
        <Txt as="p" className="mg-section-h">{t('section.byCategory')}</Txt>
        {cats.map((c) => (
          <Box key={c.category.id} className="mg-cat">
            <Box className="mg-cat-head">
              <Txt className="mg-cat-name">
                <Txt className="mg-cat-dot" style={{ background: c.category.color || 'var(--moon-deep)' }} />
                {c.category.name}
              </Txt>
            </Box>
            {/* Per-category: pace + goal-% side by side (was a lone pace bar). */}
            <MoonDualBars pace={c.confidence} goal={c.pure} />
          </Box>
        ))}
      </Box>

      <Box className="mg-trend">
        <Txt as="p" className="mg-section-h">{t('section.trend')}</Txt>
        <TrendChart data={trend} />
        <Box className="mg-trend-stats">
          <Box className="mg-trend-stat">
            <Txt as="p" className="mg-trend-stat-v mono">{avg}%</Txt>
            <Txt as="p" className="mg-trend-stat-l">{t('trend.avg')}</Txt>
          </Box>
          <Box className="mg-trend-stat divided">
            <Txt as="p" className="mg-trend-stat-v mono">{peak}%</Txt>
            <Txt as="p" className="mg-trend-stat-l">{t('trend.peak')}</Txt>
          </Box>
          <Box className="mg-trend-stat">
            <Txt as="p" className="mg-trend-stat-v mono">{conf}%</Txt>
            <Txt as="p" className="mg-trend-stat-l">{t('trend.today')}</Txt>
          </Box>
        </Box>
      </Box>

      <Box className="mg-overview">
        <Txt as="p" className="mg-section-h">{t('section.crossModule')}</Txt>
        <Box className="mg-ov-pills">
          {OVERVIEW_PILLS.map((m) => {
            const on = overviewKeys.includes(m.key)
            const disabled = m.key === 'question' && activeQuestions.length === 0
            return (
              <Btn
                key={m.key}
                disabled={disabled}
                className={`mg-ov-pill${on ? ' on' : ''}`}
                onClick={() => toggleOverviewKey(m.key)}
              >
                <Txt className="mg-ov-dot" style={{ background: OVERVIEW_METRICS[m.key].color }} />
                {t(m.labelKey)}
              </Btn>
            )
          })}
        </Box>
        {overviewKeys.includes('question') && activeQuestions.length > 0 && (
          <select className="mg-ov-select" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
            {activeQuestions.map((q) => <option key={q.id} value={q.id}>{questionText(q, gender)}</option>)}
          </select>
        )}
        <MultiTrendChart days={overview.days} series={overview.series} />
        <Txt as="p" className="mg-ov-note">{t('overview.note')}</Txt>
      </Box>

      <Box className="mg-overview">
        <Txt as="p" className="mg-section-h">{t('section.correlations')}</Txt>
        {correlations.length === 0 ? (
          <Txt as="p" className="mg-corr-empty">{t('corr.empty')}</Txt>
        ) : (
          <>
            {correlations.map((c) => (
              <CorrCard
                key={c.key}
                c={c}
                driverText={questionText(c.driverLabel, gender)}
                outcomeText={c.outcomeLabel || (c.outcomeQ ? questionText(c.outcomeQ, gender) : '')}
              />
            ))}
            <Txt as="p" className="mg-ov-note">{t('corr.note')}</Txt>
          </>
        )}
      </Box>

      <Btn className="mg-footer-link" onClick={() => navigate(ROUTES.GOALS)}>
        {t('footerLink')}
      </Btn>
    </Box>
  )
}

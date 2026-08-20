import { useMemo, useState, useEffect, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans } from 'react-i18next'
/* Eye, not Moon: the screen wears the icon it wears in the menu, and the
   drawer swapped the crescent for an eye on 2026-07-27 (it competed with the
   theme toggle's own moon). The lunar palette below stays — the name and the
   look are still מבט על's; only the glyph follows the menu. */
import { Eye, BarChart3, CloudOff, RotateCcw, Target, ArrowLeft, Plus } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { moonGetData, moonGetCategories, moonTrend, moonReflection, questionText, buildOverviewTrend, buildOverviewCorrelations, OVERVIEW_METRICS } from '@simplicity/core'
import { upsertMoonSnapshot } from '../../lib/api/moonSnapshots'
import MoonDualBars from '../../components/MoonDualBars'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
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

/* Window (days) for the cross-module trend OVERLAY — a 30-day visual shape. */
const OV_WINDOW = 30
/* Window (days) for the guarded correlations — DELIBERATELY longer than the
   overlay. The correlation gates need real sample size (a weekly outcome needs
   ~10 seven-day blocks ⇒ 70+ days; a daily Q↔Q pair needs ~14 answered days).
   At 30 days those thresholds can NEVER be met — Q↔income/leads/sessions is
   mathematically impossible and Q↔Q almost never qualifies, so the section sat
   permanently empty. 120 days (the engine's designed default) lets a genuine
   pattern actually surface when the data supports it. */
const CORR_WINDOW = 120

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
        <Txt as="p" className="mg-corr-sub">{t('corr.sub', { strength: t(`corr.strength.${c.strength}`), n: c.n })}</Txt>
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
  /* x stays keyed to the day's position in the whole window, so a line that
     only starts on day 18 visibly starts on day 18 — the empty stretch before
     a coach had any goal is part of what the chart is telling them, and
     re-spacing the real points across the full width would hide it. Days with
     no score are dropped rather than drawn at zero. */
  const pts = data
    .map((d, i) => (d.score == null ? null : [
      Math.round((pad + (i / (data.length - 1)) * (W - 2 * pad)) * 10) / 10,
      Math.round((H - pad - (d.score / 100) * (H - 2 * pad)) * 10) / 10,
    ]))
    .filter(Boolean)
  if (data.length < 2 || pts.length < 2) return <Txt as="p" className="mg-ov-empty">{t('trend.tooShort')}</Txt>
  const line = pts.map((p) => p.join(',')).join(' ')
  /* The fill closes down to the baseline under the REAL points only. */
  const area = `${pts[0][0]},${H - pad} ${line} ${pts[pts.length - 1][0]},${H - pad}`
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
  /* Every read that feeds the score is kept as its whole query object, not
     just its rows — the screen needs the three states useReportsData
     documents, not two. A query that never ran sits at fetchStatus 'paused'
     (React Query parks fetches it believes are offline) with a null error AND
     isLoading false; combined with each hook's `data ?? []` fallback that made
     moonGetData return null and the screen state "עדיין אין יעדים" — a claim
     about the user's practice — while the rows were still in flight. */
  const goalsQ = useGoals()
  const catsQ = useGoalCategories()
  const entriesQ = useGoalEntries()
  const txQ = useTransactions()
  const clientsQ = useClients()
  const leadsQ = useLeads()
  const answersQ = useDailyAnswers()
  const groupsQ = useGroups()
  const membersQ = useGroupMembers()
  const scoreFeeds = [goalsQ, catsQ, entriesQ, txQ, clientsQ, leadsQ, answersQ, groupsQ, membersQ]
  const loading = scoreFeeds.some((q) => q.loading)
  const unreachable = scoreFeeds.some((q) => q.unreachable)
  const loadError = scoreFeeds.find((q) => q.error)?.error || null
  /* Retry re-runs every feed, not just the one that reported the failure — an
     offline spell parks all of them, and a partial retry would leave the score
     computed from a half-loaded bag. allSettled: one rejecting refetch must not
     abort the rest. */
  const [refetching, setRefetching] = useState(false)
  const retry = async () => {
    setRefetching(true)
    try { await Promise.allSettled(scoreFeeds.map((q) => q.refetch())) } finally { setRefetching(false) }
  }
  /* Logging progress from here rather than only from the home widget: the
     category rows are the place a coach sees a goal falling behind, and the
     screen had no way to act on that. Same modal the widget opens. */
  const [entryCategory, setEntryCategory] = useState(null)
  /* Destructured separately: these are the React-Query cache arrays, stable
     across renders, so the memo below keys off them and not the fresh hook
     objects above. */
  const { goals } = goalsQ
  const { categories } = catsQ
  const { entries, addEntry } = entriesQ
  const { transactions } = txQ
  const { clients } = clientsQ
  const { leads } = leadsQ
  const { answers } = answersQ
  const { groups } = groupsQ
  const { members } = membersQ
  const { sessions } = useSessions()
  const { questions } = useUserQuestions()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  /* Persist today's score as a snapshot when THIS screen is open too — not only
     the home MoonWidget — so the 30-day trend accumulates a point on any day the
     user opens מבט-על directly (previously those days were holes). Upserts on
     (user_id, date); fire-and-forget, never blocks the UI.
     Gated on a fully-settled read: a score computed while some feeds were still
     empty is not just a wrong pixel, it is written into permanent history.
     Keyed on the three NUMBERS and not on `overall`, which useMemo rebuilds
     whenever any of nine feeds hands back a new array — a background refetch
     that changes nothing still minted a fresh object and re-sent an identical
     row. Same score, no write. */
  const { pure: sPure, paced: sPaced, confidence: sConf } = overall || {}
  useEffect(() => {
    if (sConf == null || loading || unreachable) return
    upsertMoonSnapshot({ score: sPure, paced: sPaced, confidence: sConf }).catch(() => { /* non-fatal */ })
  }, [sPure, sPaced, sConf, loading, unreachable])

  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const liveTrend = useMemo(() => moonTrend(30, new Date(), data), [data])
  const { snapshots } = useMoonSnapshots(30)

  /* A GAP-FREE 30-day line: the live day-by-day reconstruction is the base, and
     any real persisted snapshot overrides its own day (true history where we
     recorded it, estimate elsewhere). Previously we switched to snapshots-ONLY
     once two existed — which drew a sparse, hole-y line, evenly spaced as if the
     gap days didn't exist, on every day the app wasn't opened.
     TODAY is exempt from the override: its snapshot was written the last time
     the app was open, so a morning visit froze the morning's score onto the
     line while the ring above it moved on. The live point is simply fresher. */
  const trend = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return liveTrend
    const today = dayKeyOf(new Date())
    const byDay = Object.create(null)
    snapshots.forEach((s) => { byDay[dayKeyOf(new Date(s.date))] = Number(s.confidence ?? s.score ?? 0) })
    return liveTrend.map((tp) => {
      const k = dayKeyOf(tp.date)
      return (k !== today && k in byDay) ? { date: tp.date, score: byDay[k] } : tp
    })
  }, [snapshots, liveTrend])

  /* Gap days carry no score and must not be averaged as zeros — an average
     dragged down by the weeks before a coach had any goal describes nothing
     that happened. Null when there is nothing yet to average; the row prints
     an em dash rather than inventing a figure. */
  const scores = trend.map((tp) => tp.score).filter((s) => s != null)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const peak = scores.length ? Math.max(...scores) : null
  /* The "היום" stat reads the line's own last point rather than recomputing,
     so the figure and the place the line ends can no longer disagree. With the
     two fixes above it now equals the ring as well. */
  const todayScore = scores.length ? scores[scores.length - 1] : null

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
  /* Guarded correlations (§8.2) — Spearman + permutation + split-half; the
     common result is an honest "no significant link". Uses CORR_WINDOW (longer
     than the overlay) so the statistical gates have enough days to ever pass —
     see the constant above.
     KEPT OFF THE FIRST PAINT. The cost is data-dependent, not fixed: the cheap
     gates reject nearly everything before the permutation test, so an ordinary
     coach's answers cost 24–130ms — but a coach whose metrics really do move
     together pushes many candidates through to 2000 permutations each, and
     measured on a desktop that reached 1.2s at 5 active questions, 4.3s at 8
     and 6.8s at 12. Running inside the render meant the whole screen waited on
     it. Deferring costs nothing and bounds the damage: React paints everything
     else first, then computes.
     The iteration count is NOT the lever here, tempting as it looks. The
     permutation estimator's floor p is 1/(iters+1), and BH admits a lone
     discovery only at p ≤ q/mTotal — 0.00192 at 8 active questions. Dropping to
     500 iterations raises the floor to 0.00200, just above it, so a user with
     enough questions could never be shown a single genuine link again. The
     screen would get faster by going blind. */
  const corrInput = useMemo(
    () => ({ transactions, leads, sessions, answers, questions: activeQuestions }),
    [transactions, leads, sessions, answers, activeQuestions],
  )
  const deferredCorrInput = useDeferredValue(corrInput, null)
  const correlations = useMemo(
    () => (deferredCorrInput
      ? buildOverviewCorrelations(deferredCorrInput, { questions: deferredCorrInput.questions, window: CORR_WINDOW })
      : null),
    [deferredCorrInput],
  )

  /* Three outcomes where there used to be one. Ordered by what is actually
     true: still reading → say so; the read failed or never ran → say so and
     offer the way out; only then, with a settled read behind us, is "you have
     no goals yet" a statement we are entitled to make. */
  if (loading || unreachable || !overall) {
    return (
      <Box className="screen moon-screen">
        <Box className="moon-head">
          <Box className="moon-head-title"><Eye size={20} strokeWidth={1.5} aria-hidden="true" /> {t('title')}</Box>
        </Box>
        {loading ? (
          <Box className="empty">
            <Txt className="empty-icon"><Eye size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text">{t('loading')}</Txt>
          </Box>
        ) : unreachable ? (
          /* The raw message rides in `title`, as on the reports and tasks
             screens: it helps a bug report without putting a stack trace in
             front of the user, and is simply absent when the read was parked
             rather than failed. */
          <Box className="empty">
            <Txt className="empty-icon"><CloudOff size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text" title={loadError || undefined}>{t('loadError')}</Txt>
            <Btn className="empty-action" onClick={retry} disabled={refetching}>
              <RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" /> {refetching ? t('retrying') : t('retry')}
            </Btn>
          </Box>
        ) : (
          <Box className="empty">
            <Txt className="empty-icon"><Target size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text">{t('empty.noGoals', { action: t('empty.action') })}</Txt>
            {/* The instruction used to be the whole card: "set a goal to see
                the score" with nothing to press. The screen owns no goal
                editor — the goals screen does — so the way out is a trip, and
                the arrow says so, the same way the home MoonWidget's empty
                chip does. */}
            <Btn className="empty-action" onClick={() => navigate(ROUTES.GOALS)}>
              {t('empty.setGoal')} <ArrowLeft size={18} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
          </Box>
        )}
      </Box>
    )
  }

  const conf = overall.confidence

  return (
    <Box className="screen moon-screen">
      <Box className="moon-head">
        <Box className="moon-head-title"><Eye size={20} strokeWidth={1.5} aria-hidden="true" /> {t('title')}</Box>
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
              {/* The entry modal is scoped to a CATEGORY, so one button here
                  rather than the identical one repeated on every goal beneath
                  it. Manual categories only — an 'auto' category is computed
                  from transactions or sessions and has nothing to type in. */}
              {c.category.measurement_type === 'manual' && (
                <Btn
                  className="mg-add-icon mg-cat-add"
                  aria-label={t('logEntryAria', { name: c.category.name })}
                  title={t('logEntry')}
                  onClick={() => setEntryCategory(c.category)}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                </Btn>
              )}
            </Box>
            {/* The aggregate earns its row only when it is aggregating more
                than one thing; with a single goal it would just be that goal's
                own numbers printed twice. */}
            {c.goals.length > 1 && <MoonDualBars pace={c.confidence} goal={c.pure} />}
            {/* The goals themselves. "פירוט מלא" used to land here on LESS
                detail than the home widget it came from — that widget moved to
                per-goal bars on 04/06/2026 and this screen was left on
                per-category, so the link promised a closer look and delivered a
                coarser one. Named the way the user named them (goal.label,
                falling back to the category like GoalCard). */}
            <Box className="mg-cat-goals">
              {c.goals.map((s) => (
                <Box key={s.goal.id} className="mg-goal">
                  <Txt as="p" className="mg-goal-name">{s.goal.label || c.category.name}</Txt>
                  <MoonDualBars pace={Math.min(100, s.paced)} goal={s.pure} />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Box className="mg-trend">
        <Txt as="p" className="mg-section-h">{t('section.trend')}</Txt>
        <TrendChart data={trend} />
        <Box className="mg-trend-stats">
          <Box className="mg-trend-stat">
            <Txt as="p" className="mg-trend-stat-v mono">{avg == null ? "—" : `${avg}%`}</Txt>
            <Txt as="p" className="mg-trend-stat-l">{t('trend.avg')}</Txt>
          </Box>
          <Box className="mg-trend-stat divided">
            <Txt as="p" className="mg-trend-stat-v mono">{peak == null ? "—" : `${peak}%`}</Txt>
            <Txt as="p" className="mg-trend-stat-l">{t('trend.peak')}</Txt>
          </Box>
          <Box className="mg-trend-stat">
            <Txt as="p" className="mg-trend-stat-v mono">{todayScore == null ? "—" : `${todayScore}%`}</Txt>
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
                aria-pressed={on}
                className={`mg-ov-pill${on ? ' on' : ''}`}
                /* The metric's colour rides on the pill, not just on its dot,
                   so the on-state fill and the dot both read it from one
                   place. */
                style={{ '--pill-color': OVERVIEW_METRICS[m.key].color }}
                onClick={() => toggleOverviewKey(m.key)}
              >
                <Txt className="mg-ov-dot" />
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
        {/* "Not enough data for a chart yet" is what MultiTrendChart says when
            it has no drawable series — true when the rows are thin, a lie when
            the user simply switched every toggle off. Naming the real reason
            keeps the fix in the user's hands. */}
        {overviewKeys.length === 0 ? (
          <Txt as="p" className="mg-ov-empty">{t('overview.noneSelected')}</Txt>
        ) : (
          <MultiTrendChart days={overview.days} series={overview.series} />
        )}
        <Txt as="p" className="mg-ov-note">{t('overview.note')}</Txt>
      </Box>

      <Box className="mg-overview">
        <Txt as="p" className="mg-section-h">{t('section.correlations')}</Txt>
        {correlations === null ? (
          /* The deferred pass has not run yet — say "still looking" rather than
             "nothing found", which is a verdict we have not reached. */
          <Txt as="p" className="mg-corr-empty">{t('corr.computing')}</Txt>
        ) : correlations.length === 0 ? (
          <Txt as="p" className="mg-corr-empty">{t('corr.empty')}</Txt>
        ) : (
          <>
            {correlations.map((c) => (
              <CorrCard
                key={c.key}
                c={c}
                driverText={questionText(c.driverLabel, gender)}
                /* outcomeLabel is a metric key now; pills.* holds the same word
                   already printed on the toggle above the chart. */
                outcomeText={c.outcomeLabel ? t(`pills.${c.outcomeLabel}`) : (c.outcomeQ ? questionText(c.outcomeQ, gender) : "")}
              />
            ))}
            <Txt as="p" className="mg-ov-note">{t('corr.note')}</Txt>
          </>
        )}
      </Box>

      <Btn className="mg-footer-link" onClick={() => navigate(ROUTES.GOALS)}>
        {t('footerLink')}
      </Btn>

      <AddGoalEntryModal
        open={!!entryCategory}
        onClose={() => setEntryCategory(null)}
        category={entryCategory}
        onSave={addEntry}
      />
    </Box>
  )
}

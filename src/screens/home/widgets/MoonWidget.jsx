import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { moonGetData, moonReflection } from '../../../lib/moon'
import { upsertMoonSnapshot } from '../../../lib/api/moonSnapshots'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useGoalEntries } from '../../../hooks/useGoalEntries'
import { useTransactions } from '../../../hooks/useTransactions'
import { useClients } from '../../../hooks/useClients'
import { useLeads } from '../../../hooks/useLeads'
import { useSessions } from '../../../hooks/useSessions'
import { useDailyAnswers } from '../../../hooks/useDailyAnswers'
import { useGroups } from '../../../hooks/useGroups'
import { useGroupMembers } from '../../../hooks/useGroupMembers'
import InfoPopover from '../../../components/InfoPopover'
import MoonDualBars from '../../../components/MoonDualBars'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* Moon-glance mini — a single chip with the pace-based confidence
   percentage inside a soft circular ring. The progress arc renders
   clean and sharp (beta feedback 03/06/2026 — the old blur hid the
   accent color); its color follows the widget's accent (sage by
   default, can be re-tinted via the home customize panel).

   Tap the chip → toggle inline expansion. The expanded card shows
   per-category bars + a one-line reflection + a "פירוט מלא ←" link
   for the full /moon screen. Empty-state (no goals) still routes
   straight to /goals because there's nothing to expand. */
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS   /* ~263.89 */

export default function MoonWidget() {
  const { t, gender } = useT('home')
  const navigate = useNavigate()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { entries } = useGoalEntries()
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { sessions } = useSessions()
  const { answers } = useDailyAnswers()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const [expanded, setExpanded] = useState(false)

  const data = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  /* `scored` carries one entry per goal — the expansion lists the goals
     themselves with the name the user chose (goal.label, falling back to
     the category name like GoalCard does). Per beta decision 04/06/2026:
     per-goal bars, not per-category. */
  const { overall, scored } = useMemo(() => moonGetData(new Date(), data), [data])

  /* Persist today's moon-glance score as a daily snapshot. Upserts on
     (user_id, date) so multiple recomputes within a day just overwrite
     today's row. Fire-and-forget — never blocks the UI. */
  useEffect(() => {
    if (!overall) return
    upsertMoonSnapshot({
      score: overall.pure,
      paced: overall.paced,
      confidence: overall.confidence,
    }).catch(() => { /* non-fatal */ })
  }, [overall])

  const conf = overall?.confidence ?? 0
  const pure = overall?.pure
  const hasGoals = !!overall
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRCUMFERENCE

  const label = hasGoals
    ? (pure != null ? t('widgets.moon.percentOfGoal', { percent: pure }) : t('widgets.moon.glance'))
    : t('widgets.moon.setGoal')

  /* Empty-state — go straight to /goals; no expansion available. */
  if (!hasGoals) {
    return (
      <Box
        className="moon-chip moon-chip-empty"
        role="button"
        tabIndex={0}
        onClick={() => navigate(ROUTES.GOALS)}
        aria-label={t('widgets.moon.setGoalAria')}
      >
        <svg className="moon-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="moon-track" cx="50" cy="50" r={RADIUS} />
        </svg>
        <Box className="moon-chip-num mono">—</Box>
        <Box className="moon-chip-label">{label}</Box>
      </Box>
    )
  }

  return (
    <Box className={`moon-block${expanded ? ' expanded' : ''}`}>
      <Box
        className="moon-chip"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        aria-label={t('widgets.moon.glanceAria', { percent: conf })}
        aria-expanded={expanded}
      >
        <svg className="moon-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="moon-track" cx="50" cy="50" r={RADIUS} />
          <circle
            className="moon-arc"
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          />
        </svg>
        <Box className="moon-chip-num mono">{`${conf}%`}</Box>
        {/* Beta request 03/06/2026 — the bare percentage was unclear; the
            micro-word ties it to pace: "87% מהקצב / 62% מהיעד". */}
        <Box className="moon-chip-kicker">{t('widgets.moon.ofPace')}</Box>
        <Box className="moon-chip-label">
          {label}
          <InfoPopover
            label={t('widgets.moon.infoLabel')}
            text={t('widgets.moon.infoText')}
          />
        </Box>
        {/* The redundant expand chevron was removed (beta 06/06/2026) — the
            whole chip already toggles expansion via its onClick, and
            aria-expanded lives on the chip itself. */}
      </Box>

      {expanded && (
        <Box className="moon-expanded">
          <Txt as="p" className="moon-expanded-reflection">{moonReflection(conf, gender)}</Txt>
          {scored.length === 0 ? (
            <Txt as="p" className="moon-expanded-empty">{t('widgets.moon.expandedEmpty')}</Txt>
          ) : (
            <Box className="moon-expanded-cats">
              {scored.map((s) => (
                <Box key={s.goal.id} className="moon-expanded-cat">
                  <Box className="moon-expanded-cat-head">
                    <Txt className="moon-expanded-cat-dot" style={{ background: s.cat.color || 'var(--sage)' }} />
                    <Txt className="moon-expanded-cat-name">{s.goal.label || s.cat.name}</Txt>
                  </Box>
                  {/* Per-goal: pace + goal-% side by side (was a lone pace bar). */}
                  <MoonDualBars pace={Math.min(100, s.paced)} goal={s.pure} />
                </Box>
              ))}
            </Box>
          )}
          <Btn type="button" className="moon-expanded-link" onClick={() => navigate(ROUTES.MOON_GLANCE)}>
            {t('widgets.moon.fullDetail')} <ArrowLeft size={13} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>
      )}
    </Box>
  )
}

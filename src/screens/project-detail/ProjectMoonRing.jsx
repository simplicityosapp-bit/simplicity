import { useMemo, useState } from 'react'
import { moonGetData, moonReflection } from '../../lib/moon'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useSessions } from '../../hooks/useSessions'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import MoonDualBars from '../../components/MoonDualBars'
import { useT } from '../../i18n/useT'

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/* At-a-glance ring for ONE project — same pace-based confidence as the home
   moon-glance, scored over this project's goals only (goal.project_id). Tapping
   the chip expands a per-goal breakdown (pace + goal %), exactly like home but
   scoped to this project. Renders nothing when the project has no goals.

   Returns a fragment (chip + expanded panel) so the parent can lay the chip out
   on the top row (locked right) and let the panel wrap full-width beneath it. */
export default function ProjectMoonRing({ projectId }) {
  const { t } = useT('projects')
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

  const projectGoals = useMemo(
    () => goals.filter((g) => !g.deleted_at && g.project_id === projectId),
    [goals, projectId],
  )
  const data = useMemo(
    () => ({ goals: projectGoals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [projectGoals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  const { overall, scored } = useMemo(() => moonGetData(new Date(), data), [data])

  /* No goals tied to this project → nothing to show. */
  if (!overall) return null

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRCUMFERENCE

  return (
    <>
      <button
        type="button"
        className="moon-chip pd-moon-chip"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={t('detail.moon.aria', { percent: conf })}
      >
        <svg className="moon-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="moon-track" cx="50" cy="50" r={RADIUS} />
          <circle className="moon-arc" cx="50" cy="50" r={RADIUS} strokeDasharray={`${dash} ${CIRCUMFERENCE}`} />
        </svg>
        <div className="moon-chip-num mono">{`${conf}%`}</div>
        <div className="moon-chip-kicker">{t('detail.moon.ofPace')}</div>
        {pure != null && <div className="moon-chip-label">{t('detail.moon.percentOfGoal', { percent: pure })}</div>}
      </button>

      {expanded && (
        <div className="moon-expanded pd-moon-expanded">
          <p className="moon-expanded-reflection">{moonReflection(conf)}</p>
          {scored.length === 0 ? (
            <p className="moon-expanded-empty">{t('detail.moon.expandedEmpty')}</p>
          ) : (
            <div className="moon-expanded-cats">
              {scored.map((s) => (
                <div key={s.goal.id} className="moon-expanded-cat">
                  <div className="moon-expanded-cat-head">
                    <span className="moon-expanded-cat-dot" style={{ background: s.cat.color || 'var(--sage)' }} />
                    <span className="moon-expanded-cat-name">{s.goal.label || s.cat.name}</span>
                  </div>
                  <MoonDualBars pace={Math.min(100, s.paced)} goal={s.pure} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

import { useMemo } from 'react'
import { moonGetData } from '../../lib/moon'
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
import { useT } from '../../i18n/useT'

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/* At-a-glance ring for ONE project — the same pace-based confidence shown on
   the home moon-glance, but scored over this project's goals only (goal.project_id
   === projectId). Renders nothing when the project has no goals, so projects
   that don't track goals stay uncluttered. */
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

  const projectGoals = useMemo(
    () => goals.filter((g) => !g.deleted_at && g.project_id === projectId),
    [goals, projectId],
  )
  const data = useMemo(
    () => ({ goals: projectGoals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [projectGoals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  /* No goals tied to this project → nothing to show. */
  if (!overall) return null

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRCUMFERENCE

  return (
    <div className="pd-moon" role="img" aria-label={t('detail.moon.aria', { percent: conf })}>
      <svg className="pd-moon-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="pd-moon-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="pd-moon-arc"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="pd-moon-text">
        <span className="pd-moon-num mono">{`${conf}%`}</span>
        <span className="pd-moon-kicker">{t('detail.moon.ofPace')}</span>
        {pure != null && <span className="pd-moon-label">{t('detail.moon.percentOfGoal', { percent: pure })}</span>}
      </div>
    </div>
  )
}

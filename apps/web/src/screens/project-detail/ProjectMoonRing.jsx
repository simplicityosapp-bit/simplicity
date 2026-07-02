import { useMemo, useState } from 'react'
import { moonGetData, moonReflection } from '@simplicity/core'
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
import { Box, Txt, Btn } from '../../components/ui'

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/* At-a-glance ring for ONE project — same pace-based confidence as the home
   moon-glance, scored over this project's goals only (goal.project_id). Tapping
   the chip expands a per-goal breakdown (pace + goal %), exactly like home but
   scoped to this project. Renders nothing when the project has no goals.

   Returns a fragment (chip + expanded panel) so the parent can lay the chip out
   on the top row (locked right) and let the panel wrap full-width beneath it. */
export default function ProjectMoonRing({ projectId }) {
  const { t, gender } = useT('projects')
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
      <Btn
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
        <Box className="moon-chip-num mono">{`${conf}%`}</Box>
        <Box className="moon-chip-kicker">{t('detail.moon.ofPace')}</Box>
        {pure != null && <Box className="moon-chip-label">{t('detail.moon.percentOfGoal', { percent: pure })}</Box>}
      </Btn>

      {expanded && (
        <Box className="moon-expanded pd-moon-expanded">
          <Txt as="p" className="moon-expanded-reflection">{moonReflection(conf, gender)}</Txt>
          {scored.length === 0 ? (
            <Txt as="p" className="moon-expanded-empty">{t('detail.moon.expandedEmpty')}</Txt>
          ) : (
            <Box className="moon-expanded-cats">
              {scored.map((s) => (
                <Box key={s.goal.id} className="moon-expanded-cat">
                  <Box className="moon-expanded-cat-head">
                    <Txt className="moon-expanded-cat-dot" style={{ background: s.cat.color || 'var(--sage)' }} />
                    <Txt className="moon-expanded-cat-name">{s.goal.label || s.cat.name}</Txt>
                  </Box>
                  <MoonDualBars pace={Math.min(100, s.paced)} goal={s.pure} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </>
  )
}

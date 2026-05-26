import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../lib/routes'
import { moonGetData } from '../../../lib/moon'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useGoalEntries } from '../../../hooks/useGoalEntries'
import { useTransactions } from '../../../hooks/useTransactions'
import { useClients } from '../../../hooks/useClients'
import { useLeads } from '../../../hooks/useLeads'
import { useSessions } from '../../../hooks/useSessions'
import { useDailyAnswers } from '../../../hooks/useDailyAnswers'

/* Moon-glance mini — a single chip with the pace-based confidence
   percentage inside a soft circular ring. The progress arc itself
   is blurred so it reads as a glow, not a hard line; its color
   follows the widget's accent (sage by default, can be re-tinted
   via the home customize panel). Taps through to /moon. */
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS   /* ~263.89 */

export default function MoonWidget() {
  const navigate = useNavigate()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { entries } = useGoalEntries()
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { sessions } = useSessions()
  const { answers } = useDailyAnswers()

  const data = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  const conf = overall?.confidence ?? 0
  const pure = overall?.pure
  const hasGoals = !!overall
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRCUMFERENCE

  const label = hasGoals
    ? (pure != null ? `${pure}% מהיעד` : 'מבט על')
    : 'הגדר/י יעד ←'

  return (
    <div
      className={`moon-chip${hasGoals ? '' : ' moon-chip-empty'}`}
      role="button"
      tabIndex={0}
      onClick={() => navigate(hasGoals ? ROUTES.MOON_GLANCE : ROUTES.GOALS)}
      aria-label={`מבט על ${conf}%`}
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
      <div className="moon-chip-num mono">{hasGoals ? `${conf}%` : '—'}</div>
      <div className="moon-chip-label">{label}</div>
    </div>
  )
}

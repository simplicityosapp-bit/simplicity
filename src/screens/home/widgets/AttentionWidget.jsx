import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Calendar, Target, AlertCircle, Clock, Bell, ChevronLeft } from 'lucide-react'
import { attentionItems } from '../../../lib/homeData'
import InfoPopover from '../../../components/InfoPopover'
import CollapsibleCard from './CollapsibleCard'
import { useTransactions } from '../../../hooks/useTransactions'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useClients } from '../../../hooks/useClients'
import { useTasks } from '../../../hooks/useTasks'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useSessions } from '../../../hooks/useSessions'
import { useLeads } from '../../../hooks/useLeads'

const ICONS = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }

/* "דרושה תשומת לב" — composed rows from pending tx, balances, goal gap,
   urgent tasks, 45-day client/lead rules. Each row taps to its screen. */
export default function AttentionWidget() {
  const navigate = useNavigate()
  const { transactions } = useTransactions()
  const { meetings } = useScheduledMeetings()
  const { clients } = useClients()
  const { tasks } = useTasks()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { sessions } = useSessions()
  const { leads } = useLeads()
  const items = useMemo(
    () => attentionItems(new Date(), { transactions, scheduled_meetings: meetings, clients, tasks, goals, categories, sessions, leads }),
    [transactions, meetings, clients, tasks, goals, categories, sessions, leads],
  )

  return (
    <CollapsibleCard
      title={(
        <>
          <Bell size={20} strokeWidth={1.5} aria-hidden="true" /> דרושה תשומת לב
          <InfoPopover
            label="הסבר דרושה תשומת לב"
            text="פריטים שדורשים פעולה: תנועות ממתינות לאישור, פגישות שעדיין לא סומנו, לקוחות שלא טופלו 45 ימים, ויעדים מתחת לקצב."
          />
        </>
      )}
      headEnd={<span className="h-card-count">{items.length} {items.length === 1 ? 'פריט' : 'פריטים'}</span>}
    >
      {items.length ? (
        items.map((it, i) => {
          const Icon = ICONS[it.icon] || Bell
          return (
            <button key={i} type="button" className="h-attn-row" onClick={() => navigate(it.to)}>
              <Icon size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
              <span className="h-attn-text">{it.text}</span>
              <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
            </button>
          )
        })
      ) : (
        <p className="h-card-empty">אין פריטים שדורשים תשומת לב כרגע.</p>
      )}
    </CollapsibleCard>
  )
}

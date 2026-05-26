import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Wallet, Users } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { homeChips } from '../../../lib/homeData'
import { useClients } from '../../../hooks/useClients'
import { useTasks } from '../../../hooks/useTasks'
import { useTransactions } from '../../../hooks/useTransactions'

/* Bottom data chips — RTL order: משימות · נטו · לקוחות. Each taps to its
   screen. */
export default function ChipsWidget() {
  const navigate = useNavigate()
  const { clients } = useClients()
  const { tasks } = useTasks()
  const { transactions } = useTransactions()
  const { activeClients, openTasks, net } = useMemo(
    () => homeChips(new Date(), { clients, tasks, transactions }),
    [clients, tasks, transactions],
  )
  const netStr = `${net < 0 ? '−' : ''}${Math.round(Math.abs(net)).toLocaleString('en-US')} ₪`

  return (
    <div className="h-chips">
      <button type="button" className="h-stat" onClick={() => navigate(ROUTES.TASKS)}>
        <ClipboardList size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
        <span className="h-stat-num mono">{openTasks}</span>
        <span className="h-stat-lbl">משימות</span>
      </button>
      <button type="button" className="h-stat" onClick={() => navigate(ROUTES.FINANCE)}>
        <Wallet size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
        <span className="h-stat-num mono">{netStr}</span>
        <span className="h-stat-lbl">נטו</span>
      </button>
      <button type="button" className="h-stat" onClick={() => navigate(ROUTES.CLIENTS)}>
        <Users size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
        <span className="h-stat-num mono">{activeClients}</span>
        <span className="h-stat-lbl">לקוחות</span>
      </button>
    </div>
  )
}

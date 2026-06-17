import { Wallet, Users, UserPlus, FolderOpen, CheckSquare, Target, Bell, Calendar } from 'lucide-react'
import Modal from './Modal'
import MG from '../components/MG'
import { useT } from '../i18n/useT'
import './QuickActionsModal.css'

/* Quick-actions launcher — opened from the home "תנועה מהירה" button.
   Shows every "add" entry-point in the system as a tile grid; tapping a
   tile closes this sheet and signals the parent to open the matching
   Add* modal. The parent owns the actual modal instances + hooks. */
const ACTIONS = [
  { id: 'transaction', icon: Wallet },
  { id: 'client',      icon: Users, mg: 'client' },
  { id: 'lead',        icon: UserPlus },
  { id: 'task',        icon: CheckSquare },
  { id: 'project',     icon: FolderOpen },
  { id: 'goal',        icon: Target },
  { id: 'reminder',    icon: Bell },
  { id: 'meeting',     icon: Calendar },
]

export default function QuickActionsModal({ open, onClose, onPick }) {
  const { t } = useT('modalsSystem')
  const handlePick = (id) => {
    onPick(id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('quickActions.title')}>
      <div className="qa-grid">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              className="qa-tile"
              onClick={() => handlePick(a.id)}
            >
              <span className="qa-icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.8} />
              </span>
              <span className="qa-label">{a.mg ? <MG word={a.mg} /> : t(`quickActions.actions.${a.id}`)}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

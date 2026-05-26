import { Wallet, Users, UserPlus, FolderOpen, CheckSquare, Target, Bell, Calendar } from 'lucide-react'
import Modal from './Modal'
import './QuickActionsModal.css'

/* Quick-actions launcher — opened from the home "תנועה מהירה" button.
   Shows every "add" entry-point in the system as a tile grid; tapping a
   tile closes this sheet and signals the parent to open the matching
   Add* modal. The parent owns the actual modal instances + hooks. */
const ACTIONS = [
  { id: 'transaction', label: 'תנועה',  icon: Wallet },
  { id: 'client',      label: 'לקוח',   icon: Users },
  { id: 'lead',        label: 'ליד',    icon: UserPlus },
  { id: 'task',        label: 'משימה',  icon: CheckSquare },
  { id: 'project',     label: 'פרויקט', icon: FolderOpen },
  { id: 'goal',        label: 'יעד',    icon: Target },
  { id: 'reminder',    label: 'תזכורת', icon: Bell },
  { id: 'meeting',     label: 'פגישה',  icon: Calendar },
]

export default function QuickActionsModal({ open, onClose, onPick }) {
  const handlePick = (id) => {
    onPick(id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="הוספה מהירה">
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
              <span className="qa-label">{a.label}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

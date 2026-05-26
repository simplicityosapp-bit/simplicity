import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTransactions } from '../../../hooks/useTransactions'
import { useClients } from '../../../hooks/useClients'
import { useProjects } from '../../../hooks/useProjects'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalEntries } from '../../../hooks/useGoalEntries'
import AddTransactionModal from '../../../modals/AddTransactionModal'
import AddGoalEntryModal from '../../../modals/AddGoalEntryModal'
import QuickGoalUpdatePicker from '../../../modals/QuickGoalUpdatePicker'

/* Two quick-add CTAs:
   • תנועה מהירה — opens AddTransactionModal (full form).
   • עדכון זריז — picks a manual goal category, then opens AddGoalEntryModal. */
export default function QuickRow() {
  const { addTransaction } = useTransactions()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { categories } = useGoalCategories()
  const { goals } = useGoals()
  const { addEntry } = useGoalEntries()
  const [showTx, setShowTx] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)

  return (
    <div className="h-quick-row">
      <button type="button" className="h-quick-btn h-quick-primary" onClick={() => setShowTx(true)}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <span>תנועה מהירה</span>
      </button>
      <button type="button" className="h-quick-btn h-quick-secondary" onClick={() => setShowPicker(true)}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <span>עדכון זריז</span>
      </button>

      <AddTransactionModal
        open={showTx}
        onClose={() => setShowTx(false)}
        clients={clients}
        projects={projects}
        onSave={addTransaction}
      />
      <QuickGoalUpdatePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        categories={categories}
        goals={goals}
        onPick={(cat) => setEntryCategory(cat)}
      />
      <AddGoalEntryModal
        open={!!entryCategory}
        onClose={() => setEntryCategory(null)}
        category={entryCategory}
        onSave={addEntry}
      />
    </div>
  )
}

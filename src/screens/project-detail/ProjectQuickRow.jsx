import { useState } from 'react'
import { Plus } from 'lucide-react'

import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useClientStatuses } from '../../hooks/useClientStatuses'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useUserQuestions } from '../../hooks/useUserQuestions'

import QuickActionsModal from '../../modals/QuickActionsModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import AddClientModal from '../../modals/AddClientModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddGoalModal from '../../modals/AddGoalModal'
import AddReminderModal from '../../modals/AddReminderModal'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import QuickGoalUpdatePicker from '../../modals/QuickGoalUpdatePicker'

/* Project-scoped twin of the home QuickRow. Same two CTAs ("תנועה
   מהירה" + "עדכון זריז") and the same launcher → Add* modal flow,
   but every Add* opened from here pre-fills the current project so
   the user doesn't have to re-pick the binding they're clearly
   already in. Filtering rules:
     - transaction: defaults.project_id = projectId
     - client: onSave wraps payload with project_id
     - task: onSave wraps payload with project_id
     - goal: onSave wraps payload with project_id
     - reminder: defaultLinkedTo = { type: 'project', id }
     - meeting: not project-scoped (meetings bind to a client)
     - lead / new project: not surfaced — they don't fit this
       context, but the home QuickRow still covers them.
*/
export default function ProjectQuickRow({ projectId, projectName }) {
  const { addTransaction } = useTransactions()
  const { clients, addClient } = useClients()
  const { statuses: clientStatuses } = useClientStatuses()
  const { projects } = useProjects()
  const { addTask } = useTasks()
  const { categories } = useGoalCategories()
  const { goals, addGoal } = useGoals()
  const { addEntry } = useGoalEntries()
  const { addReminder } = useReminders()
  const { addMeeting } = useScheduledMeetings()
  const { questions } = useUserQuestions()

  const [showLauncher, setShowLauncher] = useState(false)
  const [active, setActive] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)
  const close = () => setActive(null)

  return (
    <div className="h-quick-row">
      <button
        type="button"
        className="h-quick-btn h-quick-primary"
        onClick={() => setShowLauncher(true)}
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <span>תנועה מהירה</span>
      </button>
      <button
        type="button"
        className="h-quick-btn h-quick-secondary"
        onClick={() => setShowPicker(true)}
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <span>עדכון זריז</span>
      </button>

      <QuickActionsModal
        open={showLauncher}
        onClose={() => setShowLauncher(false)}
        onPick={setActive}
      />

      <AddTransactionModal
        open={active === 'transaction'}
        onClose={close}
        clients={clients}
        projects={projects}
        defaults={{ project_id: projectId }}
        onSave={addTransaction}
      />
      <AddClientModal
        open={active === 'client'}
        onClose={close}
        projects={projects}
        statuses={clientStatuses}
        onSave={async (payload) => addClient({ ...payload, project_id: projectId })}
      />
      <AddTaskModal
        open={active === 'task'}
        onClose={close}
        projects={projects}
        clients={clients}
        onSave={async (payload) => addTask({ ...payload, project_id: projectId })}
      />
      <AddGoalModal
        open={active === 'goal'}
        onClose={close}
        categories={categories}
        projects={projects}
        questions={questions}
        onSave={async (payload) => addGoal({ ...payload, project_id: projectId })}
      />
      <AddReminderModal
        open={active === 'reminder'}
        onClose={close}
        clients={clients}
        defaultLinkedTo={{ type: 'project', id: projectId }}
        linkedSubjectName={projectName}
        onSave={addReminder}
      />
      <ScheduleMeetingModal
        open={active === 'meeting'}
        onClose={close}
        clients={clients}
        onSave={addMeeting}
      />

      <QuickGoalUpdatePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        categories={categories}
        goals={goals.filter((g) => !g.project_id || g.project_id === projectId)}
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

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { useTransactions } from '../../../hooks/useTransactions'
import { useClients } from '../../../hooks/useClients'
import { useClientStatuses } from '../../../hooks/useClientStatuses'
import { useProjects } from '../../../hooks/useProjects'
import { useLeads } from '../../../hooks/useLeads'
import { useLeadSources } from '../../../hooks/useLeadSources'
import { useLeadStatuses } from '../../../hooks/useLeadStatuses'
import { useTasks } from '../../../hooks/useTasks'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useGoalEntries } from '../../../hooks/useGoalEntries'
import { useReminders } from '../../../hooks/useReminders'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useUserQuestions } from '../../../hooks/useUserQuestions'

import QuickActionsModal from '../../../modals/QuickActionsModal'
import AddTransactionModal from '../../../modals/AddTransactionModal'
import AddClientModal from '../../../modals/AddClientModal'
import AddLeadModal from '../../../modals/AddLeadModal'
import AddProjectModal from '../../../modals/AddProjectModal'
import AddTaskModal from '../../../modals/AddTaskModal'
import AddGoalModal from '../../../modals/AddGoalModal'
import AddReminderModal from '../../../modals/AddReminderModal'
import ScheduleMeetingModal from '../../../modals/ScheduleMeetingModal'
import AddGoalEntryModal from '../../../modals/AddGoalEntryModal'
import QuickGoalUpdatePicker from '../../../modals/QuickGoalUpdatePicker'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* Two quick-add CTAs on home:
   • הוספה מהירה → QuickActionsModal (launcher for *every* Add* in the app).
   • עדכון יעד   → goal-category picker → AddGoalEntryModal. */
export default function QuickRow() {
  const { t } = useT('home')
  const { addTransaction } = useTransactions()
  const { clients, addClient } = useClients()
  const { statuses: clientStatuses } = useClientStatuses()
  const { projects, addProject } = useProjects()
  const { addLead } = useLeads()
  const { sources: leadSources } = useLeadSources()
  const { statuses: leadStatuses } = useLeadStatuses()
  const { addTask } = useTasks()
  const { categories } = useGoalCategories()
  const { goals, addGoal } = useGoals()
  const { addEntry } = useGoalEntries()
  const { addReminder } = useReminders()
  const { addMeeting } = useScheduledMeetings()
  const { questions, addQuestion } = useUserQuestions()

  const [showLauncher, setShowLauncher] = useState(false)
  const [active, setActive] = useState(null)  // 'transaction' | 'client' | ...

  // עדכון יעד flow (manual goal entry).
  const [showPicker, setShowPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)

  const close = () => setActive(null)

  return (
    <Box className="h-quick-row">
      <Btn
        type="button"
        className="h-quick-btn h-quick-primary"
        onClick={() => setShowLauncher(true)}
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <Txt>{t('widgets.quick.quickAdd')}</Txt>
      </Btn>
      <Btn
        type="button"
        className="h-quick-btn h-quick-secondary"
        onClick={() => setShowPicker(true)}
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <Txt>{t('widgets.quick.goalUpdate')}</Txt>
      </Btn>

      <QuickActionsModal
        open={showLauncher}
        onClose={() => setShowLauncher(false)}
        onPick={setActive}
      />

      {/* Each Add* modal listens on `active`. They render unmounted-ish
          (Modal handles open=false), and only one is open at a time. */}
      <AddTransactionModal
        open={active === 'transaction'}
        onClose={close}
        clients={clients}
        projects={projects}
        onSave={addTransaction}
      />
      <AddClientModal
        open={active === 'client'}
        onClose={close}
        projects={projects}
        statuses={clientStatuses}
        onSave={addClient}
      />
      <AddLeadModal
        open={active === 'lead'}
        onClose={close}
        sources={leadSources}
        statuses={leadStatuses}
        onSave={addLead}
      />
      <AddProjectModal
        open={active === 'project'}
        onClose={close}
        onSave={addProject}
      />
      <AddTaskModal
        open={active === 'task'}
        onClose={close}
        projects={projects}
        clients={clients}
        onSave={addTask}
      />
      <AddGoalModal
        open={active === 'goal'}
        onClose={close}
        categories={categories}
        projects={projects}
        questions={questions}
        onAddQuestion={addQuestion}
        onSave={addGoal}
      />
      <AddReminderModal
        open={active === 'reminder'}
        onClose={close}
        clients={clients}
        onSave={addReminder}
      />
      <ScheduleMeetingModal
        open={active === 'meeting'}
        onClose={close}
        clients={clients}
        onSave={addMeeting}
      />

      {/* עדכון יעד flow — orthogonal to the launcher above. */}
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
    </Box>
  )
}

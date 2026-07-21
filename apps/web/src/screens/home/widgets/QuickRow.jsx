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
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* ONE quick-add CTA on home: "הוספה מהירה" → QuickActionsModal, the launcher
   for *every* Add* in the app.

   It used to share the row 50/50 with "עדכון יעד", which read as an equal
   sibling — same width, same "+" — while actually being a narrow action that
   cost three taps (category picker → modal → save) because it had no goal to
   anchor to. It now lives per-goal inside the moon widget, where the goal is
   already on screen and the picker step is unnecessary. */
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
  const { addGoal } = useGoals()
  const { addReminder } = useReminders()
  const { addMeeting } = useScheduledMeetings()
  const { questions, addQuestion } = useUserQuestions()

  const [showLauncher, setShowLauncher] = useState(false)
  const [active, setActive] = useState(null)  // 'transaction' | 'client' | ...

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
    </Box>
  )
}

import { useMemo, useState } from 'react'
import { Target, Plus } from 'lucide-react'
import { goalsByCategory } from '../../lib/goals'
import { CATEGORY_PRESETS, presetToCategory } from '../../lib/goalPresets'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useTransactions } from '../../hooks/useTransactions'
import { useProjects } from '../../hooks/useProjects'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import GoalCard from './GoalCard'
import AddGoalModal, { OTHER_METRIC_KEY } from '../../modals/AddGoalModal'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import EditGoalModal from '../../modals/EditGoalModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import { useAddress } from '../../hooks/useAddress'
import './GoalsScreen.css'

/* The generic "אחר — עדכון ידני" bucket: every custom manual goal lands here,
   so the user never manages metrics on this screen. Created on demand. */
const OTHER_METRIC = {
  key: OTHER_METRIC_KEY,
  name: 'אחר',
  icon: '📝',
  color: '#7a5cb8',
  measurement_type: 'manual',
  data_source: null,
  graph_type: 'delta',
  builtin: false,
}

export default function GoalsScreen() {
  const { addr } = useAddress()
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, removeGoal } = useGoals()
  const { categories, loading: catsLoading, error: catsError, addCategory } = useGoalCategories()
  const { entries, addEntry, removeEntry } = useGoalEntries()
  const { transactions } = useTransactions()
  const { projects } = useProjects()
  const { groups: clientGroups } = useGroups()
  const { members } = useGroupMembers()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { questions, addQuestion } = useUserQuestions()
  const { answers } = useDailyAnswers()
  const { prefs } = useUserPreferences()
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState(null)
  const [editGoal, setEditGoalState] = useState(null)

  const loading = goalsLoading || catsLoading
  const error = goalsError || catsError

  const groups = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups: clientGroups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, clientGroups],
  )
  const totalGoals = groups.reduce((s, g) => s + g.goals.length, 0)

  /* Resolve the metric chosen in AddGoalModal to a real category id, creating
     the category on demand. Metrics aren't managed on-screen anymore: the
     system presets are auto-measured; "אחר" is the one shared manual bucket. */
  const resolveCategoryId = async (metricKey) => {
    if (metricKey === OTHER_METRIC_KEY) {
      const existing = categories.find((c) => c.key === OTHER_METRIC_KEY)
      if (existing) return existing.id
      const created = await addCategory(presetToCategory(OTHER_METRIC))
      return created.id
    }
    const preset = CATEGORY_PRESETS.find((p) => p.key === metricKey)
    if (!preset) throw new Error('מדד לא מוכר')
    const existing = categories.find((c) => c.data_source === preset.data_source)
    if (existing) return existing.id
    const created = await addCategory(presetToCategory(preset))
    return created.id
  }

  const handleAddGoal = async ({ metric_key, ...rest }) => {
    const category_id = await resolveCategoryId(metric_key)
    return addGoal({ category_id, ...rest })
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{totalGoals} יעדים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">תנועה</p>
            </div>
            <p className="lbl-sm">כל יעד — כיוון, לא לחץ.</p>
          </div>
          <p className="t-screen">יעדים</p>
        </header>
        <Coachmark id="add-goal" radius="50%">
          <button className="cta-add" type="button" aria-label="יעד חדש" onClick={() => setShowAddGoal(true)}>
            + יעד חדש
          </button>
        </Coachmark>
      </div>

      {loading ? (
        <div className="empty"><p className="empty-text">טוען יעדים…</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינת היעדים: {error}</p></div>
      ) : totalGoals === 0 ? (
        <div className="empty">
          <span className="empty-icon"><Target size={28} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="empty-text">{addr({ male: 'הגדר את היעד הראשון שלך', female: 'הגדירי את היעד הראשון שלך', neutral: 'הגדר/י את היעד הראשון שלך' })}.</p>
          <button className="empty-action" type="button" onClick={() => setShowAddGoal(true)}>
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> {addr({ male: 'הגדר יעד', female: 'הגדירי יעד', neutral: 'הגדר/י יעד' })}
          </button>
          <details className="empty-reminder">
            <summary>למה זה חשוב?</summary>
            <p className="empty-reminder-body">{coachmarkText('add-goal', prefs?.design?.gender).detail}</p>
          </details>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.category.id} className="g-group">
            <div className="g-group-head">
              <p className="g-group-lbl">{g.category.name}</p>
            </div>
            {g.goals.map((s, i) => (
              <GoalCard
                key={s.goal.id}
                scored={s}
                index={i}
                entries={entries}
                onAddEntry={(cat) => setEntryCategory(cat)}
                onDeleteEntry={removeEntry}
                onEdit={(gl) => setEditGoalState(gl)}
                onDelete={(gl) => setPendingDeleteGoal(gl)}
              />
            ))}
          </section>
        ))
      )}

      <AddGoalModal
        open={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        projects={projects}
        groups={clientGroups}
        questions={questions}
        onAddQuestion={addQuestion}
        onSave={handleAddGoal}
      />
      <AddGoalEntryModal
        open={!!entryCategory}
        onClose={() => setEntryCategory(null)}
        category={entryCategory}
        onSave={addEntry}
      />
      <EditGoalModal
        key={editGoal?.id}
        open={!!editGoal}
        onClose={() => setEditGoalState(null)}
        goal={editGoal}
        categories={categories}
        projects={projects}
        groups={clientGroups}
        questions={questions}
        onSave={updateGoal}
        onDelete={(g) => { setEditGoalState(null); setPendingDeleteGoal(g) }}
      />
      <ConfirmModal
        open={!!pendingDeleteGoal}
        onClose={() => setPendingDeleteGoal(null)}
        title="מחיקת יעד"
        message={pendingDeleteGoal ? `למחוק את היעד${pendingDeleteGoal.label ? ` "${pendingDeleteGoal.label}"` : ''}? ניתן לשחזר מסל המיחזור תוך 30 יום.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteGoal) removeGoal(pendingDeleteGoal.id) }}
      />
    </div>
  )
}

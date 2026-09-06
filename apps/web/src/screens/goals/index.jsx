import { useMemo, useState } from 'react'
import { Target, Plus } from 'lucide-react'
import { goalsByCategory } from '@simplicity/core'
import { CATEGORY_PRESETS, presetToCategory, resolveManualCategoryId } from '../../lib/goalPresets'
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
import { useSubscription } from '../../hooks/useSubscription'
import { useUpgradeNav } from '../../hooks/useUpgradeNav'
import GoalCard from './GoalCard'
import AddGoalModal, { OTHER_METRIC_KEY } from '../../modals/AddGoalModal'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import EditGoalModal from '../../modals/EditGoalModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import { Box, Txt, Btn } from '../../components/ui'
import { useT } from '../../i18n/useT'
import './GoalsScreen.css'

/* The generic "אחר — עדכון ידני" bucket now lives in lib/goalPresets as
   MANUAL_CATEGORY, shared with onboarding (which used to create its own
   parallel one) and named in the user's language.

   SUB-GOALS ARE DORMANT. goals.parent_goal_id exists in the schema and
   moonGetData filters children out of the score, but nothing in the app can
   create one — every writer sends parent_goal_id: null, and production holds
   zero. The filter is not dead code and must stay: the day sub-goals do ship,
   a parent scoring its children on top of itself would double-count. This is a
   schema affordance with no UI, not a feature that broke. */

export default function GoalsScreen() {
  const { t } = useT('goals')
  const { t: ts } = useT('subscription')
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, removeGoal } = useGoals()
  const { limits } = useSubscription()
  const goUpgrade = useUpgradeNav()
  /* Free-tier goal ceiling. Infinity while billing isn't enforced. */
  const atGoalLimit = (goals?.length || 0) >= limits.goals
  const { categories, loading: catsLoading, error: catsError, addCategory } = useGoalCategories()
  const { entries, addEntry, removeEntry } = useGoalEntries()
  const { transactions } = useTransactions()
  const { projects } = useProjects()
  const { groups: clientGroups } = useGroups()
  const { members } = useGroupMembers()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { questions, addQuestion, updateQuestion } = useUserQuestions()
  const { answers } = useDailyAnswers()
  const { prefs } = useUserPreferences()
  const [showAddGoal, setShowAddGoal] = useState(false)
  /* What a progress entry is being logged FOR — the goal and its category.
     Was the category alone, which is exactly how entries ended up shared
     between every goal in a bucket (migration 0110). */
  const [entryTarget, setEntryTarget] = useState(null)
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
    if (metricKey === OTHER_METRIC_KEY) return resolveManualCategoryId(categories, addCategory)
    const preset = CATEGORY_PRESETS.find((p) => p.key === metricKey)
    /* Surfaced to the user via common.saveFailed({error}), so it cannot be a
       Hebrew literal — every other language would read it verbatim. */
    if (!preset) throw new Error(t('unknownMetric'))
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
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <Target size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('title')}
          </Txt>
        </Box>
        <Coachmark id="add-goal" radius="50%" satisfied={goals.length > 0}>
          <Btn className="cta-add" aria-label={t('newGoalAria')} onClick={() => (atGoalLimit ? goUpgrade() : setShowAddGoal(true))}>
            {t('newGoal')}
          </Btn>
        </Coachmark>
      </Box>
      {atGoalLimit && (
        <Btn className="sub-limit-note" onClick={goUpgrade}>{ts('limit.goals')} · {ts('limit.upgrade')}</Btn>
      )}

      {loading ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
      ) : error ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loadError', { error })}</Txt></Box>
      ) : totalGoals === 0 ? (
        <Box className="empty">
          <Txt className="empty-icon"><Target size={28} strokeWidth={1.4} aria-hidden="true" /></Txt>
          <Txt as="p" className="empty-text">{t('empty.firstGoal')}</Txt>
          <Btn className="empty-action" onClick={() => setShowAddGoal(true)}>
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> {t('empty.setGoal')}
          </Btn>
          <Box as="details" className="empty-reminder">
            <Txt as="summary">{t('empty.whyImportant')}</Txt>
            <Txt as="p" className="empty-reminder-body">{coachmarkText('add-goal', prefs?.design?.gender).detail}</Txt>
          </Box>
        </Box>
      ) : (
        groups.map((g) => (
          <Box as="section" key={g.category.id} className="g-group">
            <Box className="g-group-head">
              <Txt as="p" className="g-group-lbl">{g.category.name}</Txt>
            </Box>
            {g.goals.map((s, i) => (
              <GoalCard
                key={s.goal.id}
                scored={s}
                index={i}
                entries={entries}
                onAddEntry={(goal, cat) => setEntryTarget({ goal, cat })}
                onDeleteEntry={removeEntry}
                onEdit={(gl) => setEditGoalState(gl)}
                onDelete={(gl) => setPendingDeleteGoal(gl)}
              />
            ))}
          </Box>
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
        open={!!entryTarget}
        onClose={() => setEntryTarget(null)}
        category={entryTarget?.cat}
        goal={entryTarget?.goal}
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
        onAddQuestion={addQuestion}
        onUpdateQuestion={updateQuestion}
        onSave={updateGoal}
        onDelete={(g) => { setEditGoalState(null); setPendingDeleteGoal(g) }}
      />
      <ConfirmModal
        open={!!pendingDeleteGoal}
        onClose={() => setPendingDeleteGoal(null)}
        title={t('delete.title')}
        message={pendingDeleteGoal ? (pendingDeleteGoal.label ? t('delete.messageNamed', { label: pendingDeleteGoal.label }) : t('delete.message')) : ''}
        confirmLabel={t('delete.confirm')}
        danger
        onConfirm={() => { if (pendingDeleteGoal) removeGoal(pendingDeleteGoal.id) }}
      />
    </Box>
  )
}

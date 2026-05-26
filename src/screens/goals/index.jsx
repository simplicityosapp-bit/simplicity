import { useMemo, useState } from 'react'
import { Target, Plus, Pencil } from 'lucide-react'
import { goalsByCategory } from '../../lib/goals'
import { CATEGORY_PRESETS, presetToCategory } from '../../lib/goalPresets'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useTransactions } from '../../hooks/useTransactions'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import GoalCard from './GoalCard'
import AddGoalModal from '../../modals/AddGoalModal'
import AddGoalCategoryModal from '../../modals/AddGoalCategoryModal'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import EditGoalModal from '../../modals/EditGoalModal'
import EditGoalCategoryModal from '../../modals/EditGoalCategoryModal'
import GoalCategoryPicker from '../../modals/GoalCategoryPicker'
import ConfirmModal from '../../modals/ConfirmModal'
import './GoalsScreen.css'

export default function GoalsScreen() {
  const { goals, loading: goalsLoading, addGoal, updateGoal, removeGoal } = useGoals()
  const { categories, loading: catsLoading, addCategory, updateCategory, removeCategory } = useGoalCategories()
  const { entries, addEntry, removeEntry } = useGoalEntries()
  const { transactions } = useTransactions()
  const { projects } = useProjects()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { questions } = useUserQuestions()
  const { answers } = useDailyAnswers()
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)
  const [editCategory, setEditCategory] = useState(null)
  const [pendingDeleteCat, setPendingDeleteCat] = useState(null)
  const [editGoal, setEditGoalState] = useState(null)

  const loading = goalsLoading || catsLoading
  const taken = new Set(categories.map((c) => c.data_source).filter(Boolean))
  const availablePresets = CATEGORY_PRESETS.filter((p) => !taken.has(p.data_source))

  const groups = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers }),
    [goals, categories, entries, transactions, clients, leads, answers],
  )
  const totalGoals = groups.reduce((s, g) => s + g.goals.length, 0)

  const addPreset = (preset) => addCategory(presetToCategory(preset))

  /* Soft-delete a category + its goals (cascade isn't triggered by soft-delete). */
  const confirmDeleteCategory = async () => {
    const cat = pendingDeleteCat
    if (!cat) return
    await Promise.all(goals.filter((g) => g.category_id === cat.id).map((g) => removeGoal(g.id)))
    await removeCategory(cat.id)
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
        <button
          className="cta-add"
          type="button"
          aria-label={categories.length > 0 ? 'יעד חדש' : 'בחר/י קטגוריה'}
          onClick={() => (categories.length > 0 ? setShowAddGoal(true) : setShowCatPicker(true))}
        >
          {categories.length > 0 ? 'יעד חדש +' : 'בחר/י קטגוריה +'}
        </button>
      </div>

      {categories.length > 0 && (
        <div className="g-toolbar">
          <button className="g-add-cat" type="button" onClick={() => setShowCatPicker(true)}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" /> קטגוריה
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty"><p className="empty-text">טוען יעדים…</p></div>
      ) : categories.length === 0 ? (
        <div className="g-welcome">
          <span className="g-welcome-icon"><Target size={34} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="g-welcome-title">בחר/י מאיפה להתחיל</p>
          <p className="g-welcome-sub">יעד הוא כיוון, לא לחץ. אפשר תמיד להוסיף עוד בהמשך.</p>
          <div className="g-welcome-actions">
            {availablePresets.map((p) => (
              <button key={p.key} type="button" className="g-preset" onClick={() => addPreset(p)}>
                <span className="g-preset-ic">{p.icon}</span>
                <span className="g-preset-name">{p.name}</span>
                <span className="g-preset-hint">{p.hint}</span>
              </button>
            ))}
            <button type="button" className="g-preset custom" onClick={() => setShowAddCat(true)}>
              <span className="g-preset-ic"><Plus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="g-preset-name">קטגוריה משלי</span>
              <span className="g-preset-hint">שם, אייקון וצבע</span>
            </button>
          </div>
        </div>
      ) : totalGoals === 0 ? (
        <div className="empty">
          <p className="empty-text">יש לך קטגוריות מוכנות. צור/י את היעד הראשון מ«יעד חדש +».</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.category.id} className="g-group">
            <div className="g-group-head">
              <p className="g-group-lbl">{g.category.name}</p>
              <button type="button" className="g-group-edit" onClick={() => setEditCategory(g.category)} aria-label={`עריכת ${g.category.name}`}>
                <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
            {g.goals.map((s, i) => (
              <GoalCard
                key={s.goal.id}
                scored={s}
                index={i}
                entries={entries}
                onAddEntry={(cat) => setEntryCategory(cat)}
                onDeleteEntry={removeEntry}
                onEdit={(g) => setEditGoalState(g)}
              />
            ))}
          </section>
        ))
      )}

      <AddGoalModal
        open={showAddGoal}
        onClose={() => setShowAddGoal(false)}
        categories={categories}
        projects={projects}
        questions={questions}
        onSave={addGoal}
      />
      <AddGoalCategoryModal
        open={showAddCat}
        onClose={() => setShowAddCat(false)}
        onSave={addCategory}
      />
      <GoalCategoryPicker
        open={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        categories={categories}
        onAddPreset={addPreset}
        onAddCustom={() => setShowAddCat(true)}
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
        questions={questions}
        onSave={updateGoal}
      />
      <EditGoalCategoryModal
        key={editCategory?.id}
        open={!!editCategory}
        onClose={() => setEditCategory(null)}
        category={editCategory}
        onSave={updateCategory}
        onDelete={(cat) => { setEditCategory(null); setPendingDeleteCat(cat) }}
      />
      <ConfirmModal
        open={!!pendingDeleteCat}
        onClose={() => setPendingDeleteCat(null)}
        title="מחיקת קטגוריה"
        message={pendingDeleteCat ? `למחוק את "${pendingDeleteCat.name}"? כל היעדים תחת הקטגוריה יוסרו גם הם.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={confirmDeleteCategory}
      />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Target, Plus, Pencil } from 'lucide-react'
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
import AddGoalModal from '../../modals/AddGoalModal'
import AddGoalCategoryModal from '../../modals/AddGoalCategoryModal'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import EditGoalModal from '../../modals/EditGoalModal'
import EditGoalCategoryModal from '../../modals/EditGoalCategoryModal'
import GoalCategoryPicker from '../../modals/GoalCategoryPicker'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import './GoalsScreen.css'

export default function GoalsScreen() {
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, removeGoal } = useGoals()
  const { categories, loading: catsLoading, error: catsError, addCategory, updateCategory, removeCategory } = useGoalCategories()
  const { entries, addEntry, removeEntry } = useGoalEntries()
  const { transactions } = useTransactions()
  const { projects } = useProjects()
  const { groups: clientGroups } = useGroups()
  const { members } = useGroupMembers()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { questions } = useUserQuestions()
  const { answers } = useDailyAnswers()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)
  const [editCategory, setEditCategory] = useState(null)
  const [pendingDeleteCat, setPendingDeleteCat] = useState(null)
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState(null)
  const [editGoal, setEditGoalState] = useState(null)

  const loading = goalsLoading || catsLoading
  const error = goalsError || catsError
  const taken = new Set(categories.map((c) => c.data_source).filter(Boolean))
  const availablePresets = CATEGORY_PRESETS.filter((p) => !taken.has(p.data_source))

  const groups = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups: clientGroups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, clientGroups],
  )
  const totalGoals = groups.reduce((s, g) => s + g.goals.length, 0)

  const addPreset = (preset) => addCategory(presetToCategory(preset))

  /* C9 — seed the auto-measurable default categories ONCE per account so
     the user lands on a ready board instead of an empty "choose where to
     start" screen. Guarded by prefs.goalsSeeded so deleting a seeded
     category never makes it reappear. Existing users (who already have
     categories) are just flagged as seeded without adding anything. */
  const seedingRef = useRef(false)
  useEffect(() => {
    if (catsLoading || !prefs || prefs.goalsSeeded || seedingRef.current) return
    seedingRef.current = true
    ;(async () => {
      try {
        if (categories.length === 0) {
          for (const p of CATEGORY_PRESETS) {
            // eslint-disable-next-line no-await-in-loop
            await addCategory(presetToCategory(p))
          }
        }
        await updatePrefs({ goalsSeeded: true })
      } catch {
        seedingRef.current = false /* allow a retry on next mount */
      }
    })()
  }, [catsLoading, prefs, categories.length, addCategory, updatePrefs])

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
        <Coachmark id="add-goal" radius="50%">
          <button
            className="cta-add"
            type="button"
            aria-label={categories.length > 0 ? 'יעד חדש' : 'בחר/י קטגוריה'}
            onClick={() => (categories.length > 0 ? setShowAddGoal(true) : setShowCatPicker(true))}
          >
            {categories.length > 0 ? 'יעד חדש +' : 'בחר/י קטגוריה +'}
          </button>
        </Coachmark>
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
      ) : error ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינת היעדים: {error}</p></div>
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
          <span className="empty-icon"><Target size={28} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="empty-text">יש לכם קטגוריות מוכנות. היעד הראשון שלכם מתחיל כאן.</p>
          <button className="empty-action" type="button" onClick={() => setShowAddGoal(true)}>
            <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> הגדירו יעד
          </button>
          <details className="empty-reminder">
            <summary>למה זה חשוב?</summary>
            <p className="empty-reminder-body">{coachmarkText('add-goal').detail}</p>
          </details>
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
                onDelete={(g) => setPendingDeleteGoal(g)}
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
        groups={clientGroups}
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
        groups={clientGroups}
        questions={questions}
        onSave={updateGoal}
        onDelete={(g) => { setEditGoalState(null); setPendingDeleteGoal(g) }}
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
      <ConfirmModal
        open={!!pendingDeleteGoal}
        onClose={() => setPendingDeleteGoal(null)}
        title="מחיקת יעד"
        message={pendingDeleteGoal ? `למחוק את היעד${pendingDeleteGoal.label ? ` "${pendingDeleteGoal.label}"` : ''}? ניתן לשחזר מהזבל תוך 30 יום.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteGoal) removeGoal(pendingDeleteGoal.id) }}
      />
    </div>
  )
}

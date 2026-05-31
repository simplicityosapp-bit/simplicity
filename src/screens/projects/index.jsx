import { useMemo, useState } from 'react'
import { FolderOpen, FolderPlus } from 'lucide-react'
import { financeQuery, isr, currentMonthRange } from '../../lib/finance'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import ProjectCard from './ProjectCard'
import AddProjectModal from '../../modals/AddProjectModal'
import EditProjectModal from '../../modals/EditProjectModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import './ProjectsScreen.css'

export default function ProjectsScreen() {
  const { projects, loading, addProject, updateProject, removeProject } = useProjects()
  const { clients } = useClients()
  const { transactions } = useTransactions()
  const { tasks } = useTasks()
  const [view, setView] = useState('monthly')
  const [showAdd, setShowAdd] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editProject, setEditProject] = useState(null)

  const { totals, cards } = useMemo(() => {
    const range = view === 'monthly' ? currentMonthRange() : {}
    const allIncome = financeQuery({ type: 'income', ...range, source: transactions })
    const projIdSet = new Set(projects.map((p) => p.id))
    const clientProjMap = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const assignedClients = clients.filter((c) => c.project_id && projIdSet.has(c.project_id)).length
    const heroIncome = allIncome
      .filter((f) => projIdSet.has(f.project_id) || (f.client_id && clientProjMap.has(f.client_id)))
      .reduce((s, f) => s + f.amount, 0)
    /* groups aren't migrated yet → 0 for now. */
    const cards = projects.map((p) => {
      const projClientIds = new Set(clients.filter((c) => c.project_id === p.id).map((c) => c.id))
      const income = allIncome
        .filter((f) => f.project_id === p.id || (f.client_id && projClientIds.has(f.client_id)))
        .reduce((s, f) => s + f.amount, 0)
      const openTasks = tasks.filter(
        (t) => t.status !== 'done' && (t.project_id === p.id || (t.client_id && projClientIds.has(t.client_id))),
      ).length
      return { project: p, clientsCount: projClientIds.size, income, openTasks, groupsCount: 0 }
    })
    return { totals: { assignedClients, heroIncome }, cards }
  }, [view, projects, clients, transactions, tasks])

  const incomeLabel = view === 'monthly' ? 'הכנסות החודש' : 'הכנסות מצטברות'
  const cardIncomeLabel = view === 'monthly' ? 'החודש' : 'מצטבר'

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{projects.length} פרויקטים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">בנייה</p>
            </div>
            <p className="lbl-sm">מיקוד יוצר תוצאות.</p>
          </div>
          <p className="t-screen">פרויקטים</p>
        </header>
        <Coachmark id="add-project" radius="50%">
          <button className="cta-add" type="button" aria-label="הוסף פרויקט" onClick={() => setShowAdd(true)}>הוסף פרויקט +</button>
        </Coachmark>
      </div>

      <section className="p-hero">
        <div className="s-hero">
          <div className="mg-toggle" role="tablist" aria-label="טווח סכומים">
            <button type="button" className={`mg-toggle-btn${view === 'monthly' ? ' on' : ''}`} onClick={() => setView('monthly')}>חודשי</button>
            <button type="button" className={`mg-toggle-btn${view === 'cumulative' ? ' on' : ''}`} onClick={() => setView('cumulative')}>מצטבר</button>
          </div>
          <p className="p-hero-title">סיכום פרויקטים</p>
          <div className="p-hero-grid">
            <div className="p-hero-stat">
              <p className="p-hero-stat-l">פרויקטים</p>
              <p className="p-hero-stat-v mono">{projects.length}</p>
            </div>
            <div className="p-hero-stat divided">
              <p className="p-hero-stat-l">לקוחות</p>
              <p className="p-hero-stat-v mono">{totals.assignedClients}</p>
            </div>
            <div className="p-hero-stat">
              <p className="p-hero-stat-l">{incomeLabel}</p>
              <p className="p-hero-stat-v mono">{isr(totals.heroIncome)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="p-list">
        {loading ? (
          <div className="empty"><p className="empty-text">טוען פרויקטים…</p></div>
        ) : projects.length === 0 ? (
          <div className="empty">
            <span className="empty-icon"><FolderOpen size={36} strokeWidth={1.4} aria-hidden="true" /></span>
            <p className="empty-text">אין עדיין פרויקטים. הפרויקט הראשון שלכם מתחיל כאן.</p>
            <button className="empty-action" type="button" onClick={() => setShowAdd(true)}>
              <FolderPlus size={18} strokeWidth={1.6} aria-hidden="true" /> הוסיפו פרויקט
            </button>
            <details className="empty-reminder">
              <summary>למה זה חשוב?</summary>
              <p className="empty-reminder-body">{coachmarkText('add-project').detail}</p>
            </details>
          </div>
        ) : (
          cards.map((c, i) => (
            <ProjectCard
              key={c.project.id}
              project={c.project}
              clientsCount={c.clientsCount}
              income={c.income}
              openTasks={c.openTasks}
              groupsCount={c.groupsCount}
              incomeLabel={cardIncomeLabel}
              index={i}
              onEdit={setEditProject}
              onDelete={setPendingDelete}
            />
          ))
        )}
      </section>

      <AddProjectModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addProject} />
      <EditProjectModal
        key={editProject?.id}
        open={!!editProject}
        onClose={() => setEditProject(null)}
        project={editProject}
        onSave={updateProject}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="מחיקת פרויקט"
        message={pendingDelete ? `למחוק את "${pendingDelete.name}"? הלקוחות והתנועות יישארו (ללא פרויקט).` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDelete) removeProject(pendingDelete.id) }}
      />
    </div>
  )
}

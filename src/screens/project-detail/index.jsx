import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Pencil, Check, CalendarPlus, X } from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useSessions } from '../../hooks/useSessions'
import { useTransactions } from '../../hooks/useTransactions'
import { financeQuery, currentMonthRange, isr } from '../../lib/finance'
import AddGroupModal from '../../modals/AddGroupModal'
import EditGroupModal from '../../modals/EditGroupModal'
import EditProjectModal from '../../modals/EditProjectModal'
import AddGroupMemberModal from '../../modals/AddGroupMemberModal'
import AddSessionModal from '../../modals/AddSessionModal'
import ConfirmModal from '../../modals/ConfirmModal'
import './ProjectDetailScreen.css'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export default function ProjectDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, updateProject } = useProjects()
  const { clients } = useClients()
  const { groups, addGroup, updateGroup, removeGroup } = useGroups()
  const { members, addMember, removeMember } = useGroupMembers()
  const { sessions, addSession } = useSessions()
  const { transactions } = useTransactions()

  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null)
  const [addMemberFor, setAddMemberFor] = useState(null)
  const [logSessionFor, setLogSessionFor] = useState(null)
  const [editProjectOpen, setEditProjectOpen] = useState(false)

  const project = projects.find((p) => p.id === id)
  const projectGroups = useMemo(() => groups.filter((g) => g.project_id === id), [groups, id])
  const liveMembers = useMemo(() => members.filter((m) => !m.left_at), [members])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const projectClients = useMemo(() => clients.filter((c) => c.project_id === id), [clients, id])

  const monthIncome = useMemo(() => {
    const projClientIds = new Set(projectClients.map((c) => c.id))
    return financeQuery({ type: 'income', ...currentMonthRange(), source: transactions })
      .filter((t) => t.project_id === id || (t.client_id && projClientIds.has(t.client_id)))
      .reduce((s, t) => s + t.amount, 0)
  }, [transactions, projectClients, id])

  if (!project) {
    return (
      <div className="screen">
        <div className="empty"><p className="empty-text">הפרויקט לא נמצא.</p></div>
      </div>
    )
  }

  const logGroupSession = async (data) => {
    const g = logSessionFor
    const nextNum = sessions.filter((s) => s.group_id === g.id).length + 1
    await addSession({
      ...data,
      client_id: null,
      group_id: g.id,
      subject_type: 'group',
      subject_id: g.id,
      num: nextNum,
    })
  }

  return (
    <div className="screen pd-screen">
      <header className="pd-head">
        <button type="button" className="pd-back" onClick={() => navigate(-1)} aria-label="חזרה">
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div className="pd-head-id">
          <div className="pd-h-row">
            <span className="pd-color" style={{ background: project.color || 'var(--sage)' }} />
            <p className="pd-name">{project.name}</p>
          </div>
          <p className="pd-meta">{projectClients.length} לקוחות · {projectGroups.length} קבוצות</p>
        </div>
        <button type="button" className="pd-edit" onClick={() => setEditProjectOpen(true)} aria-label="עריכת פרויקט">
          <Pencil size={15} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </header>

      <section className="pd-stats">
        <div className="pd-stat">
          <p className="pd-stat-v mono">{projectClients.length}</p>
          <p className="pd-stat-l">לקוחות</p>
        </div>
        <div className="pd-stat divided">
          <p className="pd-stat-v mono">{isr(monthIncome)}</p>
          <p className="pd-stat-l">הכנסה החודש</p>
        </div>
        <div className="pd-stat">
          <p className="pd-stat-v mono">{projectGroups.length}</p>
          <p className="pd-stat-l">קבוצות</p>
        </div>
      </section>

      <button className="cta-add" type="button" onClick={() => setShowAddGroup(true)}>קבוצה חדשה +</button>

      <section className="pd-groups">
        {projectGroups.length === 0 ? (
          <div className="empty"><p className="empty-text">עדיין אין קבוצות. הוסף/י את הראשונה.</p></div>
        ) : (
          projectGroups.map((g) => {
            const groupMembers = liveMembers.filter((m) => m.group_id === g.id)
            const recurring = g.recurring_day != null && g.recurring_time
              ? `יום ${DAYS[g.recurring_day]} ${g.recurring_time}`
              : null
            return (
              <article key={g.id} className="gc">
                <div className="gc-head">
                  <span className="gc-color" style={{ background: g.color || 'var(--stone)' }} />
                  <p className="gc-name">{g.name}</p>
                  <button type="button" className="gc-icon-btn" onClick={() => setEditGroup(g)} aria-label="עריכת קבוצה">
                    <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
                <p className="gc-meta">
                  <span>{isr(g.package_price)}</span>
                  <span className="gc-dot">·</span>
                  <span>{g.package_sessions} מפגשים</span>
                  {recurring && <><span className="gc-dot">·</span><span>{recurring}</span></>}
                </p>
                <div className="gc-members">
                  {groupMembers.length === 0 ? (
                    <p className="gc-empty">עדיין אין חברים</p>
                  ) : (
                    groupMembers.map((m) => {
                      const c = clientById.get(m.client_id)
                      return (
                        <span key={m.id} className="gc-chip">
                          {c?.name || '(לקוח/ה)'}
                          <button type="button" className="gc-chip-x" onClick={() => removeMember(m.id)} aria-label={`הסר ${c?.name || 'חבר'}`}>
                            <X size={11} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </span>
                      )
                    })
                  )}
                </div>
                <div className="gc-actions">
                  <button type="button" className="gc-btn" onClick={() => setAddMemberFor(g)}>
                    <Plus size={13} strokeWidth={1.8} aria-hidden="true" /> הוסף חבר
                  </button>
                  <button type="button" className="gc-btn" onClick={() => setLogSessionFor(g)}>
                    <Check size={13} strokeWidth={1.8} aria-hidden="true" /> תעד פגישה
                  </button>
                  <button type="button" className="gc-btn ghost" onClick={() => setLogSessionFor(g)} title="פגישה קרובה" aria-label="פגישה קרובה">
                    <CalendarPlus size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })
        )}
      </section>

      <AddGroupModal
        open={showAddGroup}
        onClose={() => setShowAddGroup(false)}
        project={project}
        onSave={addGroup}
      />
      <EditGroupModal
        key={editGroup?.id}
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        group={editGroup}
        onSave={updateGroup}
        onDelete={(g) => { setEditGroup(null); setPendingDeleteGroup(g) }}
      />
      <EditProjectModal
        key={project.id}
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        project={project}
        onSave={updateProject}
      />
      <AddGroupMemberModal
        open={!!addMemberFor}
        onClose={() => setAddMemberFor(null)}
        group={addMemberFor}
        availableClients={
          addMemberFor
            ? clients.filter((c) => !liveMembers.some((m) => m.group_id === addMemberFor.id && m.client_id === c.id))
            : []
        }
        onSave={addMember}
      />
      <AddSessionModal
        key={logSessionFor?.id}
        open={!!logSessionFor}
        onClose={() => setLogSessionFor(null)}
        group={logSessionFor}
        nextNum={logSessionFor ? sessions.filter((s) => s.group_id === logSessionFor.id).length + 1 : null}
        onSave={logGroupSession}
      />
      <ConfirmModal
        open={!!pendingDeleteGroup}
        onClose={() => setPendingDeleteGroup(null)}
        title="מחיקת קבוצה"
        message={pendingDeleteGroup ? `למחוק את "${pendingDeleteGroup.name}"? החברויות יוסרו והקבוצה תיעלם מהפרויקט.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteGroup) removeGroup(pendingDeleteGroup.id) }}
      />
    </div>
  )
}

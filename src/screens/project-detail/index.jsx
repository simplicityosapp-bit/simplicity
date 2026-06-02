import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, ChevronDown, Plus, Pencil, Check, CalendarPlus, X, Trash2, Bell,
} from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useSessions } from '../../hooks/useSessions'
import { useTransactions } from '../../hooks/useTransactions'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { statusMetaOf } from '../../lib/clients'
import { financeQuery, currentMonthRange, isr } from '../../lib/finance'
import { buildRoute, ROUTES } from '../../lib/routes'
import AddGroupModal from '../../modals/AddGroupModal'
import EditGroupModal from '../../modals/EditGroupModal'
import EditProjectModal from '../../modals/EditProjectModal'
import AddGroupMemberModal from '../../modals/AddGroupMemberModal'
import AddSessionModal from '../../modals/AddSessionModal'
import AddClientModal from '../../modals/AddClientModal'
import AddReminderModal from '../../modals/AddReminderModal'
import DeleteGroupModal from '../../modals/DeleteGroupModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import DateField from '../../components/DateField'
import ProjectQuickRow from './ProjectQuickRow'
import ProjectIncomeChart from './ProjectIncomeChart'
import './ProjectDetailScreen.css'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const GSTATUS = [
  { k: 'active', l: 'פעילה' },
  { k: 'in_development', l: 'בפיתוח' },
  { k: 'ended', l: 'הסתיימה' },
]
const STATUS_LABEL = { active: 'פעילה', in_development: 'בפיתוח', ended: 'הסתיימה' }
const META_LABEL = { active: 'פעיל/ת', past: 'לשעבר' }

const fmtShortDate = (d) => {
  const dt = new Date(d)
  return `${dt.getDate()}.${dt.getMonth() + 1}.${String(dt.getFullYear()).slice(2)}`
}
const fmtTime = (d) => {
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}
const isoDate = (d) => new Date(d).toISOString().slice(0, 10)

export default function ProjectDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, updateProject } = useProjects()
  const { clients, addClient, updateClient } = useClients()
  const { groups, addGroup, updateGroup, removeGroup } = useGroups()
  const { members, addMember, removeMember } = useGroupMembers()
  const { sessions, addSession, updateSession, removeSession } = useSessions()
  const { transactions } = useTransactions()
  const { reminders, addReminder, completeReminder, removeReminder } = useReminders()
  const { meetings: scheduledMeetings, removeMeeting } = useScheduledMeetings()

  /* Section accordion + per-group sessions expand state. */
  const [openSec, setOpenSec] = useState({ groups: true, clients: true, reminders: false })
  const [openGroupSessions, setOpenGroupSessions] = useState(() => new Set())

  /* Modal/dialog state. */
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null)
  const [addMemberFor, setAddMemberFor] = useState(null)
  const [logSessionFor, setLogSessionFor] = useState(null)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [showAddClient, setShowAddClient] = useState(false)
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [pendingDeleteSession, setPendingDeleteSession] = useState(null)
  const [pendingDeleteReminder, setPendingDeleteReminder] = useState(null)
  /* Pending group status change (when ≥1 client will flip) → confirm dialog. */
  const [pendingStatusChange, setPendingStatusChange] = useState(null)
  /* Drag-a-client-onto-a-group state. */
  const [dropTargetGroup, setDropTargetGroup] = useState(null)
  const [pendingAssign, setPendingAssign] = useState(null) /* { client, group } */

  const project = projects.find((p) => p.id === id)
  const projectGroups = useMemo(() => groups.filter((g) => g.project_id === id), [groups, id])
  const liveMembers = useMemo(() => members.filter((m) => !m.left_at), [members])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const projectClients = useMemo(() => clients.filter((c) => c.project_id === id), [clients, id])

  /* Active / wandering split — same logic as the prototype's pd-header sub. */
  const { activeCount, wanderingCount } = useMemo(() => {
    let a = 0; let w = 0
    projectClients.forEach((c) => {
      const m = statusMetaOf(c)
      if (m === 'active') a += 1
      else if (m === 'wandering') w += 1
    })
    return { activeCount: a, wanderingCount: w }
  }, [projectClients])

  const monthIncome = useMemo(() => {
    const projClientIds = new Set(projectClients.map((c) => c.id))
    return financeQuery({ type: 'income', ...currentMonthRange(), source: transactions })
      .filter((t) => t.project_id === id || (t.client_id && projClientIds.has(t.client_id)))
      .reduce((s, t) => s + t.amount, 0)
  }, [transactions, projectClients, id])

  /* Reminders linked to this project (any status). */
  const projectReminders = useMemo(
    () => reminders.filter((r) => r.linked_to_type === 'project' && r.linked_to_id === id),
    [reminders, id],
  )
  const activeReminders = projectReminders.filter((r) => r.status === 'pending' || r.status === 'triggered')

  if (!project) {
    return (
      <div className="screen">
        <div className="empty"><p className="empty-text">הפרויקט לא נמצא.</p></div>
      </div>
    )
  }

  const toggleSec = (k) => setOpenSec((s) => ({ ...s, [k]: !s[k] }))
  const toggleGroupSessions = (gid) => {
    setOpenGroupSessions((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid); else next.add(gid)
      return next
    })
  }

  /* ── group helpers ──────────────────────────────────────── */

  /* Discover all unique members of a group: live group_members rows
     plus legacy clients.group_id mirror — matches the prototype's union. */
  const groupMemberClients = (gid) => {
    const ids = new Set()
    liveMembers.forEach((m) => { if (m.group_id === gid) ids.add(m.client_id) })
    clients.forEach((c) => { if (!c.deleted_at && c.group_id === gid) ids.add(c.id) })
    return Array.from(ids).map((cid) => clientById.get(cid)).filter(Boolean)
  }

  const propagateToClients = async (gid, newStatus) => {
    let targetMeta = null
    if (newStatus === 'active') targetMeta = 'active'
    if (newStatus === 'ended') targetMeta = 'past'
    if (!targetMeta) return 0
    const memberClients = groupMemberClients(gid).filter((c) => statusMetaOf(c) !== targetMeta)
    for (const c of memberClients) {
      // eslint-disable-next-line no-await-in-loop
      await updateClient(c.id, { status: targetMeta, status_meta: targetMeta }).catch(() => {})
    }
    return memberClients.length
  }

  const requestGroupStatus = (g, newStatus) => {
    const old = g.status || 'active'
    if (old === newStatus) return
    let targetMeta = null
    if (newStatus === 'active') targetMeta = 'active'
    if (newStatus === 'ended') targetMeta = 'past'
    const willFlip = targetMeta
      ? groupMemberClients(g.id).filter((c) => statusMetaOf(c) !== targetMeta)
      : []
    if (willFlip.length === 0) {
      /* Silent — only the group's status flips, no client churn. */
      updateGroup(g.id, { status: newStatus })
      return
    }
    setPendingStatusChange({ group: g, newStatus, willFlip, targetMeta })
  }

  const confirmGroupStatusChange = async () => {
    if (!pendingStatusChange) return
    const { group: g, newStatus } = pendingStatusChange
    await updateGroup(g.id, { status: newStatus })
    await propagateToClients(g.id, newStatus)
    setPendingStatusChange(null)
  }

  /* ── session helpers ────────────────────────────────────── */

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

  const updateSessionDate = async (s, dateStr) => {
    if (!dateStr) return
    const orig = new Date(s.date)
    const next = new Date(dateStr)
    next.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds())
    await updateSession(s.id, { date: next.toISOString() })
  }

  /* ── drag a client onto a group ─────────────────────────────
     A client can belong to several groups; dropping either MOVES them
     here (removing other memberships) or ADDS this one alongside. The
     join date is set to today automatically (optional flow). */
  const otherGroupCount = (client) =>
    liveMembers.filter((m) => m.client_id === client.id && m.group_id !== null).map((m) => m.group_id)
      .concat(client.group_id ? [client.group_id] : [])
      .filter((gid, i, arr) => gid && arr.indexOf(gid) === i)
      .length

  const assignToGroup = async (client, group, mode) => {
    if (!client || !group) return
    if (mode === 'move') {
      const others = liveMembers.filter((m) => m.client_id === client.id && m.group_id !== group.id)
      for (const m of others) {
        // eslint-disable-next-line no-await-in-loop
        await removeMember(m.id).catch(() => {})
      }
    }
    const alreadyMember = liveMembers.some((m) => m.client_id === client.id && m.group_id === group.id)
    if (!alreadyMember) {
      await addMember({
        group_id: group.id,
        client_id: client.id,
        joined_at: new Date().toISOString(),
        left_at: null,
        total_override: null,
        has_custom_price: false,
        package_sessions_override: null,
        left_mid_process: false,
      }).catch(() => {})
    }
    /* Mirror the single-group tag (clients.group_id) to the latest group. */
    if (client.group_id !== group.id) await updateClient(client.id, { group_id: group.id }).catch(() => {})
  }

  const handleDropOnGroup = (e, group) => {
    e.preventDefault()
    setDropTargetGroup(null)
    const cid = e.dataTransfer.getData('text/client-id')
    const client = clients.find((c) => c.id === cid)
    if (!client) return
    const inThisGroup = liveMembers.some((m) => m.client_id === client.id && m.group_id === group.id) || client.group_id === group.id
    const elsewhere = otherGroupCount(client) - (inThisGroup ? 1 : 0)
    if (inThisGroup && elsewhere <= 0) return /* already only here — nothing to do */
    if (elsewhere <= 0) { assignToGroup(client, group, 'add'); return } /* not in any other group → just add */
    setPendingAssign({ client, group }) /* in other group(s) → ask move vs add */
  }

  /* ── delete-group cascade ───────────────────────────────── */

  const deleteGroupCounts = (g) => {
    const memberCount = groupMemberClients(g.id).length
    const futureMeetings = scheduledMeetings.filter(
      (m) => m.subject_type === 'group' && m.subject_id === g.id && m.status === 'pending',
    ).length
    const pastSessions = sessions.filter((s) => s.group_id === g.id).length
    const remindersCount = reminders.filter(
      (r) => r.linked_to_type === 'group' && r.linked_to_id === g.id,
    ).length
    return { members: memberCount, futureMeetings, pastSessions, reminders: remindersCount }
  }

  const runDeleteGroup = async (g, choices) => {
    /* Members: if user opted to "delete clients", soft-delete them via updateClient.
       Otherwise release the group_id and clear membership rows so they fall back to
       private project clients (matches prototype semantics). */
    const memberClients = groupMemberClients(g.id)
    for (const c of memberClients) {
      if (choices.keepMembers === false) {
        // eslint-disable-next-line no-await-in-loop
        await updateClient(c.id, { deleted_at: new Date().toISOString() }).catch(() => {})
      } else if (c.group_id === g.id) {
        // eslint-disable-next-line no-await-in-loop
        await updateClient(c.id, { group_id: null }).catch(() => {})
      }
    }
    /* Drop the group_members rows tied to this group regardless. */
    const memberRows = liveMembers.filter((m) => m.group_id === g.id)
    for (const m of memberRows) {
      // eslint-disable-next-line no-await-in-loop
      await removeMember(m.id).catch(() => {})
    }
    /* Past sessions are kept by default (history); if user opted to delete, soft-delete. */
    if (choices.keepPastSessions === false) {
      const groupSessions = sessions.filter((s) => s.group_id === g.id)
      for (const s of groupSessions) {
        // eslint-disable-next-line no-await-in-loop
        await removeSession(s.id).catch(() => {})
      }
    }
    /* Reminders linked to this group: soft-delete if user opted out. */
    if (choices.keepReminders === false) {
      const groupReminders = reminders.filter((r) => r.linked_to_type === 'group' && r.linked_to_id === g.id)
      for (const r of groupReminders) {
        // eslint-disable-next-line no-await-in-loop
        await removeReminder(r.id).catch(() => {})
      }
    }
    /* Future scheduled meetings (pending) — honor the user's keepFutureMeetings
       choice. Default is to drop them (the recurring rule is gone), but the
       user can override if they want the existing rows to stay (e.g. for
       short-term continuity while a replacement is being set up). */
    if (choices.keepFutureMeetings === false) {
      const futureMeetings = scheduledMeetings.filter(
        (m) => m.subject_type === 'group' && m.subject_id === g.id && m.status === 'pending',
      )
      for (const m of futureMeetings) {
        // eslint-disable-next-line no-await-in-loop
        await removeMeeting(m.id).catch(() => {})
      }
    }
    await removeGroup(g.id)
  }

  /* ── render ─────────────────────────────────────────────── */

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
          <p className="pd-meta">
            {activeCount} פעילים
            {wanderingCount > 0 && ` · ${wanderingCount} נודדים`}
            {' · '}{projectGroups.length} קבוצות
          </p>
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

      {/* Quick-action row — same shape as Home's QuickRow, but every
          Add* opened from here pre-binds to the current project. */}
      <div className="pd-quick-row-wrap">
        <ProjectQuickRow projectId={id} projectName={project.name} />
      </div>

      {/* Monthly cumulative income chart, scoped to this project. */}
      <ProjectIncomeChart projectId={id} />

      {/* ── Groups section ────────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('groups')}>
          <p className="pd-sec-title">
            קבוצות {projectGroups.length > 0 && <span className="pd-sec-count">{projectGroups.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.groups ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.groups && (
          <div className="pd-sec-body">
            {projectGroups.length === 0 ? (
              <p className="pd-empty">עדיין אין קבוצות. הוסף/י קבוצה כדי להתחיל ניהול מחזור.</p>
            ) : (
              projectGroups.map((g) => {
                const groupMembers = liveMembers.filter((m) => m.group_id === g.id)
                const memberCount = groupMemberClients(g.id).length
                const recurring = g.recurring_day != null && g.recurring_time
                  ? `${DAYS[g.recurring_day]} ${g.recurring_time}`
                  : null
                const billingMode = g.billing_mode || 'package'
                const priceLabel = billingMode === 'per_session'
                  ? (g.price_per_session ? `${isr(g.price_per_session)} למפגש` : '')
                  : billingMode === 'none'
                    ? ''
                    : (g.package_price ? `${isr(g.package_price)} / ${g.package_sessions || 1} פגישות` : '')
                const status = g.status || 'active'
                const sessOpen = openGroupSessions.has(g.id)
                const groupSessions = sessions
                  .filter((s) => s.group_id === g.id)
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                return (
                  <article
                    key={g.id}
                    className={`gc${dropTargetGroup === g.id ? ' drop-target' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropTargetGroup !== g.id) setDropTargetGroup(g.id) }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setDropTargetGroup(null) }}
                    onDrop={(e) => handleDropOnGroup(e, g)}
                  >
                    <div className="gc-head">
                      <span className="gc-color" style={{ background: g.color || 'var(--stone)' }} />
                      <p className="gc-name">{g.name}</p>
                      <button type="button" className="gc-icon-btn" onClick={() => setEditGroup(g)} aria-label="עריכת קבוצה">
                        <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="gc-status-row">
                      {GSTATUS.map((s) => (
                        <button
                          key={s.k}
                          type="button"
                          className={`gc-status-pill${status === s.k ? ' on' : ''}`}
                          data-status={s.k}
                          onClick={() => requestGroupStatus(g, s.k)}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                    <p className="gc-meta">
                      <span>{memberCount} חברים</span>
                      {priceLabel && <><span className="gc-dot">·</span><span>{priceLabel}</span></>}
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
                      <button
                        type="button"
                        className={`gc-btn ghost${sessOpen ? ' on' : ''}`}
                        onClick={() => toggleGroupSessions(g.id)}
                        title="פגישות שהתקיימו"
                        aria-label="פגישות שהתקיימו"
                      >
                        <CalendarPlus size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="gc-btn ghost danger"
                        onClick={() => setPendingDeleteGroup(g)}
                        title="מחק קבוצה"
                        aria-label="מחק קבוצה"
                      >
                        <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </div>
                    {sessOpen && (
                      <div className="gc-sessions">
                        <p className="gc-section-title">פגישות שהתקיימו{groupSessions.length ? ` (${groupSessions.length})` : ''}</p>
                        {groupSessions.length === 0 ? (
                          <p className="gc-empty">אין פגישות מתועדות עדיין</p>
                        ) : (
                          groupSessions.map((s) => (
                            <div key={s.id} className="gc-sess-row">
                              <span className="gc-sess-num mono">#{s.num}</span>
                              <DateField
                                className="gc-sess-date"
                                value={isoDate(s.date)}
                                onChange={(e) => updateSessionDate(s, e.target.value)}
                              />
                              <button
                                type="button"
                                className="gc-chip-x"
                                onClick={() => setPendingDeleteSession(s)}
                                aria-label="מחק פגישה"
                              >
                                <X size={11} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </article>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddGroup(true)}>
              הוסף קבוצה +
            </button>
          </div>
        )}
      </section>

      {/* ── Clients section ───────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('clients')}>
          <p className="pd-sec-title">
            לקוחות {projectClients.length > 0 && <span className="pd-sec-count">{projectClients.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.clients ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.clients && (
          <div className="pd-sec-body">
            {projectClients.length === 0 ? (
              <p className="pd-empty">אין לקוחות בפרויקט זה</p>
            ) : (
              projectClients.map((c) => {
                const g = c.group_id ? projectGroups.find((gg) => gg.id === c.group_id) : null
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="pd-client"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/client-id', c.id); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => navigate(buildRoute(ROUTES.CLIENT, { id: c.id }))}
                  >
                    <span className="pd-client-grip" aria-hidden="true">⠿</span>
                    <span className="pd-client-name">{c.name}</span>
                    {g ? (
                      <span className="pd-client-tag group-member">{g.name}</span>
                    ) : (
                      <span className="pd-client-tag private">פרטי</span>
                    )}
                  </button>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddClient(true)}>
              הוסף לקוח לפרויקט +
            </button>
          </div>
        )}
      </section>

      {/* ── Reminders section ─────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('reminders')}>
          <p className="pd-sec-title">
            תזכורות מקושרות{' '}
            <span className="pd-sec-count">
              {activeReminders.length}
              {projectReminders.length > activeReminders.length ? ` / ${projectReminders.length}` : ''}
            </span>
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.reminders ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.reminders && (
          <div className="pd-sec-body">
            {projectReminders.length === 0 ? (
              <p className="pd-empty">אין תזכורות מקושרות</p>
            ) : (
              projectReminders.map((r) => {
                const isCompleted = r.status === 'completed'
                const isOverdue = r.status === 'pending' && new Date(r.scheduled_at).getTime() < Date.now()
                return (
                  <div key={r.id} className="pd-rem-row">
                    <div className="pd-rem-id">
                      <p className={`pd-rem-title${isCompleted ? ' done' : ''}`}>{r.title}</p>
                      <p className="pd-rem-meta">
                        {fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}
                        {isCompleted && ' · בוצעה'}
                        {isOverdue && ' · באיחור'}
                      </p>
                    </div>
                    {!isCompleted && (
                      <button
                        type="button"
                        className="pd-rem-btn"
                        onClick={() => completeReminder(r.id)}
                        aria-label="סמן כבוצעה"
                        title="סמן כבוצעה"
                      >
                        <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="pd-rem-btn danger"
                      onClick={() => setPendingDeleteReminder(r)}
                      aria-label="מחק תזכורת"
                      title="מחק תזכורת"
                    >
                      <X size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddReminder(true)}>
              <Bell size={13} strokeWidth={1.8} aria-hidden="true" /> תזכורת לפרויקט +
            </button>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────── */}
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
      <AddClientModal
        key={`add-client-${id}`}
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        projects={projects}
        statuses={[]}
        onSave={async (payload) => addClient({ ...payload, project_id: id })}
      />
      <AddReminderModal
        open={showAddReminder}
        onClose={() => setShowAddReminder(false)}
        clients={clients}
        defaultLinkedTo={{ type: 'project', id }}
        linkedSubjectName={project.name}
        onSave={addReminder}
      />
      <DeleteGroupModal
        key={pendingDeleteGroup?.id}
        open={!!pendingDeleteGroup}
        onClose={() => setPendingDeleteGroup(null)}
        group={pendingDeleteGroup}
        counts={pendingDeleteGroup ? deleteGroupCounts(pendingDeleteGroup) : null}
        onConfirm={(choices) => { if (pendingDeleteGroup) runDeleteGroup(pendingDeleteGroup, choices) }}
      />
      <ConfirmModal
        open={!!pendingDeleteSession}
        onClose={() => setPendingDeleteSession(null)}
        title="מחיקת פגישה"
        message="למחוק את הפגישה הקבוצתית? היא תוסר לכל החברים."
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteSession) removeSession(pendingDeleteSession.id) }}
      />
      <ConfirmModal
        open={!!pendingDeleteReminder}
        onClose={() => setPendingDeleteReminder(null)}
        title="מחיקת תזכורת"
        message={pendingDeleteReminder ? `למחוק את "${pendingDeleteReminder.title}"?` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteReminder) removeReminder(pendingDeleteReminder.id) }}
      />
      <ConfirmModal
        open={!!pendingStatusChange}
        onClose={() => setPendingStatusChange(null)}
        title="שינוי סטטוס קבוצה"
        message={pendingStatusChange
          ? `שינוי הסטטוס ל-"${STATUS_LABEL[pendingStatusChange.newStatus]}" יעביר ${pendingStatusChange.willFlip.length} ${
              pendingStatusChange.willFlip.length === 1 ? 'לקוח' : 'לקוחות'
            } ל-"${META_LABEL[pendingStatusChange.targetMeta]}". להמשיך?`
          : ''}
        confirmLabel="שנה סטטוס"
        onConfirm={confirmGroupStatusChange}
      />

      <Modal open={!!pendingAssign} onClose={() => setPendingAssign(null)} title="שיוך לקבוצה">
        {pendingAssign && (
          <>
            <p className="m-confirm-msg">
              <strong>{pendingAssign.client.name}</strong> כבר משויך/ת לקבוצה אחרת. להעביר
              ל"{pendingAssign.group.name}", או להוסיף כך שיהיה/תהיה גם וגם?
            </p>
            <div className="m-actions">
              <button type="button" className="m-btn-cancel" onClick={() => setPendingAssign(null)}>ביטול</button>
              <button
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'add'); setPendingAssign(null) }}
              >
                הוספה (גם וגם)
              </button>
              <button
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'move'); setPendingAssign(null) }}
              >
                העברה לכאן
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, ChevronDown, Plus, Pencil, Check, CalendarPlus, X, Trash2, Bell, GripVertical, Link2, ChevronLeft, Sprout,
} from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useLeadPages } from '../../hooks/useLeadPages'
import { useLeads } from '../../hooks/useLeads'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useSessions } from '../../hooks/useSessions'
import { useTransactions } from '../../hooks/useTransactions'
import { useReminders } from '../../hooks/useReminders'
import { useTasks } from '../../hooks/useTasks'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { usePointerDnd } from '../../hooks/usePointerDnd'
import { useT } from '../../i18n/useT'
import { Trans } from 'react-i18next'
import { statusMetaOf } from '../../lib/clients'
import { metaTitle, statusMetaOfLead, isPendingReview } from '../../lib/leads'
import { staleScheduledMeetingIds } from '../../lib/scheduledMeetings'
import { financeQuery, currentMonthRange, isr } from '../../lib/finance'
import { buildRoute, ROUTES } from '../../lib/routes'
import { restoreGroup } from '../../lib/api/groups'
import { restoreSession } from '../../lib/api/sessions'
import { restoreReminder } from '../../lib/api/reminders'
import { restoreClient } from '../../lib/api/clients'
import { restoreGroupMember } from '../../lib/api/groupMembers'
import { insertScheduledMeeting } from '../../lib/api/scheduledMeetings'
import { pushUndo } from '../../lib/undo'
import AddGroupModal from '../../modals/AddGroupModal'
import EditGroupModal from '../../modals/EditGroupModal'
import EditProjectModal from '../../modals/EditProjectModal'
import AddGroupMemberModal from '../../modals/AddGroupMemberModal'
import AddSessionModal from '../../modals/AddSessionModal'
import AddClientModal from '../../modals/AddClientModal'
import AddReminderModal from '../../modals/AddReminderModal'
import AddTaskModal from '../../modals/AddTaskModal'
import DeleteGroupModal from '../../modals/DeleteGroupModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import DateField from '../../components/DateField'
import MG from '../../components/MG'
import ProjectQuickRow from './ProjectQuickRow'
import ProjectIncomeChart from './ProjectIncomeChart'
import ProjectMoonRing from './ProjectMoonRing'
import './ProjectDetailScreen.css'

const GSTATUS_KEYS = ['active', 'in_development', 'ended']

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
  const { t } = useT('projects')
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, updateProject } = useProjects()
  const { pages: leadPages } = useLeadPages()
  const { leads: leadList } = useLeads()
  const { statuses: leadStatuses } = useLeadStatuses()
  const { clients, addClient, updateClient, removeClient, refetch: refetchClients } = useClients()
  const { groups, addGroup, updateGroup, removeGroup, refetch: refetchGroups } = useGroups()
  const { members, addMember, removeMember, refetch: refetchMembers } = useGroupMembers()
  const { sessions, addSession, updateSession, removeSession, refetch: refetchSessions } = useSessions()
  const { transactions } = useTransactions()
  const { reminders, addReminder, completeReminder, removeReminder, refetch: refetchReminders } = useReminders()
  const { tasks, addTask, toggleTask, removeTask } = useTasks()
  const { meetings: scheduledMeetings, removeMeeting, refetch: refetchMeetings } = useScheduledMeetings()

  /* When a group's recurring slot changes or is cleared, drop the future
     pending meetings generated for the OLD slot so stale occurrences don't
     linger (same rationale as the client path in the clients screen). */
  const handleUpdateGroup = async (gid, patch) => {
    const prev = groups.find((g) => g.id === gid)
    const result = await updateGroup(gid, patch)
    if (prev && ('recurring_day' in patch || 'recurring_time' in patch)) {
      const stale = staleScheduledMeetingIds(
        'group', gid,
        { day: prev.recurring_day, time: prev.recurring_time },
        { day: patch.recurring_day, time: patch.recurring_time },
        scheduledMeetings,
      )
      for (const mid of stale) removeMeeting(mid).catch(() => {})
    }
    return result
  }

  const DAYS = t('detail.days', { returnObjects: true })
  const GSTATUS = GSTATUS_KEYS.map((k) => ({ k, l: t(`detail.status.${k}`) }))
  const STATUS_LABEL = {
    active: t('detail.status.active'),
    in_development: t('detail.status.in_development'),
    ended: t('detail.status.ended'),
  }
  const META_LABEL = { active: t('detail.meta.active'), past: t('detail.meta.past') }

  /* Section accordion + per-group sessions expand state. */
  const [openSec, setOpenSec] = useState({ groups: true, clients: true, leads: false, tasks: false, reminders: false, leadPages: false })
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
  const [showAddTask, setShowAddTask] = useState(false)
  const [pendingDeleteSession, setPendingDeleteSession] = useState(null)
  const [pendingDeleteReminder, setPendingDeleteReminder] = useState(null)
  /* Pending group status change (when ≥1 client will flip) → confirm dialog. */
  const [pendingStatusChange, setPendingStatusChange] = useState(null)
  const [pendingAssign, setPendingAssign] = useState(null) /* { client, group } */

  const project = projects.find((p) => p.id === id)
  const projectGroups = useMemo(() => groups.filter((g) => g.project_id === id), [groups, id])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  /* A membership whose client was soft-deleted is a ghost row: `clients`
     is live-only, so the roster used to render a nameless "(לקוח/ה)" chip
     for it while memberCount (via groupMemberClients → .filter(Boolean))
     already dropped it. Exclude these at the source so every liveMembers
     consumer stays consistent and aligned with §3 (live() in current-state
     views). */
  const liveMembers = useMemo(
    () => members.filter((m) => !m.left_at && clientById.has(m.client_id)),
    [members, clientById],
  )
  const projectClients = useMemo(() => clients.filter((c) => c.project_id === id), [clients, id])
  const projectLeadPages = useMemo(
    () => (leadPages || []).filter((p) => p.project_id === id && !p.deleted_at),
    [leadPages, id],
  )
  /* Leads tied to this project (excludes public submissions still awaiting
     approval, which live in the leads-screen review section, not here). */
  const projectLeads = useMemo(
    () => (leadList || []).filter((l) => l.project_id === id && !isPendingReview(l)),
    [leadList, id],
  )

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

  /* Tasks tied to this project (any status). Open count drives the section
     badge; completed ones still list (struck through) so nothing is hidden. */
  const projectTasks = useMemo(
    () => tasks.filter((t) => !t.deleted_at && t.project_id === id),
    [tasks, id],
  )
  const openTaskCount = projectTasks.filter((t) => t.status !== 'done').length

  /* Touch+mouse drag of a project client onto a group (zone = group id).
     Declared before the early return so the hook order stays stable; the
     onDrop closure resolves dropClientOnGroup (defined below) lazily. */
  const clientDnd = usePointerDnd({ onDrop: (clientId, groupId) => dropClientOnGroup(clientId, groupId) })

  if (!project) {
    return (
      <div className="screen">
        <div className="empty"><p className="empty-text">{t('detail.notFound')}</p></div>
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
    /* Skip clients whose status the coach has manually overridden
       (status_overridden, migration 0062) — a group active/ended flip must
       never clobber a deliberate manual status. */
    const memberClients = groupMemberClients(gid).filter((c) => !c.status_overridden && statusMetaOf(c) !== targetMeta)
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
      ? groupMemberClients(g.id).filter((c) => !c.status_overridden && statusMetaOf(c) !== targetMeta)
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

  const dropClientOnGroup = (clientId, groupId) => {
    const client = clients.find((c) => c.id === clientId)
    const group = projectGroups.find((g) => g.id === groupId)
    if (!client || !group) return
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
    /* Snapshot everything this delete will touch BEFORE mutating, so one
       composite Undo can fully reverse the cascade — including the
       hard-deleted future meetings (re-inserted) which a plain Trash
       restore of the group would never bring back. */
    const memberClients = groupMemberClients(g.id)
    const memberRows = liveMembers.filter((m) => m.group_id === g.id)
    const memberRowIds = memberRows.map((m) => m.id)
    const sessionIds = choices.keepPastSessions === false
      ? sessions.filter((s) => s.group_id === g.id).map((s) => s.id) : []
    const reminderIds = choices.keepReminders === false
      ? reminders.filter((r) => r.linked_to_type === 'group' && r.linked_to_id === g.id).map((r) => r.id) : []
    const futureMeetings = choices.keepFutureMeetings === false
      ? scheduledMeetings.filter((m) => m.subject_type === 'group' && m.subject_id === g.id && m.status === 'pending') : []
    const deletedClientIds = []
    const releasedClientIds = []

    /* Forward cascade. Members: "delete clients" soft-deletes them, else
       release the group_id so they fall back to private project clients. */
    const apply = async () => {
      for (const c of memberClients) {
        if (choices.keepMembers === false) {
          /* removeClient (not updateClient) — updateClient sanitizes
             deleted_at out, so a direct patch would be a no-op. */
          await removeClient(c.id).catch(() => {})
          deletedClientIds.push(c.id)
        } else if (c.group_id === g.id) {
          await updateClient(c.id, { group_id: null }).catch(() => {})
          releasedClientIds.push(c.id)
        }
      }
      for (const mid of memberRowIds) { await removeMember(mid).catch(() => {}) }
      for (const sid of sessionIds) { await removeSession(sid).catch(() => {}) }
      for (const rid of reminderIds) { await removeReminder(rid).catch(() => {}) }
      for (const m of futureMeetings) { await removeMeeting(m.id).catch(() => {}) }
      await removeGroup(g.id)
    }

    await apply()

    const refreshAll = () => {
      refetchGroups(); refetchClients(); refetchMembers()
      refetchSessions(); refetchReminders(); refetchMeetings()
    }
    /* Meetings are hard-deleted, so undo re-inserts them (new ids); track
       those so a subsequent redo deletes the right rows. */
    let reMeetingIds = []
    pushUndo({
      label: t('detail.undo.groupDeleted'),
      undo: async () => {
        try { await restoreGroup(g.id) } catch { /* keep going */ }
        for (const id of deletedClientIds) { try { await restoreClient(id) } catch { /* keep going */ } }
        for (const id of releasedClientIds) { await updateClient(id, { group_id: g.id }).catch(() => {}) }
        for (const id of memberRowIds) { try { await restoreGroupMember(id) } catch { /* keep going */ } }
        for (const id of sessionIds) { try { await restoreSession(id) } catch { /* keep going */ } }
        for (const id of reminderIds) { try { await restoreReminder(id) } catch { /* keep going */ } }
        reMeetingIds = []
        for (const m of futureMeetings) {
          try { const r = await insertScheduledMeeting(m); reMeetingIds.push(r.id) } catch { /* keep going */ }
        }
        refreshAll()
      },
      redo: async () => {
        for (const id of releasedClientIds) { await updateClient(id, { group_id: null }).catch(() => {}) }
        for (const id of deletedClientIds) { await removeClient(id).catch(() => {}) }
        for (const id of memberRowIds) { await removeMember(id).catch(() => {}) }
        for (const id of sessionIds) { await removeSession(id).catch(() => {}) }
        for (const id of reminderIds) { await removeReminder(id).catch(() => {}) }
        const meetingTargets = reMeetingIds.length ? reMeetingIds : futureMeetings.map((m) => m.id)
        for (const id of meetingTargets) { await removeMeeting(id).catch(() => {}) }
        await removeGroup(g.id).catch(() => {})
        refreshAll()
      },
    })
  }

  /* Remove a single member from a group (the chip X) with undo. Wired
     here, not in the hook, so internal member moves and the group-delete
     cascade don't each pop their own toast. */
  const handleRemoveMember = (m) => {
    if (!m) return
    removeMember(m.id)
    pushUndo({
      label: t('detail.undo.memberRemoved'),
      undo: async () => { try { await restoreGroupMember(m.id) } finally { refetchMembers() } },
      redo: async () => { await removeMember(m.id).catch(() => {}) },
    })
  }

  /* ── render ─────────────────────────────────────────────── */

  return (
    <div className="screen pd-screen">
      {/* Top row: the at-a-glance ring locks to the right (like home), the
          title card fills the space to its left, and the expanded breakdown
          (when open) wraps full-width beneath both. */}
      <div className="pd-headrow">
        <ProjectMoonRing projectId={id} />
        <header className="pd-head">
        <button type="button" className="pd-back" onClick={() => navigate(-1)} aria-label={t('detail.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div className="pd-head-id">
          <div className="pd-h-row">
            <span className="pd-color" style={{ background: project.color || 'var(--sage)' }} />
            <p className="pd-name">{project.name}</p>
          </div>
          <p className="pd-meta">
            {activeCount} <MG text={t('detail.metaActive')} />
            {wanderingCount > 0 && ` · ${t('detail.metaWandering', { count: wanderingCount })}`}
            {' · '}{t('detail.metaGroups', { count: projectGroups.length })}
          </p>
        </div>
        <button type="button" className="pd-edit" onClick={() => setEditProjectOpen(true)} aria-label={t('detail.editAria')}>
          <Pencil size={15} strokeWidth={1.6} aria-hidden="true" />
        </button>
        </header>
      </div>

      <section className="pd-stats">
        <div className="pd-stat">
          <p className="pd-stat-v mono">{projectClients.length}</p>
          <p className="pd-stat-l">{t('detail.stats.clients')}</p>
        </div>
        <div className="pd-stat divided">
          <p className="pd-stat-v mono">{isr(monthIncome)}</p>
          <p className="pd-stat-l">{t('detail.stats.incomeMonth')}</p>
        </div>
        <div className="pd-stat">
          <p className="pd-stat-v mono">{projectGroups.length}</p>
          <p className="pd-stat-l">{t('detail.stats.groups')}</p>
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
            {t('detail.groups.title')} {projectGroups.length > 0 && <span className="pd-sec-count">{projectGroups.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.groups ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.groups && (
          <div className="pd-sec-body">
            {projectGroups.length === 0 ? (
              <p className="pd-empty">{t('detail.groups.empty', { add: t('detail.groups.add') })}</p>
            ) : (
              projectGroups.map((g) => {
                const groupMembers = liveMembers.filter((m) => m.group_id === g.id)
                const memberCount = groupMemberClients(g.id).length
                const recurring = g.recurring_day != null && g.recurring_time
                  ? `${DAYS[g.recurring_day]} ${g.recurring_time}`
                  : null
                const billingMode = g.billing_mode || 'package'
                const priceLabel = billingMode === 'per_session'
                  ? (g.price_per_session ? t('detail.groups.pricePerSession', { price: isr(g.price_per_session) }) : '')
                  : billingMode === 'none'
                    ? ''
                    : (g.package_price ? t('detail.groups.pricePackage', { price: isr(g.package_price), count: g.package_sessions || 1 }) : '')
                const status = g.status || 'active'
                const sessOpen = openGroupSessions.has(g.id)
                const groupSessions = sessions
                  .filter((s) => s.group_id === g.id)
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                return (
                  <article
                    key={g.id}
                    className={`gc${clientDnd.overZone === g.id ? ' drop-target' : ''}`}
                    {...clientDnd.dropZoneProps(g.id)}
                  >
                    <div className="gc-head">
                      <span className="gc-color" style={{ background: g.color || 'var(--stone)' }} />
                      <p className="gc-name">{g.name}</p>
                      <button type="button" className="gc-icon-btn" onClick={() => setEditGroup(g)} aria-label={t('detail.groups.editAria')}>
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
                      <span>{t('detail.groups.members', { count: memberCount })}</span>
                      {priceLabel && <><span className="gc-dot">·</span><span>{priceLabel}</span></>}
                      {recurring && <><span className="gc-dot">·</span><span>{recurring}</span></>}
                    </p>
                    <div className="gc-members">
                      {groupMembers.length === 0 ? (
                        <p className="gc-empty">{t('detail.groups.noMembers')}</p>
                      ) : (
                        groupMembers.map((m) => {
                          const c = clientById.get(m.client_id)
                          return (
                            <span key={m.id} className="gc-chip">
                              {c?.name || t('detail.groups.fallbackClient')}
                              <button type="button" className="gc-chip-x" onClick={() => handleRemoveMember(m)} aria-label={t('detail.groups.removeMemberAria', { name: c?.name || t('detail.groups.removeMemberFallback') })}>
                                <X size={11} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </span>
                          )
                        })
                      )}
                    </div>
                    <div className="gc-actions">
                      <button type="button" className="gc-btn" onClick={() => setAddMemberFor(g)}>
                        <Plus size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.groups.addMember')}
                      </button>
                      <button type="button" className="gc-btn" onClick={() => setLogSessionFor(g)}>
                        <Check size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.groups.logSession')}
                      </button>
                      <button
                        type="button"
                        className={`gc-btn ghost${sessOpen ? ' on' : ''}`}
                        onClick={() => toggleGroupSessions(g.id)}
                        title={t('detail.groups.pastSessions')}
                        aria-label={t('detail.groups.pastSessions')}
                      >
                        <CalendarPlus size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="gc-btn ghost danger"
                        onClick={() => setPendingDeleteGroup(g)}
                        title={t('detail.groups.deleteGroup')}
                        aria-label={t('detail.groups.deleteGroup')}
                      >
                        <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </div>
                    {sessOpen && (
                      <div className="gc-sessions">
                        <p className="gc-section-title">{groupSessions.length ? t('detail.groups.pastSessionsCount', { count: groupSessions.length }) : t('detail.groups.pastSessionsTitle')}</p>
                        {groupSessions.length === 0 ? (
                          <p className="gc-empty">{t('detail.groups.noSessions')}</p>
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
                                aria-label={t('detail.groups.deleteSessionAria')}
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
              {t('detail.groups.newGroup')}
            </button>
          </div>
        )}
      </section>

      {/* ── Clients section ───────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('clients')}>
          <p className="pd-sec-title">
            {t('detail.clients.title')} {projectClients.length > 0 && <span className="pd-sec-count">{projectClients.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.clients ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.clients && (
          <div className="pd-sec-body">
            {projectClients.length === 0 ? (
              <p className="pd-empty">{t('detail.clients.empty')}</p>
            ) : (
              projectClients.map((c) => {
                const g = c.group_id ? projectGroups.find((gg) => gg.id === c.group_id) : null
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={`pd-client${clientDnd.dragId === c.id ? ' dragging' : ''}`}
                    onClick={() => navigate(buildRoute(ROUTES.CLIENT, { id: c.id }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(buildRoute(ROUTES.CLIENT, { id: c.id })) } }}
                    {...clientDnd.draggableProps(c.id)}
                  >
                    <GripVertical size={16} strokeWidth={1.5} className="pd-client-grip" aria-hidden="true" />
                    <span className="pd-client-name">{c.name}</span>
                    {g ? (
                      <span className="pd-client-tag group-member">{g.name}</span>
                    ) : (
                      <span className="pd-client-tag private">{t('detail.clients.private')}</span>
                    )}
                  </div>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddClient(true)}>
              <Trans t={t} i18nKey="detail.clients.addToProject" components={{ mg: <MG word="client" /> }} />
            </button>
          </div>
        )}
      </section>

      {/* ── Tasks section ─────────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('tasks')}>
          <p className="pd-sec-title">
            {t('detail.tasks.title')}{' '}
            <span className="pd-sec-count">
              {openTaskCount}
              {projectTasks.length > openTaskCount ? ` / ${projectTasks.length}` : ''}
            </span>
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.tasks ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.tasks && (
          <div className="pd-sec-body">
            {projectTasks.length === 0 ? (
              <p className="pd-empty">{t('detail.tasks.empty')}</p>
            ) : (
              projectTasks.map((tk) => {
                const isDone = tk.status === 'done'
                return (
                  <div key={tk.id} className="pd-rem-row">
                    <div className="pd-rem-id">
                      <p className={`pd-rem-title${isDone ? ' done' : ''}`}>{tk.title}</p>
                      <p className="pd-rem-meta">
                        {t(`detail.tasks.priority.${tk.priority || 'medium'}`)}
                        {isDone && ` · ${t('detail.tasks.done')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pd-rem-btn"
                      onClick={() => toggleTask(tk)}
                      aria-label={isDone ? t('detail.tasks.reopenAria') : t('detail.tasks.completeAria')}
                      title={isDone ? t('detail.tasks.reopenAria') : t('detail.tasks.completeAria')}
                    >
                      <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="pd-rem-btn danger"
                      onClick={() => removeTask(tk.id)}
                      aria-label={t('detail.tasks.deleteAria')}
                      title={t('detail.tasks.deleteAria')}
                    >
                      <X size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddTask(true)}>
              <Plus size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.tasks.add')}
            </button>
          </div>
        )}
      </section>

      {/* ── Reminders section ─────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('reminders')}>
          <p className="pd-sec-title">
            {t('detail.reminders.title')}{' '}
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
              <p className="pd-empty">{t('detail.reminders.empty')}</p>
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
                        {isCompleted && ` · ${t('detail.reminders.done')}`}
                        {isOverdue && ` · ${t('detail.reminders.overdue')}`}
                      </p>
                    </div>
                    {!isCompleted && (
                      <button
                        type="button"
                        className="pd-rem-btn"
                        onClick={() => completeReminder(r.id)}
                        aria-label={t('detail.reminders.completeAria')}
                        title={t('detail.reminders.completeAria')}
                      >
                        <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="pd-rem-btn danger"
                      onClick={() => setPendingDeleteReminder(r)}
                      aria-label={t('detail.reminders.deleteAria')}
                      title={t('detail.reminders.deleteAria')}
                    >
                      <X size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                )
              })
            )}
            <button className="pd-add-btn" type="button" onClick={() => setShowAddReminder(true)}>
              <Bell size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.reminders.add')}
            </button>
          </div>
        )}
      </section>

      {/* ── Leads section ─────────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('leads')}>
          <p className="pd-sec-title">
            {t('detail.leads.title')} {projectLeads.length > 0 && <span className="pd-sec-count">{projectLeads.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.leads ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.leads && (
          <div className="pd-sec-body">
            {projectLeads.length === 0 ? (
              <p className="pd-empty">{t('detail.leads.empty')}</p>
            ) : (
              projectLeads.map((l) => {
                const meta = statusMetaOfLead(l)
                const sub = l.status_id ? leadStatuses.find((s) => s.id === l.status_id && !s.deleted_at) : null
                const label = sub?.display_name || metaTitle(meta)
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="pd-leadpage-row"
                    onClick={() => navigate(ROUTES.LEADS)}
                    aria-label={t('detail.leads.openAria', { name: l.name })}
                  >
                    <Sprout size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />
                    <span className="pd-leadpage-name">{l.name}</span>
                    {label && <span className="pd-leadpage-badge">{label}</span>}
                    <ChevronLeft size={15} strokeWidth={1.7} className="pd-leadpage-chev" aria-hidden="true" />
                  </button>
                )
              })
            )}
          </div>
        )}
      </section>

      {/* ── Lead pages section ────────────────────────────── */}
      <section className="pd-section">
        <button type="button" className="pd-sec-head" onClick={() => toggleSec('leadPages')}>
          <p className="pd-sec-title">
            {t('detail.leadPages.title')} {projectLeadPages.length > 0 && <span className="pd-sec-count">{projectLeadPages.length}</span>}
          </p>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.leadPages ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {openSec.leadPages && (
          <div className="pd-sec-body">
            {projectLeadPages.length === 0 ? (
              <p className="pd-empty">
                {t('detail.leadPages.empty')}{' '}
                <button type="button" className="pd-link-inline" onClick={() => navigate(ROUTES.LEAD_PAGES)}>
                  {t('detail.leadPages.create')}
                </button>
              </p>
            ) : (
              projectLeadPages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pd-leadpage-row"
                  onClick={() => navigate(ROUTES.LEAD_PAGES, { state: { editPageId: p.id } })}
                  aria-label={t('detail.leadPages.openAria', { name: p.title || t('detail.leadPages.untitled') })}
                >
                  <Link2 size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />
                  <span className="pd-leadpage-name">{p.title || t('detail.leadPages.untitled')}</span>
                  <span className={`pd-leadpage-badge${p.published ? ' live' : ''}`}>
                    {p.published ? t('detail.leadPages.live') : t('detail.leadPages.draft')}
                  </span>
                  <ChevronLeft size={15} strokeWidth={1.7} className="pd-leadpage-chev" aria-hidden="true" />
                </button>
              ))
            )}
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
        onSave={handleUpdateGroup}
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
      <AddTaskModal
        open={showAddTask}
        onClose={() => setShowAddTask(false)}
        projects={projects}
        clients={clients}
        onSave={async (payload) => addTask({ ...payload, project_id: id })}
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
        title={t('detail.deleteSession.title')}
        message={t('detail.deleteSession.message')}
        confirmLabel={t('detail.deleteSession.confirm')}
        danger
        onConfirm={() => { if (pendingDeleteSession) removeSession(pendingDeleteSession.id) }}
      />
      <ConfirmModal
        open={!!pendingDeleteReminder}
        onClose={() => setPendingDeleteReminder(null)}
        title={t('detail.deleteReminder.title')}
        message={pendingDeleteReminder ? t('detail.deleteReminder.message', { title: pendingDeleteReminder.title }) : ''}
        confirmLabel={t('detail.deleteReminder.confirm')}
        danger
        onConfirm={() => { if (pendingDeleteReminder) removeReminder(pendingDeleteReminder.id) }}
      />
      <ConfirmModal
        open={!!pendingStatusChange}
        onClose={() => setPendingStatusChange(null)}
        title={t('detail.statusChange.title')}
        message={pendingStatusChange
          ? t(pendingStatusChange.willFlip.length === 1 ? 'detail.statusChange.messageOne' : 'detail.statusChange.messageMany', {
              status: STATUS_LABEL[pendingStatusChange.newStatus],
              count: pendingStatusChange.willFlip.length,
              meta: META_LABEL[pendingStatusChange.targetMeta],
            })
          : ''}
        confirmLabel={t('detail.statusChange.confirm')}
        onConfirm={confirmGroupStatusChange}
      />

      <Modal open={!!pendingAssign} onClose={() => setPendingAssign(null)} title={t('detail.assign.title')}>
        {pendingAssign && (
          <>
            <p className="m-confirm-msg">
              <Trans
                t={t}
                i18nKey="detail.assign.message"
                values={{ name: pendingAssign.client.name, group: pendingAssign.group.name }}
                components={[<strong key="n" />]}
              />
            </p>
            <div className="m-actions">
              <button type="button" className="m-btn-cancel" onClick={() => setPendingAssign(null)}>{t('detail.assign.cancel')}</button>
              <button
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'add'); setPendingAssign(null) }}
              >
                {t('detail.assign.addBoth')}
              </button>
              <button
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'move'); setPendingAssign(null) }}
              >
                {t('detail.assign.moveHere')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

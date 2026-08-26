import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, ChevronDown, Plus, Pencil, Check, CalendarCheck, CalendarClock, Users, X, Trash2, Bell, GripVertical, Link2, ChevronLeft, Sprout, UserPlus,
} from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useSitePages } from '../../hooks/useSitePages'
import { useLeads } from '../../hooks/useLeads'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useClients } from '../../hooks/useClients'
import { useClientStatuses } from '../../hooks/useClientStatuses'
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
import { statusMetaOf, metaTitle, statusMetaOfLead, isPendingReview, financeQuery, currentMonthRange, isr, belongsToProject, scopeToProject, upcomingProjectMeetings } from '@simplicity/core'
import { staleScheduledMeetingIds } from '../../lib/scheduledMeetings'
import { buildRoute, ROUTES } from '../../lib/routes'
import LoadingSplash from '../../components/LoadingSplash'
import { restoreGroup } from '../../lib/api/groups'
import { restoreSession } from '../../lib/api/sessions'
import { restoreReminder } from '../../lib/api/reminders'
import { restoreClient } from '../../lib/api/clients'
import { restoreGroupMember } from '../../lib/api/groupMembers'
import { insertScheduledMeeting } from '../../lib/api/scheduledMeetings'
import { pushUndo } from '../../lib/undo'
import { loadOpenSections, saveOpenSections } from '../../lib/openSections'
import AddGroupModal from '../../modals/AddGroupModal'
import EditGroupModal from '../../modals/EditGroupModal'
import EditProjectModal from '../../modals/EditProjectModal'
import AddGroupMemberModal from '../../modals/AddGroupMemberModal'
import AddSessionModal from '../../modals/AddSessionModal'
import AddClientModal from '../../modals/AddClientModal'
import AddReminderModal from '../../modals/AddReminderModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddLeadModal from '../../modals/AddLeadModal'
import DeleteGroupModal from '../../modals/DeleteGroupModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import DateField from '../../components/DateField'
import DueInTag from '../../components/DueInTag'
import MG from '../../components/MG'
import ProjectQuickRow from './ProjectQuickRow'
import ProjectIncomeChart from './ProjectIncomeChart'
import ProjectMoonRing from './ProjectMoonRing'
import './ProjectDetailScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

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

/* Shared across projects on purpose: "I work out of reminders" is a habit of
   the person, not a property of one project — so one state rather than a map
   that grows with every project and has to be pruned when one is deleted.
   The storage rules live in lib/openSections.js. */
const OPEN_SEC_KEY = 'mg-open-sec:project-detail'
const DEFAULT_OPEN_SEC = {
  groups: true, clients: true, meetings: true,
  leads: false, tasks: false, reminders: false, leadPages: false,
}
const loadOpenSec = () => loadOpenSections(OPEN_SEC_KEY, DEFAULT_OPEN_SEC)

export default function ProjectDetailScreen() {
  const { t } = useT('projects')
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, updateProject, removeProject, loading: projectsLoading } = useProjects()
  /* Lead pages live on the unified page engine (site_pages, kind='lead') since
     migration 0068 — the legacy lead_pages table is only a backup. Read the live
     source so this section matches what the /pages/lead builder actually edits. */
  const { pages: sitePages, loading: pagesLoading } = useSitePages()
  const { leads: leadList, loading: leadsLoading, addLead } = useLeads()
  const { sources: leadSources } = useLeadSources()
  const { statuses: leadStatuses } = useLeadStatuses()
  const { clients, loading: clientsLoading, addClient, updateClient, removeClient, refetch: refetchClients } = useClients()
  /* The same sub-statuses the quick-add row on this very screen already offered.
     This section passed an empty list, so "לקוח/ה לפרויקט" was the one add-client
     form in the app with no status to pick. */
  const { statuses: clientStatuses } = useClientStatuses()
  const { groups, loading: groupsLoading, addGroup, updateGroup, removeGroup, refetch: refetchGroups } = useGroups()
  const { members, addMember, removeMember, refetch: refetchMembers } = useGroupMembers()
  const { sessions, addSession, updateSession, removeSession, refetch: refetchSessions } = useSessions()
  const { transactions } = useTransactions()
  const { reminders, loading: remindersLoading, addReminder, completeReminder, removeReminder, refetch: refetchReminders } = useReminders()
  const { tasks, loading: tasksLoading, addTask, toggleTask, removeTask } = useTasks()
  const { meetings: scheduledMeetings, removeMeeting, refetch: refetchMeetings, loading: meetingsLoading } = useScheduledMeetings()

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

  /* Section accordion + per-group sessions expand state.
     `meetings` opens by default alongside groups and clients: what is
     scheduled next is the thing a coach walks into a project to check, and a
     section collapsed behind a chevron would not answer that. */
  const [openSec, setOpenSec] = useState(loadOpenSec)
  const [openGroupSessions, setOpenGroupSessions] = useState(() => new Set())

  /* Modal/dialog state. */
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null)
  const [addMemberFor, setAddMemberFor] = useState(null)
  const [logSessionFor, setLogSessionFor] = useState(null)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [pendingDeleteProject, setPendingDeleteProject] = useState(false)
  const [showAddClient, setShowAddClient] = useState(false)
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddLead, setShowAddLead] = useState(false)
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
    () => (sitePages || []).filter((p) => p.kind === 'lead' && p.project_id === id && !p.deleted_at),
    [sitePages, id],
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

  /* Ids of this project's clients — the fallback half of the scoping rule. */
  const projClientIds = useMemo(() => new Set(projectClients.map((c) => c.id)), [projectClients])

  /* The same monthly/cumulative choice the projects LIST offers. The screen
     used to be locked to the current month, and the guide had to apologise for
     it in prose ("שים/י לב: תמיד מחושבת לחודש הנוכחי") — when the manual has to
     explain away a gap, the gap is the bug. Kept as local state rather than
     carried through the route: the two screens answer different questions and
     a coach who wants all-time here does not necessarily want it there. */
  const [incomeScope, setIncomeScope] = useState('monthly')

  /* Income, expenses and what is left. Expenses use the SAME scoping rule as
     income — tagged to the project, or (only when untagged) to one of its
     clients — because a project's cost and its revenue have to be counted the
     same way or the difference between them is not a number that means
     anything. The screen showed revenue alone, so "is this project worth it"
     was a question it could not answer. */
  const money = useMemo(() => {
    const range = incomeScope === 'monthly' ? currentMonthRange() : {}
    const sum = (type) => scopeToProject(
      financeQuery({ type, ...range, source: transactions }),
      id,
      projClientIds,
    ).reduce((s, t) => s + t.amount, 0)
    const income = sum('income')
    const expense = sum('expense')
    return { income, expense, net: income - expense }
  }, [incomeScope, transactions, projClientIds, id])

  /* Reminders linked to this project (any status). */
  const projectReminders = useMemo(
    () => reminders.filter((r) => r.linked_to_type === 'project' && r.linked_to_id === id),
    [reminders, id],
  )
  const activeReminders = projectReminders.filter((r) => r.status === 'pending' || r.status === 'triggered')

  /* Tasks tied to this project (any status). Open count drives the section
     badge; completed ones still list (struck through) so nothing is hidden.
     Same scoping rule as the projects-list card — a task on a client of this
     project counts here too, which is what the card has always shown and what
     this section used to miss (it read project_id alone, so a card saying
     "3 משימות" opened onto a section saying none). */
  /* Upcoming meetings for this project. A meeting binds to a SUBJECT — a
     client or a group — never to a project, so the project's meetings are the
     ones whose subject is one of its groups or one of its clients.
     `useScheduledMeetings` was already loaded on this screen and used for
     nothing but the group-delete cascade; this is the same data, shown.

     Only `pending` and only in the future: a confirmed meeting has become a
     session and a skipped one did not happen, and both belong to history, not
     to "what is coming". */
  const upcomingMeetings = useMemo(() => {
    const groupIds = new Set(projectGroups.map((g) => g.id))
    const clientIds = new Set(projectClients.map((c) => c.id))
    // eslint-disable-next-line react-hooks/purity -- "is it still in the future" is an at-render question, same as the overdue check on the reminder rows below.
    const now = Date.now()
    return upcomingProjectMeetings(scheduledMeetings, groupIds, clientIds, now)
  }, [scheduledMeetings, projectGroups, projectClients])

  /* Capped so a weekly group running for a year does not bury the sections
     below it. The overflow is STATED rather than silently dropped — a list
     that quietly stops at six reads as "that is all of them". */
  const MEETINGS_SHOWN = 6
  const meetingsOverflow = Math.max(0, upcomingMeetings.length - MEETINGS_SHOWN)

  const projectTasks = useMemo(
    () => tasks.filter((t) => !t.deleted_at && belongsToProject(t, id, projClientIds)),
    [tasks, id, projClientIds],
  )
  const openTaskCount = projectTasks.filter((t) => t.status !== 'done').length

  /* Touch+mouse drag of a project client onto a group (zone = group id).
     Declared before the early return so the hook order stays stable; the
     onDrop closure resolves dropClientOnGroup (defined below) lazily. */
  const clientDnd = usePointerDnd({ onDrop: (clientId, groupId) => dropClientOnGroup(clientId, groupId) })

  if (!project) {
    /* On a cold deep-link (pasted/bookmarked /projects/:id) useProjects() is
       still loading, so `project` is briefly undefined — show a loader instead
       of flashing "not found" and only declare it missing once the fetch is in. */
    if (projectsLoading) return <LoadingSplash transparent />
    return (
      <Box className="screen">
        <Box className="empty"><Txt as="p" className="empty-text">{t('detail.notFound')}</Txt></Box>
      </Box>
    )
  }

  const toggleSec = (k) => setOpenSec((s) => {
    const next = { ...s, [k]: !s[k] }
    saveOpenSections(OPEN_SEC_KEY, next)
    return next
  })
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
    <Box className="screen pd-screen">
      {/* Top row: the at-a-glance ring locks to the right (like home), the
          title card fills the space to its left, and the expanded breakdown
          (when open) wraps full-width beneath both. */}
      <Box className="pd-headrow">
        <ProjectMoonRing projectId={id} />
        <Box as="header" className="pd-head">
        <Btn type="button" className="pd-back" onClick={() => navigate(ROUTES.PROJECTS)} aria-label={t('detail.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Box className="pd-head-id">
          <Box className="pd-h-row">
            <Txt className="pd-color" style={{ background: project.color || 'var(--sage)' }} />
            <Txt as="p" className="pd-name">{project.name}</Txt>
          </Box>
          {/* Client status only. The group count used to end this line too,
              twenty pixels above the stats card that states it again — two
              identical numbers, and a reader checking whether they agree.
              The stats card owns the counts; this line owns the split the
              stats card cannot show (active vs paused). */}
          <Txt as="p" className="pd-meta">
            {activeCount} <MG text={t('detail.metaActive')} />
            {wanderingCount > 0 && ` · ${t('detail.metaWandering', { count: wanderingCount })}`}
          </Txt>
        </Box>
        <Btn type="button" className="pd-edit" onClick={() => setEditProjectOpen(true)} aria-label={t('detail.editAria')}>
          <Pencil size={15} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        </Box>
      </Box>

      {/* Who is in the project. The money moved to its own card below so the
          same figure never appears in two places. */}
      <Box as="section" className="pd-stats pd-stats-2">
        <Box className="pd-stat divided-end">
          <Txt as="p" className="pd-stat-v mono">{projectClients.length}</Txt>
          <Txt as="p" className="pd-stat-l">{t('detail.stats.clients')}</Txt>
        </Box>
        <Box className="pd-stat">
          <Txt as="p" className="pd-stat-v mono">{projectGroups.length}</Txt>
          <Txt as="p" className="pd-stat-l">{t('detail.stats.groups')}</Txt>
        </Box>
      </Box>

      {/* Income, expenses, and what is left — the question the screen could
          not answer before, because it showed revenue alone. The toggle scopes
          all three together; a net built from a month of income and a lifetime
          of costs would be worse than no net at all. */}
      <Box as="section" className="pd-money">
        <Box className="mg-toggle pd-money-toggle" role="tablist" aria-label={t('range.aria')}>
          <Btn
            type="button"
            role="tab"
            aria-selected={incomeScope === 'monthly'}
            className={`mg-toggle-btn${incomeScope === 'monthly' ? ' on' : ''}`}
            onClick={() => setIncomeScope('monthly')}
          >
            {t('range.monthly')}
          </Btn>
          <Btn
            type="button"
            role="tab"
            aria-selected={incomeScope === 'cumulative'}
            className={`mg-toggle-btn${incomeScope === 'cumulative' ? ' on' : ''}`}
            onClick={() => setIncomeScope('cumulative')}
          >
            {t('range.cumulative')}
          </Btn>
        </Box>
        <Box className="pd-stat">
          <Txt as="p" className="pd-stat-v mono pd-money-in">{isr(money.income)}</Txt>
          <Txt as="p" className="pd-stat-l">{t('detail.stats.income')}</Txt>
        </Box>
        <Box className="pd-stat divided">
          <Txt as="p" className="pd-stat-v mono pd-money-out">{isr(money.expense)}</Txt>
          <Txt as="p" className="pd-stat-l">{t('detail.stats.expenses')}</Txt>
        </Box>
        <Box className="pd-stat">
          <Txt as="p" className={`pd-stat-v mono${money.net < 0 ? ' pd-money-neg' : ''}`}>{isr(money.net)}</Txt>
          <Txt as="p" className="pd-stat-l">{t('detail.stats.net')}</Txt>
        </Box>
      </Box>

      {/* Quick-action row — same shape as Home's QuickRow, but every
          Add* opened from here pre-binds to the current project. */}
      <Box className="pd-quick-row-wrap">
        <ProjectQuickRow projectId={id} projectName={project.name} />
      </Box>

      {/* Monthly cumulative income chart, scoped to this project. */}
      <ProjectIncomeChart projectId={id} />

      {/* ── Groups section ────────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('groups')} aria-expanded={openSec.groups} aria-controls={openSec.groups ? 'pd-sec-groups' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.groups.title')} {projectGroups.length > 0 && <Txt className="pd-sec-count">{projectGroups.length}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.groups ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.groups && (
          <Box id="pd-sec-groups" className="pd-sec-body">
            {groupsLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectGroups.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.groups.empty', { add: t('detail.groups.add') })}</Txt>
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
                  <Box as="article"
                    key={g.id}
                    className={`gc${clientDnd.overZone === g.id ? ' drop-target' : ''}`}
                    {...clientDnd.dropZoneProps(g.id)}
                  >
                    <Box className="gc-head">
                      <Txt className="gc-color" style={{ background: g.color || 'var(--stone)' }} />
                      <Txt as="p" className="gc-name">{g.name}</Txt>
                      <Btn type="button" className="gc-icon-btn" onClick={() => setEditGroup(g)} aria-label={t('detail.groups.editAria')}>
                        <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
                      </Btn>
                    </Box>
                    <Box className="gc-status-row">
                      {GSTATUS.map((s) => (
                        <Btn
                          key={s.k}
                          type="button"
                          className={`gc-status-pill${status === s.k ? ' on' : ''}`}
                          data-status={s.k}
                          onClick={() => requestGroupStatus(g, s.k)}
                        >
                          {s.l}
                        </Btn>
                      ))}
                    </Box>
                    <Txt as="p" className="gc-meta">
                      <Txt>{t('detail.groups.members', { count: memberCount })}</Txt>
                      {priceLabel && <><Txt className="gc-dot">·</Txt><Txt>{priceLabel}</Txt></>}
                      {recurring && <><Txt className="gc-dot">·</Txt><Txt>{recurring}</Txt></>}
                    </Txt>
                    <Box className="gc-members">
                      {groupMembers.length === 0 ? (
                        <Txt as="p" className="gc-empty">{t('detail.groups.noMembers')}</Txt>
                      ) : (
                        groupMembers.map((m) => {
                          const c = clientById.get(m.client_id)
                          return (
                            <Txt key={m.id} className="gc-chip">
                              {c?.name || t('detail.groups.fallbackClient')}
                              <Btn type="button" className="gc-chip-x" onClick={() => handleRemoveMember(m)} aria-label={t('detail.groups.removeMemberAria', { name: c?.name || t('detail.groups.removeMemberFallback') })}>
                                <X size={11} strokeWidth={2} aria-hidden="true" />
                              </Btn>
                            </Txt>
                          )
                        })
                      )}
                    </Box>
                    <Box className="gc-actions">
                      <Btn type="button" className="gc-btn" onClick={() => setAddMemberFor(g)}>
                        <Plus size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.groups.addMember')}
                      </Btn>
                      <Btn type="button" className="gc-btn" onClick={() => setLogSessionFor(g)}>
                        <Check size={13} strokeWidth={1.8} aria-hidden="true" /> {t('detail.groups.logSession')}
                      </Btn>
                      <Btn
                        type="button"
                        className={`gc-btn ghost${sessOpen ? ' on' : ''}`}
                        onClick={() => toggleGroupSessions(g.id)}
                        title={t('detail.groups.pastSessions')}
                        aria-label={t('detail.groups.pastSessions')}
                      >
                        {/* Was CalendarPlus — an icon that says ADD a meeting,
                            on a control that only ever SHOWS the ones already
                            logged. */}
                        <CalendarCheck size={13} strokeWidth={1.8} aria-hidden="true" />
                      </Btn>
                      <Btn
                        type="button"
                        className="gc-btn ghost danger"
                        onClick={() => setPendingDeleteGroup(g)}
                        title={t('detail.groups.deleteGroup')}
                        aria-label={t('detail.groups.deleteGroup')}
                      >
                        <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                      </Btn>
                    </Box>
                    {sessOpen && (
                      <Box className="gc-sessions">
                        <Txt as="p" className="gc-section-title">{groupSessions.length ? t('detail.groups.pastSessionsCount', { count: groupSessions.length }) : t('detail.groups.pastSessionsTitle')}</Txt>
                        {groupSessions.length === 0 ? (
                          <Txt as="p" className="gc-empty">{t('detail.groups.noSessions')}</Txt>
                        ) : (
                          groupSessions.map((s) => (
                            <Box key={s.id} className="gc-sess-row">
                              <Txt className="gc-sess-num mono">#{s.num}</Txt>
                              <DateField
                                className="gc-sess-date"
                                value={isoDate(s.date)}
                                onChange={(e) => updateSessionDate(s, e.target.value)}
                              />
                              <Btn
                                type="button"
                                className="gc-chip-x"
                                onClick={() => setPendingDeleteSession(s)}
                                aria-label={t('detail.groups.deleteSessionAria')}
                              >
                                <Trash2 size={11} strokeWidth={2} aria-hidden="true" />
                              </Btn>
                            </Box>
                          ))
                        )}
                      </Box>
                    )}
                  </Box>
                )
              })
            )}
            <Btn className="mg-add-section" type="button" onClick={() => setShowAddGroup(true)}>
              <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('detail.groups.newGroup')}
            </Btn>
          </Box>
        )}
      </Box>

      {/* ── Clients section ───────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('clients')} aria-expanded={openSec.clients} aria-controls={openSec.clients ? 'pd-sec-clients' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.clients.title')} {projectClients.length > 0 && <Txt className="pd-sec-count">{projectClients.length}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.clients ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.clients && (
          <Box id="pd-sec-clients" className="pd-sec-body">
            {clientsLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectClients.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.clients.empty')}</Txt>
            ) : (
              projectClients.map((c) => {
                const g = c.group_id ? projectGroups.find((gg) => gg.id === c.group_id) : null
                return (
                  <Box
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={`pd-client${clientDnd.dragId === c.id ? ' dragging' : ''}`}
                    onClick={() => navigate(buildRoute(ROUTES.CLIENT, { id: c.id }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(buildRoute(ROUTES.CLIENT, { id: c.id })) } }}
                    {...clientDnd.draggableProps(c.id)}
                  >
                    <GripVertical size={16} strokeWidth={1.5} className="pd-client-grip" aria-hidden="true" />
                    <Txt className="pd-client-name">{c.name}</Txt>
                    {g ? (
                      <Txt className="pd-client-tag group-member">{g.name}</Txt>
                    ) : (
                      <Txt className="pd-client-tag private">{t('detail.clients.private')}</Txt>
                    )}
                  </Box>
                )
              })
            )}
            <Btn className="mg-add-section" type="button" onClick={() => setShowAddClient(true)}>
              <UserPlus size={16} strokeWidth={1.8} aria-hidden="true" />
              <Trans t={t} i18nKey="detail.clients.addToProject" components={{ mg: <MG word="client" /> }} />
            </Btn>
          </Box>
        )}
      </Box>

      {/* ── Upcoming meetings ─────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('meetings')} aria-expanded={openSec.meetings} aria-controls={openSec.meetings ? 'pd-sec-meetings' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.meetings.title')} {upcomingMeetings.length > 0 && <Txt className="pd-sec-count">{upcomingMeetings.length}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.meetings ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.meetings && (
          <Box id="pd-sec-meetings" className="pd-sec-body">
            {meetingsLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : upcomingMeetings.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.meetings.empty')}</Txt>
            ) : (
              <>
                {upcomingMeetings.slice(0, MEETINGS_SHOWN).map((m) => {
                  const isGroup = m.subject_type === 'group'
                  const subject = isGroup
                    ? projectGroups.find((g) => g.id === m.subject_id)
                    : clientById.get(m.subject_id)
                  return (
                    <Btn
                      key={m.id}
                      type="button"
                      className="pd-leadpage-row"
                      onClick={() => navigate(ROUTES.CALENDAR)}
                      aria-label={t('detail.meetings.openAria', {
                        name: subject?.name || t('detail.meetings.untitled'),
                        date: fmtShortDate(m.scheduled_at),
                        time: fmtTime(m.scheduled_at),
                      })}
                    >
                      {isGroup
                        ? <Users size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />
                        : <CalendarClock size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />}
                      <Txt className="pd-leadpage-name">{subject?.name || t('detail.meetings.untitled')}</Txt>
                      <Txt className="pd-meeting-when mono">
                        {fmtShortDate(m.scheduled_at)} · {fmtTime(m.scheduled_at)}
                      </Txt>
                      <DueInTag date={m.scheduled_at} />
                      <ChevronLeft size={15} strokeWidth={1.7} className="pd-leadpage-chev" aria-hidden="true" />
                    </Btn>
                  )
                })}
                {meetingsOverflow > 0 && (
                  <Txt as="p" className="pd-empty">
                    {t('detail.meetings.more', { count: meetingsOverflow })}{' '}
                    <Btn type="button" className="pd-link-inline" onClick={() => navigate(ROUTES.CALENDAR)}>
                      {t('detail.meetings.toCalendar')}
                    </Btn>
                  </Txt>
                )}
              </>
            )}
          </Box>
        )}
      </Box>

      {/* ── Tasks section ─────────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('tasks')} aria-expanded={openSec.tasks} aria-controls={openSec.tasks ? 'pd-sec-tasks' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.tasks.title')}{' '}
            {/* One number: what is still open. It used to read "2 / 5", a
                format nothing on screen explained — a reader has to guess
                whether the second number is a total, a target or a page.
                The full picture moves to the tooltip and the accessible name,
                where it can be a sentence instead of a slash. */}
            <Txt
              className="pd-sec-count"
              title={t('detail.tasks.countTitle', { open: openTaskCount, total: projectTasks.length })}
              aria-label={t('detail.tasks.countTitle', { open: openTaskCount, total: projectTasks.length })}
            >
              {openTaskCount}
            </Txt>
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.tasks ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.tasks && (
          <Box id="pd-sec-tasks" className="pd-sec-body">
            {tasksLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectTasks.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.tasks.empty')}</Txt>
            ) : (
              projectTasks.map((tk) => {
                const isDone = tk.status === 'done'
                /* A task can sit here because it was tagged to the project, or
                   because it belongs to one of its clients. Name the client on
                   the second kind — without it those rows read as tasks the
                   coach never filed against this project. */
                const viaClient = !tk.project_id && tk.client_id ? clientById.get(tk.client_id) : null
                return (
                  <Box key={tk.id} className="pd-rem-row">
                    <Box className="pd-rem-id">
                      <Txt as="p" className={`pd-rem-title${isDone ? ' done' : ''}`}>{tk.title}</Txt>
                      <Txt as="p" className="pd-rem-meta">
                        {t(`detail.tasks.priority.${tk.priority || 'medium'}`)}
                        {viaClient && ` · ${viaClient.name}`}
                        {isDone && ` · ${t('detail.tasks.done')}`}
                      </Txt>
                    </Box>
                    <Btn
                      type="button"
                      className="pd-rem-btn"
                      onClick={() => toggleTask(tk)}
                      aria-label={isDone ? t('detail.tasks.reopenAria') : t('detail.tasks.completeAria')}
                      title={isDone ? t('detail.tasks.reopenAria') : t('detail.tasks.completeAria')}
                    >
                      <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                    </Btn>
                    <Btn
                      type="button"
                      className="pd-rem-btn danger"
                      onClick={() => removeTask(tk.id)}
                      aria-label={t('detail.tasks.deleteAria')}
                      title={t('detail.tasks.deleteAria')}
                    >
                      <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                    </Btn>
                  </Box>
                )
              })
            )}
            <Btn className="mg-add-section" type="button" onClick={() => setShowAddTask(true)}>
              <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('detail.tasks.add')}
            </Btn>
          </Box>
        )}
      </Box>

      {/* ── Reminders section ─────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('reminders')} aria-expanded={openSec.reminders} aria-controls={openSec.reminders ? 'pd-sec-reminders' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.reminders.title')}{' '}
            <Txt
              className="pd-sec-count"
              title={t('detail.reminders.countTitle', { open: activeReminders.length, total: projectReminders.length })}
              aria-label={t('detail.reminders.countTitle', { open: activeReminders.length, total: projectReminders.length })}
            >
              {activeReminders.length}
            </Txt>
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.reminders ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.reminders && (
          <Box id="pd-sec-reminders" className="pd-sec-body">
            {remindersLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectReminders.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.reminders.empty')}</Txt>
            ) : (
              projectReminders.map((r) => {
                const isCompleted = r.status === 'completed'
                // eslint-disable-next-line react-hooks/purity -- Date.now() for an at-render overdue check is acceptable here.
                const isOverdue = r.status === 'pending' && new Date(r.scheduled_at).getTime() < Date.now()
                return (
                  <Box key={r.id} className="pd-rem-row">
                    <Box className="pd-rem-id">
                      <Txt as="p" className={`pd-rem-title${isCompleted ? ' done' : ''}`}>{r.title}</Txt>
                      <Txt as="p" className="pd-rem-meta">
                        {fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}
                        {isCompleted && ` · ${t('detail.reminders.done')}`}
                        {isOverdue && ` · ${t('detail.reminders.overdue')}`}
                        {/* Same bare date as the client drawer, same need to
                            say how soon. Overdue and done both fall outside
                            the tag's window anyway — it only speaks 2–7 days
                            ahead — so the three labels can never collide. */}
                        {!isCompleted && <DueInTag date={r.scheduled_at} className="is-inline" />}
                      </Txt>
                    </Box>
                    {!isCompleted && (
                      <Btn
                        type="button"
                        className="pd-rem-btn"
                        onClick={() => completeReminder(r.id)}
                        aria-label={t('detail.reminders.completeAria')}
                        title={t('detail.reminders.completeAria')}
                      >
                        <Check size={13} strokeWidth={1.8} aria-hidden="true" />
                      </Btn>
                    )}
                    <Btn
                      type="button"
                      className="pd-rem-btn danger"
                      onClick={() => setPendingDeleteReminder(r)}
                      aria-label={t('detail.reminders.deleteAria')}
                      title={t('detail.reminders.deleteAria')}
                    >
                      <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                    </Btn>
                  </Box>
                )
              })
            )}
            <Btn className="mg-add-section" type="button" onClick={() => setShowAddReminder(true)}>
              <Bell size={16} strokeWidth={1.8} aria-hidden="true" /> {t('detail.reminders.add')}
            </Btn>
          </Box>
        )}
      </Box>

      {/* ── Leads section ─────────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('leads')} aria-expanded={openSec.leads} aria-controls={openSec.leads ? 'pd-sec-leads' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.leads.title')} {projectLeads.length > 0 && <Txt className="pd-sec-count">{projectLeads.length}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.leads ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.leads && (
          <Box id="pd-sec-leads" className="pd-sec-body">
            {leadsLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectLeads.length === 0 ? (
              <Txt as="p" className="pd-empty">{t('detail.leads.empty')}</Txt>
            ) : (
              projectLeads.map((l) => {
                const meta = statusMetaOfLead(l)
                const sub = l.status_id ? leadStatuses.find((s) => s.id === l.status_id && !s.deleted_at) : null
                const label = sub?.display_name || metaTitle(meta)
                return (
                  <Btn
                    key={l.id}
                    type="button"
                    className="pd-leadpage-row"
                    /* Lands ON this lead, not on the board. The row shows a
                       name and reads as a link to it; sending the user to a
                       full kanban to find that name again by eye was the
                       opposite of what it promised. Same nav-state shape the
                       lead-pages row below already uses. */
                    onClick={() => navigate(ROUTES.LEADS, { state: { openLeadId: l.id } })}
                    aria-label={t('detail.leads.openAria', { name: l.name })}
                  >
                    <Sprout size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />
                    <Txt className="pd-leadpage-name">{l.name}</Txt>
                    {label && <Txt className="pd-leadpage-badge">{label}</Txt>}
                    <ChevronLeft size={15} strokeWidth={1.7} className="pd-leadpage-chev" aria-hidden="true" />
                  </Btn>
                )
              })
            )}
            {/* The one section that listed things without offering to add one.
                Seeds the project, like every other adder on this screen. */}
            <Btn className="mg-add-section" type="button" onClick={() => setShowAddLead(true)}>
              <Sprout size={16} strokeWidth={1.8} aria-hidden="true" /> {t('detail.leads.add')}
            </Btn>
          </Box>
        )}
      </Box>

      {/* ── Lead pages section ────────────────────────────── */}
      <Box as="section" className="pd-section">
        <Btn type="button" className="pd-sec-head" onClick={() => toggleSec('leadPages')} aria-expanded={openSec.leadPages} aria-controls={openSec.leadPages ? 'pd-sec-leadPages' : undefined}>
          <Txt as="p" className="pd-sec-title">
            {t('detail.leadPages.title')} {projectLeadPages.length > 0 && <Txt className="pd-sec-count">{projectLeadPages.length}</Txt>}
          </Txt>
          <ChevronDown size={16} strokeWidth={1.6} className={`pd-sec-chev${openSec.leadPages ? ' open' : ''}`} aria-hidden="true" />
        </Btn>
        {openSec.leadPages && (
          <Box id="pd-sec-leadPages" className="pd-sec-body">
            {pagesLoading ? (
              <Txt as="p" className="pd-empty">{t('detail.sectionLoading')}</Txt>
            ) : projectLeadPages.length === 0 ? (
              <Txt as="p" className="pd-empty">
                {t('detail.leadPages.empty')}{' '}
                <Btn type="button" className="pd-link-inline" onClick={() => navigate(buildRoute(ROUTES.SITE_PAGE_KIND, { kind: 'lead' }))}>
                  {t('detail.leadPages.create')}
                </Btn>
              </Txt>
            ) : (
              projectLeadPages.map((p) => (
                <Btn
                  key={p.id}
                  type="button"
                  className="pd-leadpage-row"
                  onClick={() => navigate(buildRoute(ROUTES.SITE_PAGE_KIND, { kind: 'lead' }), { state: { editPageId: p.id } })}
                  aria-label={t('detail.leadPages.openAria', { name: p.title || t('detail.leadPages.untitled') })}
                >
                  <Link2 size={15} strokeWidth={1.7} className="pd-leadpage-icon" aria-hidden="true" />
                  <Txt className="pd-leadpage-name">{p.title || t('detail.leadPages.untitled')}</Txt>
                  <Txt className={`pd-leadpage-badge${p.published ? ' live' : ''}`}>
                    {p.published ? t('detail.leadPages.live') : t('detail.leadPages.draft')}
                  </Txt>
                  <ChevronLeft size={15} strokeWidth={1.7} className="pd-leadpage-chev" aria-hidden="true" />
                </Btn>
              ))
            )}
          </Box>
        )}
      </Box>

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
        onDelete={() => { setEditProjectOpen(false); setPendingDeleteProject(true) }}
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
      {/* The project is SEEDED, not forced: the form shows its project picker
          pre-set to this one and saves whatever the user leaves there. It used
          to spread the payload and overwrite project_id afterwards, so picking
          a different project in a visible field did nothing, silently. */}
      <AddClientModal
        key={`add-client-${id}`}
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        projects={projects}
        statuses={clientStatuses}
        initialProject={id}
        onSave={addClient}
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
        initialProject={id}
        onSave={addTask}
      />
      <AddLeadModal
        open={showAddLead}
        onClose={() => setShowAddLead(false)}
        sources={leadSources}
        statuses={leadStatuses}
        projects={projects}
        groups={groups}
        initialProject={id}
        onSave={addLead}
      />
      <DeleteGroupModal
        key={pendingDeleteGroup?.id}
        open={!!pendingDeleteGroup}
        onClose={() => setPendingDeleteGroup(null)}
        group={pendingDeleteGroup}
        counts={pendingDeleteGroup ? deleteGroupCounts(pendingDeleteGroup) : null}
        onConfirm={(choices) => { if (pendingDeleteGroup) runDeleteGroup(pendingDeleteGroup, choices) }}
      />
      {/* Deleting the project we are standing in. Same wording and the same
          undo toast as the list card's delete (useProjects registers it), but
          the screen has to leave afterwards — the route it lives on no longer
          resolves, and staying would fall through to "הפרויקט לא נמצא". */}
      <ConfirmModal
        open={pendingDeleteProject}
        onClose={() => setPendingDeleteProject(false)}
        title={t('delete.title')}
        message={t('delete.message', { name: project.name })}
        confirmLabel={t('delete.confirm')}
        danger
        onConfirm={async () => { await removeProject(project.id); navigate(ROUTES.PROJECTS) }}
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
      {/* The message was a hand-rolled plural (`length === 1 ? messageOne :
          messageMany`), which can only ever know two forms — so Hebrew's DUAL
          fell through to the plural and two clients read "2 לקוחות" instead of
          "שני לקוחות". i18next picks the form from `count` now, and the locale
          files carry all four categories Hebrew needs. */}
      <ConfirmModal
        open={!!pendingStatusChange}
        onClose={() => setPendingStatusChange(null)}
        title={t('detail.statusChange.title')}
        message={pendingStatusChange
          ? t('detail.statusChange.message', {
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
            <Txt as="p" className="m-confirm-msg">
              <Trans
                t={t}
                i18nKey="detail.assign.message"
                values={{ name: pendingAssign.client.name, group: pendingAssign.group.name }}
                components={[<strong key="n" />]}
              />
            </Txt>
            <Box className="m-actions">
              <Btn type="button" className="m-btn-cancel" onClick={() => setPendingAssign(null)}>{t('detail.assign.cancel')}</Btn>
              <Btn
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'add'); setPendingAssign(null) }}
              >
                {t('detail.assign.addBoth')}
              </Btn>
              <Btn
                type="button"
                className="m-btn-save"
                onClick={() => { assignToGroup(pendingAssign.client, pendingAssign.group, 'move'); setPendingAssign(null) }}
              >
                {t('detail.assign.moveHere')}
              </Btn>
            </Box>
          </>
        )}
      </Modal>
    </Box>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'
import { staleScheduledMeetingIds } from '../lib/scheduledMeetings'

// Everything one project's detail screen needs: the project + its clients,
// groups, group members, sessions and transactions — plus the reminders and
// scheduled meetings a group can own, which deleting a group has to account for.
const EMPTY = { project: null, clients: [], transactions: [], sessions: [], groups: [], members: [], reminders: [], meetings: [] }

// Paginated so per-project lifetime income doesn't under-count past the row cap.
async function fetchTable(name, filterDeleted = true) {
  const { data, error } = await selectAll(() => {
    let q = supabase.from(name).select('*')
    if (filterDeleted) q = q.is('deleted_at', null)
    return q
  })
  if (error) throw error
  return data ?? []
}

// Columns the database owns — stripped before re-inserting a deleted meeting.
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at']

export function useProjectDetailData(projectId) {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const [projects, clients, transactions, sessions, groups, members, reminders, meetings] = await Promise.all([
        fetchTable('projects'), fetchTable('clients'), fetchTable('transactions'),
        fetchTable('sessions'), fetchTable('groups'), fetchTable('group_members'),
        fetchTable('reminders'), fetchTable('scheduled_meetings', false),
      ])
      const groupIds = new Set(groups.filter((g) => g.project_id === projectId).map((g) => g.id))
      setState({
        project: projects.find((p) => p.id === projectId) || null,
        clients: clients.filter((c) => c.project_id === projectId),
        transactions,
        sessions,
        groups: groups.filter((g) => g.project_id === projectId),
        members,
        reminders: reminders.filter((r) => r.linked_to_type === 'group' && groupIds.has(r.linked_to_id)),
        meetings: meetings.filter((m) => m.subject_type === 'group' && groupIds.has(m.subject_id)),
      })
    } catch (e) {
      if (!silent) setError(e?.message || 'load failed')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const insertRow = useCallback(async (table, payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from(table).insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    return data
  }, [])
  const stamp = useCallback(async (table, id, deleted_at) => {
    const { error: e } = await supabase.from(table).update({ deleted_at }).eq('id', id)
    if (e) throw e
  }, [])

  const updateProject = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, project: s.project ? { ...s.project, ...patch } : s.project }))
    const { error: e } = await supabase.from('projects').update(patch).eq('id', id)
    if (e) { load() }
  }, [load])

  const removeProject = useCallback(async (id) => {
    const { error: e } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) throw e
  }, [])

  const addGroup = useCallback(async (payload) => {
    const data = await insertRow('groups', payload)
    setState((s) => ({ ...s, groups: [...s.groups, data] }))
    return data
  }, [insertRow])

  /* When a group's weekly slot changes or is cleared, the future pending
     meetings generated for the OLD slot are dropped, so stale occurrences don't
     linger on the calendar (web handleUpdateGroup). Throws, so the edit form
     can keep itself open on a failed save. */
  const updateGroup = useCallback(async (id, patch) => {
    const prev = stateRef.current.groups.find((g) => g.id === id)
    setState((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
    const { error: e } = await supabase.from('groups').update(patch).eq('id', id)
    if (e) { load(true); throw e }
    if (prev && ('recurring_day' in patch || 'recurring_time' in patch)) {
      const stale = staleScheduledMeetingIds(
        'group', id,
        { day: prev.recurring_day, time: prev.recurring_time },
        { day: patch.recurring_day, time: patch.recurring_time },
        stateRef.current.meetings,
      )
      for (const mid of stale) {
        try { await supabase.from('scheduled_meetings').delete().eq('id', mid) } catch { /* non-fatal */ }
      }
      if (stale.length) setState((s) => ({ ...s, meetings: s.meetings.filter((m) => !stale.includes(m.id)) }))
    }
  }, [load])

  const removeGroup = useCallback(async (id) => {
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }))
    try { await stamp('groups', id, new Date().toISOString()) } catch (e) { load(true); throw e }
  }, [stamp, load])
  const restoreGroup = useCallback((id) => stamp('groups', id, null), [stamp])

  const addMember = useCallback(async (payload) => {
    const data = await insertRow('group_members', payload)
    setState((s) => ({ ...s, members: [...s.members, data] }))
    return data
  }, [insertRow])

  const removeMember = useCallback(async (id) => {
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }))
    // Soft-delete via deleted_at (matches web removeGroupMember): the fetch filters
    // deleted_at, so removal sticks, is restorable from Trash, and re-adding the
    // same client doesn't create a duplicate row (left_at left the row "live").
    try { await stamp('group_members', id, new Date().toISOString()) } catch { load(true) }
  }, [stamp, load])
  const restoreMember = useCallback(async (id) => { await stamp('group_members', id, null); load(true) }, [stamp, load])

  // A member's own quota and dues (a renewed card). Optimistic; throws.
  const updateMember = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
    const { error: e } = await supabase.from('group_members').update(patch).eq('id', id)
    if (e) { load(true); throw e }
  }, [load])

  // Log a session (materialise a held meeting) — used by the group "log session"
  // action; the caller composes the full row (subject_type/group_id/num).
  const addSession = useCallback(async (payload) => {
    const data = await insertRow('sessions', payload)
    setState((s) => ({ ...s, sessions: [data, ...s.sessions] }))
    return data
  }, [insertRow])

  // Patch a client — used by the group-status cascade (a group active/ended flip
  // propagates the member clients' status). Optimistic; reload on error.
  const updateClient = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    const { error: e } = await supabase.from('clients').update(patch).eq('id', id)
    if (e) { load(true) }
  }, [load])
  const removeClient = useCallback(async (id) => {
    setState((s) => ({ ...s, clients: s.clients.filter((c) => c.id !== id) }))
    await stamp('clients', id, new Date().toISOString())
  }, [stamp])
  const restoreClient = useCallback((id) => stamp('clients', id, null), [stamp])

  // Edit / delete a logged session (date fix, mis-log removal). Optimistic.
  const updateSession = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
    const { error: e } = await supabase.from('sessions').update(patch).eq('id', id)
    if (e) { load(true) }
  }, [load])
  const removeSession = useCallback(async (id) => {
    setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }))
    try { await stamp('sessions', id, new Date().toISOString()) } catch { load(true) }
  }, [stamp, load])
  const restoreSession = useCallback((id) => stamp('sessions', id, null), [stamp])

  const removeReminder = useCallback((id) => stamp('reminders', id, new Date().toISOString()), [stamp])
  const restoreReminder = useCallback((id) => stamp('reminders', id, null), [stamp])

  // scheduled_meetings has no deleted_at: delete is hard, and undo re-inserts.
  const removeMeeting = useCallback(async (id) => {
    const { error: e } = await supabase.from('scheduled_meetings').delete().eq('id', id)
    if (e) throw e
  }, [])
  const insertMeeting = useCallback((meeting) => {
    const row = { ...meeting }
    SERVER_OWNED.forEach((k) => delete row[k])
    return insertRow('scheduled_meetings', row)
  }, [insertRow])

  return {
    ...state, loading, error, refetch: load,
    updateProject, removeProject,
    addGroup, updateGroup, removeGroup, restoreGroup,
    addMember, removeMember, restoreMember, updateMember,
    addSession, updateSession, removeSession, restoreSession,
    updateClient, removeClient, restoreClient,
    removeReminder, restoreReminder, removeMeeting, insertMeeting,
  }
}

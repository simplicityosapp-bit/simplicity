import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'

// Everything one project's detail screen needs: the project + its clients,
// groups, group members, sessions and transactions. CRUD is limited to the
// project itself (group management stays on desktop for now).
const EMPTY = { project: null, clients: [], transactions: [], sessions: [], groups: [], members: [] }

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

export function useProjectDetailData(projectId) {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projects, clients, transactions, sessions, groups, members] = await Promise.all([
        fetchTable('projects'), fetchTable('clients'), fetchTable('transactions'),
        fetchTable('sessions'), fetchTable('groups'), fetchTable('group_members'),
      ])
      setState({
        project: projects.find((p) => p.id === projectId) || null,
        clients: clients.filter((c) => c.project_id === projectId),
        transactions,
        sessions,
        groups: groups.filter((g) => g.project_id === projectId),
        members,
      })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('groups').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, groups: [...s.groups, data] }))
    return data
  }, [])

  const updateGroup = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
    const { error: e } = await supabase.from('groups').update(patch).eq('id', id)
    if (e) { load() }
  }, [load])

  const removeGroup = useCallback(async (id) => {
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }))
    const { error: e } = await supabase.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load() }
  }, [load])

  const addMember = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('group_members').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, members: [...s.members, data] }))
    return data
  }, [])

  const removeMember = useCallback(async (id) => {
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }))
    // Soft-delete via deleted_at (matches web removeGroupMember): the fetch filters
    // deleted_at, so removal sticks, is restorable from Trash, and re-adding the
    // same client doesn't create a duplicate row (left_at left the row "live").
    const { error: e } = await supabase.from('group_members').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load() }
  }, [load])

  // Log a session (materialise a held meeting) — used by the group "log session"
  // action; the caller composes the full row (subject_type/group_id/num).
  const addSession = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('sessions').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, sessions: [data, ...s.sessions] }))
    return data
  }, [])

  // Patch a client — used by the group-status cascade (a group active/ended flip
  // propagates the member clients' status). Optimistic; reload on error.
  const updateClient = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    const { error: e } = await supabase.from('clients').update(patch).eq('id', id)
    if (e) { load() }
  }, [load])

  // Edit / delete a logged session (date fix, mis-log removal). Optimistic.
  const updateSession = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
    const { error: e } = await supabase.from('sessions').update(patch).eq('id', id)
    if (e) { load() }
  }, [load])
  const removeSession = useCallback(async (id) => {
    setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }))
    const { error: e } = await supabase.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load() }
  }, [load])

  return { ...state, loading, error, refetch: load, updateProject, removeProject, addGroup, updateGroup, removeGroup, addMember, removeMember, addSession, updateClient, updateSession, removeSession }
}

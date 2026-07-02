import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Minimal data layer for the home screen. RLS scopes every row to the signed-in
// user, so a plain select is safe. We only read columns the home derivations
// need — none of them are encrypted-at-rest.
// NOTE: single select (Supabase's 1000-row default → we ask for 2000). Fine for
// typical coach volumes; a proper paginated fetch (like web's selectAllRows) is
// a follow-up.
// `scheduled_meetings` has no deleted_at column, so it's fetched unfiltered —
// core's todayItems still applies live()/inline deleted filtering client-side.
async function fetchTable(name, { filterDeleted = true } = {}) {
  let q = supabase.from(name).select('*').limit(2000)
  if (filterDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

const EMPTY = {
  clients: [], transactions: [], meetings: [], calendarEvents: [], leads: [], groups: [],
  tasks: [], goals: [], categories: [], sessions: [], members: [],
}

export function useHomeData() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [clients, transactions, meetings, calendarEvents, leads, groups, tasks, goals, categories, sessions, members] = await Promise.all([
        fetchTable('clients'),
        fetchTable('transactions'),
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('leads'),
        fetchTable('groups'),
        fetchTable('tasks'),
        fetchTable('goals'),
        fetchTable('categories'),
        fetchTable('sessions'),
        fetchTable('group_members'),
      ])
      setData({ clients, transactions, meetings, calendarEvents, leads, groups, tasks, goals, categories, sessions, members })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...data, loading, error, refetch: load }
}

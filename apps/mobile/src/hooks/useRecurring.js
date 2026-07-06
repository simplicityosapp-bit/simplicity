import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Recurring transaction templates for the finance screen (add / update / soft-
// delete / toggle-active). RLS scopes rows to the user. NOTE: the background
// generation engine (creating pending txs for due dates) is a later increment —
// this manages the templates; the web app generates rows when it's open.
export function useRecurring() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('recurring_templates').select('*').is('deleted_at', null).limit(2000)
      setTemplates(data ?? [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addRecurring = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('recurring_templates').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setTemplates((prev) => [data, ...prev])
    return data
  }, [])

  const updateRecurring = useCallback(async (id, patch) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    const { data, error: e } = await supabase.from('recurring_templates').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)))
    return data
  }, [load])

  const removeRecurring = useCallback(async (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    const { error: e } = await supabase.from('recurring_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { templates, loading, refetch: load, addRecurring, updateRecurring, removeRecurring }
}

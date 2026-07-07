import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

// Personal quotes pool (user_quotes, migration 0013) — mirrors web useUserQuotes:
// list newest-first, add, soft-delete. Feeds the QuoteSourceModal.
export function useUserQuotes() {
  const [userQuotes, setUserQuotes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('user_quotes').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setUserQuotes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addUserQuote = useCallback(async (input) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...input }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    const { data, error } = await supabase.from('user_quotes').insert(row).select().single()
    if (error) throw error
    setUserQuotes((prev) => [data, ...prev])
    return data
  }, [])

  const removeUserQuote = useCallback(async (id) => {
    setUserQuotes((prev) => prev.filter((q) => q.id !== id))
    const { error } = await supabase.from('user_quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) load()
  }, [load])

  return { userQuotes, loading, addUserQuote, removeUserQuote, refetch: load }
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

// Shared lookup data for the add/edit sheets (clients, projects, categories,
// and the small config tables). Fetched ONCE for the whole authed app and read
// via useFormOptions(), so modals don't thread these through every screen. RLS
// scopes every row to the user; all these tables carry deleted_at.
const TABLES = {
  clients: 'clients',
  projects: 'projects',
  categories: 'categories',
  groups: 'groups',
  clientStatuses: 'client_statuses',
  leadSources: 'lead_sources',
  leadStatuses: 'lead_statuses',
  meetingTypes: 'meeting_types',
  taskStatuses: 'task_statuses',
  userQuestions: 'user_questions',
}
const KEYS = Object.keys(TABLES)
const EMPTY = Object.fromEntries(KEYS.map((k) => [k, []]))

const FormOptionsContext = createContext({ ...EMPTY, refetch: () => {} })

export function FormOptionsProvider({ children }) {
  const [data, setData] = useState(EMPTY)

  const load = useCallback(async () => {
    try {
      const results = await Promise.all(
        KEYS.map((k) => supabase.from(TABLES[k]).select('*').is('deleted_at', null).limit(2000)),
      )
      const next = {}
      KEYS.forEach((k, i) => { next[k] = results[i].data ?? [] })
      setData(next)
    } catch {
      /* leave empties — selects fall back to just "none" */
    }
  }, [])

  useEffect(() => { load() }, [load])

  return <FormOptionsContext.Provider value={{ ...data, refetch: load }}>{children}</FormOptionsContext.Provider>
}

export const useFormOptions = () => useContext(FormOptionsContext)

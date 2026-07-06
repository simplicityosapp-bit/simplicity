import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useFormOptions } from '../lib/formOptions'

// Manage the app config taxonomies from Settings: client statuses (sub-statuses
// under a meta), lead sources, and meeting types. Reads the lists from
// FormOptions and adds/soft-deletes rows, refreshing FormOptions after each.
// Deleting a status/source/type leaves any linked row falling back to its meta /
// "none" (no cascade reassignment in this v1). RLS scopes rows to the user.
export function useConfigTaxonomy() {
  const { clientStatuses, leadSources, meetingTypes, refetch } = useFormOptions()

  const insertRow = useCallback(async (table, payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { error } = await supabase.from(table).insert({ ...payload, user_id: session.user.id })
    if (error) throw error
    await refetch()
  }, [refetch])

  const softDelete = useCallback(async (table, id) => {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await refetch()
  }, [refetch])

  return {
    clientStatuses: clientStatuses || [],
    leadSources: leadSources || [],
    meetingTypes: meetingTypes || [],
    addClientStatus: useCallback((display_name, meta_category) => insertRow('client_statuses', { display_name, meta_category }), [insertRow]),
    removeClientStatus: useCallback((id) => softDelete('client_statuses', id), [softDelete]),
    addLeadSource: useCallback((name) => insertRow('lead_sources', { name }), [insertRow]),
    removeLeadSource: useCallback((id) => softDelete('lead_sources', id), [softDelete]),
    addMeetingType: useCallback((name, default_price) => insertRow('meeting_types', { name, default_price: default_price || null }), [insertRow]),
    removeMeetingType: useCallback((id) => softDelete('meeting_types', id), [softDelete]),
  }
}

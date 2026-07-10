import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useFormOptions } from '../lib/formOptions'

// Manage the app config taxonomies from Settings: client statuses (sub-statuses
// under a meta), lead sources, and meeting types. Reads the lists from
// FormOptions and adds/soft-deletes rows, refreshing FormOptions after each.
// Deleting a status/source/type leaves any linked row falling back to its meta /
// "none" (no cascade reassignment in this v1). RLS scopes rows to the user.
export function useConfigTaxonomy() {
  const { clientStatuses, leadSources, leadStatuses, meetingTypes, refetch } = useFormOptions()

  const insertRow = useCallback(async (table, payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error } = await supabase.from(table).insert({ ...payload, user_id: session.user.id }).select().single()
    if (error) throw error
    await refetch()
    return data
  }, [refetch])

  const softDelete = useCallback(async (table, id) => {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await refetch()
  }, [refetch])

  const updateRow = useCallback(async (table, id, patch) => {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) throw error
    await refetch()
  }, [refetch])

  return {
    clientStatuses: clientStatuses || [],
    leadSources: leadSources || [],
    leadStatuses: leadStatuses || [],
    meetingTypes: meetingTypes || [],
    addClientStatus: useCallback((display_name, meta_category) => insertRow('client_statuses', { display_name, meta_category }), [insertRow]),
    removeClientStatus: useCallback((id) => softDelete('client_statuses', id), [softDelete]),
    addLeadStatus: useCallback((display_name, meta_category) => insertRow('lead_statuses', { display_name, meta_category, is_default: false }), [insertRow]),
    removeLeadStatus: useCallback((id) => softDelete('lead_statuses', id), [softDelete]),
    updateLeadStatus: useCallback((id, patch) => updateRow('lead_statuses', id, patch), [updateRow]),
    addLeadSource: useCallback((name) => insertRow('lead_sources', { name }), [insertRow]),
    removeLeadSource: useCallback((id) => softDelete('lead_sources', id), [softDelete]),
    addMeetingType: useCallback((name, default_price) => insertRow('meeting_types', { name, default_price: default_price || null }), [insertRow]),
    updateMeetingType: useCallback(async (id, name, default_price) => {
      const price = default_price || null
      const { error } = await supabase.from('meeting_types').update({ name, default_price: price }).eq('id', id)
      if (error) throw error
      // Live price propagation (mirrors web applyMeetingTypePrice): push the new
      // price to every linked client that hasn't manually overridden it. A null
      // price ("no preset" type) never clobbers client prices. Clients/Home
      // screens reflect it on their next focus-refetch.
      if (price != null) {
        const { error: cErr } = await supabase.from('clients')
          .update({ price_per_session: Number(price) })
          .eq('meeting_type_id', id).eq('price_overridden', false).is('deleted_at', null)
        if (cErr) throw cErr
      }
      await refetch()
    }, [refetch]),
    removeMeetingType: useCallback((id) => softDelete('meeting_types', id), [softDelete]),
  }
}

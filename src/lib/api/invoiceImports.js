import { supabase } from '../supabase'

/* Pending Route-B imports the user hasn't acted on yet. Client-readable own
   rows (RLS); the webhook stages them and the `invoices` function approves /
   dismisses (service role). */
export async function listPendingInvoiceImports() {
  const { data, error } = await supabase
    .from('pending_invoice_imports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

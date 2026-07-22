/* ════════════════════════════════════════════════════════════════
   SESSIONS API — logged (past) sessions, RLS-scoped to the user.
   ════════════════════════════════════════════════════════════════
   Client-only for now (groups aren't migrated). subject_type/subject_id
   mirror client_id, consistent with scheduled_meetings.

   `notes` + `summary` are stored as PLAINTEXT at rest — field encryption was
   removed 2026-06 (see docs/security-review-2026-06.md). encryptRow() below is
   a no-op (ENCRYPTED_FIELDS is empty); decryptRow()/decryptRows() are retained
   only to transparently read legacy "ENC:" ciphertext via LEGACY_DECRYPT_FIELDS
   until the one-time backfill rewrites it. Nothing is encrypted on write.
   At rest these rows are protected by RLS alone (plus HTTPS/TLS in transit).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { encryptRow, decryptRow, decryptRows } from '../fieldCrypto'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listSessions() {
  const rows = await selectAllRows(() => supabase
    .from('sessions')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false }))
  return decryptRows('sessions', rows)
}

export async function insertSession(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('sessions').insert(await encryptRow('sessions', row)).select().single()
  if (error) throw error
  return decryptRow('sessions', data)
}

export async function updateSession(id, patch) {
  const { data, error } = await supabase.from('sessions').update(await encryptRow('sessions', sanitize(patch))).eq('id', id).select().single()
  if (error) throw error
  return decryptRow('sessions', data)
}

export async function removeSession(id) {
  const { error } = await supabase.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedSessions() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const rows = await selectAllRows(() => supabase
    .from('sessions')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
  return decryptRows('sessions', rows)
}

export async function restoreSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return decryptRow('sessions', data)
}

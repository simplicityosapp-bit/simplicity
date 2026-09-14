// Destructive account operations. resetAllUserData() wipes every user-owned row
// (soft-delete where possible, hard-delete for logs). Account DELETION is
// grace-period based: the client only RECORDS the request in prefs.accountDeletion
// (the auth user is removed by a scheduled edge function — needs the service
// role); meanwhile the app gates to a "pending deletion" screen and the user may
// cancel.
//
// The reset runs the same steps, in the same order, over the same tables as web
// lib/api/account.js — the lists and the order live in core (domain/account.ts).
// This file used to carry its own copy of the lists. It stopped at 23 tables while
// web's grew to 30, and it never had web's disconnect or unpublish steps, so a
// reset from the phone left public pages online and still taking submissions,
// and Google Calendar and the invoice provider still connected.
import {
  ACCOUNT_RESET_SOFT_DELETE_TABLES, ACCOUNT_RESET_HARD_DELETE_TABLES,
  ACCOUNT_RESET_UNPUBLISH_TABLES, ACCOUNT_RESET_DISCONNECTS,
} from '@simplicity/core'
import { supabase } from './supabase'

// RLS scopes every statement to the signed-in user; PostgREST refuses an
// unfiltered update/delete, so pass a tautology on the always-present id column.
const ALL_ROWS = (q) => q.not('id', 'is', null)

// The same server-side actions web calls. A function can refuse either as
// `error` or as `{ error }` in its body; both count. Failures are collected, not
// thrown, so one unreachable provider cannot stop the wipe.
async function disconnectIntegrations(failed) {
  for (const { fn, label } of ACCOUNT_RESET_DISCONNECTS) {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { action: 'disconnect' } })
      if (error) throw error
      if (data && data.error) throw new Error(String(data.error))
    } catch (e) {
      failed.push(`${label}: ${e?.message ?? 'disconnect failed'}`)
    }
  }
}

export async function resetAllUserData() {
  const failed = []
  // Credentials first — see core domain/account.ts for the order.
  await disconnectIntegrations(failed)
  for (const table of ACCOUNT_RESET_HARD_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).delete())
    if (error) failed.push(`${table}: ${error.message}`)
  }
  // Offline, not just hidden: the public edge functions 404 an unpublished page.
  for (const table of ACCOUNT_RESET_UNPUBLISH_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).update({ published: false }))
    if (error) failed.push(`${table} (unpublish): ${error.message}`)
  }
  const now = new Date().toISOString()
  for (const table of ACCOUNT_RESET_SOFT_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).update({ deleted_at: now }).is('deleted_at', null))
    if (error) failed.push(`${table}: ${error.message}`)
  }
  // The reports ledger. Everything above is a SOFT delete, and soft delete is a
  // deliberate no-op for report_tallies (migration 0100) — so without this the
  // account starts from zero while the reports screen still shows its old
  // numbers.
  const { error: tallyErr } = await supabase.rpc('report_tallies_reset_own')
  if (tallyErr) failed.push(`report_tallies: ${tallyErr.message}`)
  if (failed.length) throw new Error(`חלק מהנתונים לא נמחקו — ${failed.join(' · ')}`)
}

export const ACCOUNT_DELETION_GRACE_DAYS = 30

// prefs.accountDeletion record for a fresh request (30-day grace).
export function buildAccountDeletionRequest(now = new Date()) {
  const requestedMs = now.getTime()
  const scheduledMs = requestedMs + ACCOUNT_DELETION_GRACE_DAYS * 86400000
  return { requested_at: new Date(requestedMs).toISOString(), scheduled_for: new Date(scheduledMs).toISOString() }
}

// True while a recorded deletion is still within its grace window.
export function isDeletionPending(prefs) {
  const d = prefs?.accountDeletion
  return !!(d && d.scheduled_for && new Date(d.scheduled_for).getTime() > Date.now())
}

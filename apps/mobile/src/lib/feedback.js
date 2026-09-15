import { supabase } from './supabase'

/* ════════════════════════════════════════════════════════════════
   FEEDBACK — "talk to us", from the phone.
   ════════════════════════════════════════════════════════════════
   Port of apps/web/src/hooks/useFeedback.js. The same two steps, in the
   same order:
     1. a durable row in public.feedback (RLS scopes it to the signed-in
        user) — the source of truth;
     2. the `send-feedback` edge function, which emails the team. Best-
        effort: the row is already saved, so a mail failure loses nothing.

   `platform` is always 'mobile' here — web has to sniff a user agent to
   tell a phone from a computer; this app only ever runs on one. The
   Hebrew `device` label rides along to the email only, as on web.

   The insert retries with fewer columns when the table predates a
   migration (type: 0016, platform/source: 0079), same as web, so a build
   that reaches a phone before the database catches up still delivers.

   Opening the sheet goes through a tiny store rather than a prop chain:
   the drawer, the help screen and anything later all call openFeedback(),
   and one host mounted at the app shell renders the sheet.
   ════════════════════════════════════════════════════════════════ */

export const FEEDBACK_TYPES = ['bug', 'idea', 'praise', 'other']

const isMissingCol = (err) => !!err && /column|schema cache|could not find/i.test(err.message || '')

export async function submitFeedback({ userId, message, type = null }) {
  const text = (message || '').trim()
  if (!text) return { ok: false, error: 'empty' }
  try {
    const base = { user_id: userId, message: text }
    let insErr = (await supabase.from('feedback').insert({ ...base, type: type || null, platform: 'mobile', source: 'app' })).error
    if (insErr && isMissingCol(insErr)) {
      insErr = (await supabase.from('feedback').insert({ ...base, type: type || null })).error
      if (insErr && isMissingCol(insErr)) {
        insErr = (await supabase.from('feedback').insert(base)).error
      }
    }
    if (insErr) throw insErr

    const { error: fnErr } = await supabase.functions.invoke('send-feedback', {
      body: { message: text, type, device: 'מובייל' },
    })
    return { ok: true, emailed: !fnErr }
  } catch (e) {
    return { ok: false, error: e }
  }
}

// ── open/close store ────────────────────────────────────────────────────────
let open = false
const listeners = new Set()
const emit = () => { for (const fn of listeners) fn() }

export function subscribeFeedback(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function isFeedbackOpen() { return open }
export function openFeedback() { if (!open) { open = true; emit() } }
export function closeFeedback() { if (open) { open = false; emit() } }

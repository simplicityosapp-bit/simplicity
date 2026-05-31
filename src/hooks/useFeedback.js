import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'

/* ════════════════════════════════════════════════════════════════
   useFeedback — submit free-text feedback from inside the app.
   ════════════════════════════════════════════════════════════════
   Two steps, in order:
   1. Insert a durable row into public.feedback (RLS scopes it to the
      signed-in user). This is the source of truth.
   2. Invoke the `send-feedback` edge function to email the team.
      Best-effort: if the mail step fails the row is already saved,
      so the feedback is never lost.

   `type` is optional (bug/idea/praise/other). It rides along to the
   email subject for triage; it is NOT stored on the row (no column —
   keeping this change schema-free).
   ════════════════════════════════════════════════════════════════ */
export function useFeedback() {
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submitFeedback = useCallback(async (message, type = null) => {
    const text = (message || '').trim()
    if (!text) return { ok: false, error: 'empty' }

    setSubmitting(true)
    setError(null)
    try {
      // 1) Durable copy.
      const { error: insErr } = await supabase
        .from('feedback')
        .insert({ user_id: user?.id, message: text })
      if (insErr) throw insErr

      // 2) Email the team (best-effort).
      const { error: fnErr } = await supabase.functions.invoke('send-feedback', {
        body: { message: text, type },
      })
      if (fnErr) {
        console.warn('send-feedback email failed (row was saved):', fnErr)
        return { ok: true, emailed: false }
      }
      return { ok: true, emailed: true }
    } catch (e) {
      setError(e)
      return { ok: false, error: e }
    } finally {
      setSubmitting(false)
    }
  }, [user?.id])

  return { submitFeedback, submitting, error }
}

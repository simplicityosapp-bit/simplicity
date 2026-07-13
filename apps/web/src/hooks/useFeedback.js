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
   email subject for triage AND is stored on the row (migration 0016)
   so the admin console can classify feedback. Legacy rows have a NULL
   type — harmless, treated as "unclassified".

   `platform` (mobile/desktop) is detected client-side and stored on the row
   (migration 0079) for the admin triage board; the Hebrew `device` label also
   rides along to the notification email so the team sees phone vs. computer.
   ════════════════════════════════════════════════════════════════ */

/* Best-effort device classification for feedback triage. Mobile UA, or a
   touch-first coarse pointer, → mobile; otherwise desktop. */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(ua) ||
    ((navigator.maxTouchPoints || 0) > 1 && window.matchMedia?.('(pointer: coarse)').matches)
}
const detectDevice = () => (isMobileDevice() ? 'מובייל' : 'דסקטופ')   // Hebrew label for the notification email
const detectPlatform = () => (isMobileDevice() ? 'mobile' : 'desktop') // canonical value stored on the row (migration 0079)

export function useFeedback() {
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- deps are correct ([user?.id]); the compiler can't prove it through the optional chain.
  const submitFeedback = useCallback(async (message, type = null) => {
    const text = (message || '').trim()
    if (!text) return { ok: false, error: 'empty' }

    setSubmitting(true)
    setError(null)
    try {
      // 1) Durable copy — the source of truth. Alongside `type` (bug/idea/…,
      //    the user's self-report, migration 0016) we store the auto-detected
      //    `platform` + `source='app'` for the admin triage board (migration
      //    0079). Deploy-order resilient: if this build ships before a migration
      //    adds a column, retry with progressively fewer columns so feedback
      //    NEVER breaks for users regardless of deploy order.
      const base = { user_id: user?.id, message: text }
      const isMissingCol = (err) => err && /column|schema cache|could not find/i.test(err.message || '')
      let insErr = (await supabase.from('feedback').insert({ ...base, type: type || null, platform: detectPlatform(), source: 'app' })).error
      if (insErr && isMissingCol(insErr)) {
        insErr = (await supabase.from('feedback').insert({ ...base, type: type || null })).error
        if (insErr && isMissingCol(insErr)) {
          insErr = (await supabase.from('feedback').insert(base)).error
        }
      }
      if (insErr) throw insErr

      // 2) Email the team (best-effort). `device` is email-only (not stored).
      const { error: fnErr } = await supabase.functions.invoke('send-feedback', {
        body: { message: text, type, device: detectDevice() },
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

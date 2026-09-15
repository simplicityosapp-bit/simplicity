import { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { needsReacceptance, consentRowsFromMetadata } from '../lib/legal'
import { takePendingConsent, hasPendingConsent } from '../lib/pendingConsent'
import { recordConsent } from '../lib/consentLog'
import PolicyUpdateScreen from '../screens/PolicyUpdateScreen'

/* ════════════════════════════════════════════════════════════════
   CONSENT GATE — port of web's ConsentGate + ConsentSync.
   ════════════════════════════════════════════════════════════════
   Sits between sign-in and everything else, as on web:

   1. A consent given on the signup form and carried through a Google
      sign-in (lib/pendingConsent) is written to user_metadata and to the
      consent log first, so a new Google account is not immediately asked
      for what it just agreed to — and its marketing choice is kept.
   2. A user whose accepted versions are stale, or were never recorded,
      gets PolicyUpdateScreen and nothing else. The phone had no gate: a
      user who only used the app never saw a policy change.
   3. Everyone else's consent is mirrored into public.user_consent once per
      acceptance (idempotent upsert), which also backfills acceptances made
      before the log existed. Failures retry on the next launch.
   ════════════════════════════════════════════════════════════════ */

const recorded = new Set() // `${user}:${acceptance moments}` already logged this run

export default function ConsentGate({ session, children }) {
  const user = session?.user
  const [applying, setApplying] = useState(hasPendingConsent)

  useEffect(() => {
    if (!user?.id) return undefined
    const pending = takePendingConsent()
    if (!pending) { setApplying(false); return undefined }
    let alive = true
    ;(async () => {
      // Separate so a missing log never blocks the write that releases the gate.
      try { await recordConsent(consentRowsFromMetadata(pending, 'google_oauth')) } catch { /* backfilled below later */ }
      try {
        if (needsReacceptance(user)) {
          const { error } = await supabase.auth.updateUser({ data: { ...pending } })
          if (error) throw error
        }
      } catch {
        /* Falls through to the gate, which asks explicitly. */
      } finally {
        if (alive) setApplying(false)
      }
    })()
    return () => { alive = false }
    // Once per signed-in user: the pending consent belongs to that sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const blocked = !applying && !!user && needsReacceptance(user)
  const md = user?.user_metadata
  const logKey = user?.id && !blocked && !applying
    ? `${user.id}:${md?.privacy_accepted_at}:${md?.dpa_accepted_at}:${md?.terms_accepted_at}:${md?.marketing_consent_at}`
    : null

  useEffect(() => {
    if (!logKey || recorded.has(logKey)) return
    const rows = consentRowsFromMetadata(md)
    if (!rows.length) return
    recorded.add(logKey)
    recordConsent(rows).catch(() => { recorded.delete(logKey) })
    // md is read through logKey, which changes whenever an acceptance does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logKey])

  if (applying) {
    return <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
  }
  if (blocked) return <PolicyUpdateScreen />
  return children
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})

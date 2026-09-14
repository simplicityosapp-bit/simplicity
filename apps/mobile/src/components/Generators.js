import { useEffect } from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import { runGenerationPass, isDue, notifyGenerated } from '../lib/generators'

/* ════════════════════════════════════════════════════════════════
   GENERATORS — renders nothing; runs lib/generators.
   ════════════════════════════════════════════════════════════════
   Mounted once in App.js, inside the signed-in, onboarded tree. Web mounts
   its generators on Home, because in a browser "a screen mounted" is the
   moment the app is being used. On a phone that moment is the app coming
   back to the foreground — Home stays mounted for the whole session and
   would run once, at launch — so this sits at the root and listens to
   AppState instead.

   Runs at start and on each return to the foreground, at most once per
   MIN_INTERVAL_MS. The latch is module-level, so a remount while a pass is
   in flight (a language switch remounts this subtree) never starts a second
   one. The clock resets on unmount, so the next person to sign in on this
   phone gets a pass straight away.

   Web shows a toast when inserts fail. This app has no toast channel yet,
   so a failed pass is silent here and simply retried next time.
   ════════════════════════════════════════════════════════════════ */
let running = false
let lastRunAt = null

async function run() {
  const now = Date.now()
  if (running || !isDue(lastRunAt, now)) return
  running = true
  lastRunAt = now
  try {
    const result = await runGenerationPass(supabase, new Date(now))
    if (result.meetings || result.transactions || result.bookings) notifyGenerated(result)
  } catch {
    /* A read failed, so nothing was written. Let the next foreground try
       again rather than waiting out the interval. */
    lastRunAt = null
  } finally {
    running = false
  }
}

export default function Generators() {
  useEffect(() => {
    run()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run()
    })
    return () => {
      sub.remove()
      lastRunAt = null
    }
  }, [])
  return null
}

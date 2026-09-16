import { moonDayKey } from '@simplicity/core'
import { supabase } from './supabase'

/* ════════════════════════════════════════════════════════════════
   MOON SNAPSHOTS — the day's score, recorded (web lib/api/moonSnapshots).
   ════════════════════════════════════════════════════════════════
   One row per user per day (UNIQUE(user_id, date)); a later visit the same
   day overwrites it. It is what the trend line shows for a day once that
   day is over, so the phone contributes a point on every day it is opened,
   not only on days the web app is.

   `reflection` is deliberately not sent. Web writes it as null on every
   upsert, which would clear a note written elsewhere; an upsert that omits
   the column leaves it as it was.
   ════════════════════════════════════════════════════════════════ */

export async function upsertMoonSnapshot({ score, paced = null, confidence = null, date = moonDayKey() }) {
  if (score == null || Number.isNaN(score)) throw new Error('upsertMoonSnapshot: score is required')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')
  const { error } = await supabase
    .from('moon_snapshots')
    .upsert({ user_id: session.user.id, date, score, paced, confidence, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' })
  if (error) throw error
}

/* The last `days` snapshots, oldest first. */
export async function listMoonSnapshots(days = 30, now = new Date()) {
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))
  const { data, error } = await supabase
    .from('moon_snapshots')
    .select('date, score, paced, confidence')
    .gte('date', moonDayKey(start))
    .lte('date', moonDayKey(now))
    .order('date', { ascending: true })
  if (error) throw error
  return data ?? []
}

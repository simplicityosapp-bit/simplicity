/* ════════════════════════════════════════════════════════════════
   MOON SNAPSHOTS API — one row per (user, date) capturing the
   moon-glance weighted score for that day. Provides a persistent
   trend that survives data mutations and powers the 30-day trend
   chart on the moon-glance drawer.

   Table has UNIQUE(user_id, date) — upsert by (user_id, date) to
   overwrite today's row when the score recalculates within a day.

   `reflection` (the user's free-text daily note) is encrypted at rest
   (see lib/fieldCrypto.js): encrypted on write, decrypted on read. The
   score/paced/breakdown stay plaintext (they're the "usage" trend data).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { encryptRow, decryptRow, decryptRows } from '../fieldCrypto'

/* YYYY-MM-DD in local time (matches the DATE column semantics). */
function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/* Upsert a snapshot for a given date (defaults to today). Same date
   on the same user overwrites — keeps "one snapshot per day". */
export async function upsertMoonSnapshot({
  date = localDateString(),
  score,
  paced = null,
  confidence = null,
  breakdown = null,
  reflection = null,
}) {
  if (score === undefined || score === null || Number.isNaN(score)) {
    throw new Error('upsertMoonSnapshot: score is required')
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = {
    user_id: session.user.id,
    date,
    score,
    paced,
    confidence,
    breakdown,
    reflection,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('moon_snapshots')
    .upsert(await encryptRow('moon_snapshots', row), { onConflict: 'user_id,date' })
    .select()
    .single()
  if (error) throw error
  return decryptRow('moon_snapshots', data)
}

/* Snapshots in a date range, ascending. Used by the trend chart. */
export async function getMoonSnapshotRange(fromDate, toDate) {
  let q = supabase.from('moon_snapshots').select('*').order('date', { ascending: true })
  if (fromDate) q = q.gte('date', fromDate)
  if (toDate) q = q.lte('date', toDate)
  const { data, error } = await q
  if (error) throw error
  return decryptRows('moon_snapshots', data)
}

/* Last N days of snapshots (inclusive of today). */
export async function getMoonSnapshotLastDays(n = 30) {
  const today = new Date()
  const start = new Date()
  start.setDate(today.getDate() - (n - 1))
  return getMoonSnapshotRange(localDateString(start), localDateString(today))
}

/* Single snapshot for a specific date (or null). */
export async function getMoonSnapshotForDate(date) {
  const { data, error } = await supabase
    .from('moon_snapshots')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return decryptRow('moon_snapshots', data)
}

export { localDateString as moonSnapshotLocalDate }

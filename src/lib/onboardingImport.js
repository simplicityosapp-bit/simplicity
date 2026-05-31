/* ════════════════════════════════════════════════════════════════
   ONBOARDING IMPORT — bulk-create reviewed CSV rows on finish.
   ════════════════════════════════════════════════════════════════
   The review wizard (Step 9 interstitial) hands us the rows the user
   APPROVED — already edited, with rejected rows dropped. We persist
   them in dependency order: projects first (clients FK to them), then
   clients, then transactions (which FK to both). Errors per row are
   swallowed (with a counter) so a single bad row doesn't abort the
   rest of the import.

   Accepts either:
     - { projects, clients, transactions }  ← the reviewed payload
     - { parsedData }                        ← legacy: derive from the
       raw parse (no per-row review). Kept so an in-flight user with the
       old shape, or any other caller, still works.
   ════════════════════════════════════════════════════════════════ */

import { insertClient, listClients } from './api/clients'
import { insertProject, listProjects } from './api/projects'
import { insertTransaction } from './api/transactions'
import { normalizeDate } from './csvImport'

const norm = (s) => (s || '').trim().toLowerCase()

export async function finalizeOnboardingImport(input = {}) {
  const summary = {
    projects:     { created: 0, skipped: 0, failed: 0 },
    clients:      { created: 0, skipped: 0, failed: 0 },
    transactions: { created: 0, skipped: 0, failed: 0 },
    errors:       [],
  }

  /* Resolve the work list — explicit reviewed arrays win; otherwise
     fall back to the raw parsed_data buckets. */
  let projects = []
  let clients = []
  let transactions = []
  if (Array.isArray(input.projects) || Array.isArray(input.clients) || Array.isArray(input.transactions)) {
    projects = input.projects || []
    clients = input.clients || []
    transactions = input.transactions || []
  } else if (input.parsedData && input.parsedData.kind !== 'placeholder') {
    projects = input.parsedData.projects || []
    clients = input.parsedData.clients || []
    transactions = input.parsedData.transactions || []
  } else {
    return summary
  }

  /* Fresh snapshot from the DB — the source of truth (NOT a React
     snapshot, which can lag behind optimistic inserts elsewhere). */
  let existingClients = []
  let existingProjects = []
  try { existingClients = await listClients() } catch { /* assume empty */ }
  try { existingProjects = await listProjects() } catch { /* assume empty */ }

  /* ── Projects first — clients reference them. ── */
  const projectIdByName = new Map()
  for (const p of existingProjects) {
    if (p?.name) projectIdByName.set(norm(p.name), p.id)
  }
  for (const proj of projects) {
    const key = norm(proj.name)
    if (!key) continue
    if (projectIdByName.has(key)) { summary.projects.skipped += 1; continue }
    try {
      const row = await insertProject({ name: proj.name.trim(), color: proj.color || null })
      projectIdByName.set(key, row.id)
      summary.projects.created += 1
    } catch (e) {
      summary.projects.failed += 1
      summary.errors.push(`project "${proj.name}": ${e.message || 'unknown'}`)
    }
  }

  /* ── Clients — dedup by name (case-insensitive) against the DB so we
     don't double-create the one already added in Step 4. ── */
  const clientIdByName = new Map()
  for (const c of existingClients) {
    if (c?.name) clientIdByName.set(norm(c.name), c.id)
  }
  for (const c of clients) {
    const key = norm(c.name)
    if (!key) continue
    if (clientIdByName.has(key)) { summary.clients.skipped += 1; continue }
    const project_id = c.project_name ? (projectIdByName.get(norm(c.project_name)) || null) : null
    try {
      const row = await insertClient({
        name: c.name.trim(),
        status: c.status_meta === 'past' ? 'past' : 'active',
        status_meta: c.status_meta || 'active',
        project_id,
        group_id: null,
        sessions: Number(c.sessions) || 0,
        price_per_session: Number(c.price_per_session) || 0,
        total_override: null,
        has_custom_price: false,
        recurring_day: null,
        recurring_time: null,
        left_mid_process: false,
        phone: c.phone || null,
        notes: c.notes || null,
        notes_updated_at: null,
      })
      clientIdByName.set(key, row.id)
      summary.clients.created += 1
    } catch (e) {
      summary.clients.failed += 1
      summary.errors.push(`client "${c.name}": ${e.message || 'unknown'}`)
    }
  }

  /* ── Transactions — FK to client/project by name where resolvable.
     A valid (parseable) date is required by the schema. ── */
  for (const t of transactions) {
    const date = normalizeDate(t.date)
    const amount = Number(t.amount)
    if (!date || Number.isNaN(amount) || amount === 0) { summary.transactions.skipped += 1; continue }
    const client_id = t.client_name ? (clientIdByName.get(norm(t.client_name)) || null) : null
    const project_id = t.project_name ? (projectIdByName.get(norm(t.project_name)) || null) : null
    try {
      await insertTransaction({
        amount: Math.abs(amount),
        type: t.type === 'expense' ? 'expense' : 'income',
        desc: t.desc || null,
        date,
        status: 'confirmed',
        project_id,
        client_id,
        category_id: null,
        recurring_id: null,
        orphaned_from: null,
      })
      summary.transactions.created += 1
    } catch (e) {
      summary.transactions.failed += 1
      summary.errors.push(`transaction ${date} ${amount}: ${e.message || 'unknown'}`)
    }
  }

  return summary
}

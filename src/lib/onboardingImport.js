/* ════════════════════════════════════════════════════════════════
   ONBOARDING IMPORT — bulk-create parsed CSV rows on finish.
   ════════════════════════════════════════════════════════════════
   When a path-A user completes the wizard, every parsed row that
   wasn't created during the per-step manual flow gets persisted now.
   Project rows are created first so client rows can FK to them.
   Errors per row are swallowed (with a counter) so a single bad row
   doesn't abort the rest of the import.
   ════════════════════════════════════════════════════════════════ */

import { insertClient, listClients } from './api/clients'
import { insertProject, listProjects } from './api/projects'

const norm = (s) => (s || '').trim().toLowerCase()

/* Run the post-onboarding bulk import. Returns a summary of what was
   created, skipped (duplicate name), or failed. Idempotent within a
   single call — reads what's already in the DB right now (NOT from
   a React snapshot, which can lag behind optimistic inserts in other
   components) to avoid re-creating rows the user already added. */
export async function finalizeOnboardingImport({ parsedData }) {
  const summary = {
    projects: { created: 0, skipped: 0, failed: 0 },
    clients:  { created: 0, skipped: 0, failed: 0 },
    errors:   [],
  }
  if (!parsedData || parsedData.kind !== 'csv') return summary

  /* Fresh snapshot from the DB — the source of truth. */
  let existingClients = []
  let existingProjects = []
  try { existingClients = await listClients() } catch { /* assume empty */ }
  try { existingProjects = await listProjects() } catch { /* assume empty */ }

  /* Projects first — clients reference them. Build a name → id map of
     what's already in the DB; the CSV may want to attach clients to
     projects that don't exist yet. */
  const projectIdByName = new Map()
  for (const p of existingProjects) {
    if (p?.name) projectIdByName.set(norm(p.name), p.id)
  }
  for (const proj of (parsedData.projects || [])) {
    const key = norm(proj.name)
    if (!key) continue
    if (projectIdByName.has(key)) {
      summary.projects.skipped += 1
      continue
    }
    try {
      const row = await insertProject({ name: proj.name.trim(), color: null })
      projectIdByName.set(key, row.id)
      summary.projects.created += 1
    } catch (e) {
      summary.projects.failed += 1
      summary.errors.push(`project "${proj.name}": ${e.message || 'unknown'}`)
    }
  }

  /* Clients — dedup by name (case-insensitive) against what's already
     in the DB so we don't double-create the one the user already
     added in Step 4. */
  const existingClientNames = new Set(existingClients.map((c) => norm(c?.name)))
  for (const c of (parsedData.clients || [])) {
    const key = norm(c.name)
    if (!key) continue
    if (existingClientNames.has(key)) {
      summary.clients.skipped += 1
      continue
    }
    const project_id = c.project_name ? (projectIdByName.get(norm(c.project_name)) || null) : null
    try {
      await insertClient({
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
      existingClientNames.add(key)
      summary.clients.created += 1
    } catch (e) {
      summary.clients.failed += 1
      summary.errors.push(`client "${c.name}": ${e.message || 'unknown'}`)
    }
  }

  return summary
}

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
import { insertTransaction, listTransactions } from './api/transactions'
import { insertRecurring, listRecurring } from './api/recurring'
import { insertClientStatus, listClientStatuses } from './api/clientStatuses'
import { insertLeadStatus, listLeadStatuses } from './api/leadStatuses'
import { insertLead, listLeads } from './api/leads'
import { normalizeDate } from './csvImport'
import { mapValueToMeta } from './statusImport'

const norm = (s) => (s || '').trim().toLowerCase()

export async function finalizeOnboardingImport(input = {}) {
  /* Clock for dated derived rows (client payments). Caller may pass
     input.nowIso; default to the real now (app runtime, not a workflow). */
  const nowIso = input.nowIso || new Date().toISOString()
  const summary = {
    projects:       { created: 0, skipped: 0, failed: 0 },
    clients:        { created: 0, skipped: 0, failed: 0 },
    transactions:   { created: 0, skipped: 0, failed: 0 },
    recurring:      { created: 0, skipped: 0, failed: 0 },
    leads:          { created: 0, skipped: 0, failed: 0 },
    clientStatuses: { created: 0, skipped: 0, failed: 0 },
    leadStatuses:   { created: 0, skipped: 0, failed: 0 },
    errors:         [],
  }

  /* Resolve the work list — explicit reviewed arrays win; otherwise
     fall back to the raw parsed_data buckets. */
  let projects = []
  let clients = []
  let transactions = []
  let leads = []
  let clientStatuses = []
  let leadStatuses = []
  if (Array.isArray(input.projects) || Array.isArray(input.clients) || Array.isArray(input.transactions)
      || Array.isArray(input.leads) || Array.isArray(input.clientStatuses) || Array.isArray(input.leadStatuses)) {
    projects = input.projects || []
    clients = input.clients || []
    transactions = input.transactions || []
    leads = input.leads || []
    clientStatuses = input.clientStatuses || []
    leadStatuses = input.leadStatuses || []
  } else if (input.parsedData && input.parsedData.kind !== 'placeholder') {
    projects = input.parsedData.projects || []
    clients = input.parsedData.clients || []
    transactions = input.parsedData.transactions || []
  } else {
    return summary
  }

  /* Auto-derive the status rows to create from the imported records'
     status_name values, so a client/lead that carried "לא רלוונטי" gets
     a real status row (mapped to its meta bucket) — and lands in the
     right place. Explicit clientStatuses/leadStatuses still merge in. */
  const deriveStatuses = (records, kind) => {
    const seen = new Set()
    const rows = []
    records.forEach((rec) => {
      const name = (rec.status_name || '').trim()
      if (!name || seen.has(norm(name))) return
      seen.add(norm(name))
      rows.push({ display_name: name, meta_category: mapValueToMeta(name, kind) })
    })
    return rows
  }
  const mergeStatusRows = (explicit, derived) => {
    const seen = new Set(explicit.map((s) => norm(s.display_name)))
    return [...explicit, ...derived.filter((s) => !seen.has(norm(s.display_name)))]
  }
  clientStatuses = mergeStatusRows(clientStatuses, deriveStatuses(clients, 'client'))
  leadStatuses = mergeStatusRows(leadStatuses, deriveStatuses(leads, 'lead'))

  /* Fresh snapshot from the DB — the source of truth (NOT a React
     snapshot, which can lag behind optimistic inserts elsewhere). */
  let existingClients = []
  let existingProjects = []
  let existingClientStatuses = []
  let existingLeadStatuses = []
  try { existingClients = await listClients() } catch { /* assume empty */ }
  try { existingProjects = await listProjects() } catch { /* assume empty */ }
  try { existingClientStatuses = await listClientStatuses() } catch { /* assume empty */ }
  try { existingLeadStatuses = await listLeadStatuses() } catch { /* assume empty */ }

  /* ── Statuses first — clients & leads link to them by name. Dedup by
     display_name (case-insensitive) so re-import doesn't duplicate. ── */
  const clientStatusIdByName = new Map()
  existingClientStatuses.forEach((s) => { if (s?.display_name) clientStatusIdByName.set(norm(s.display_name), s.id) })
  for (const s of clientStatuses) {
    const key = norm(s.display_name)
    if (!key) continue
    if (clientStatusIdByName.has(key)) { summary.clientStatuses.skipped += 1; continue }
    try {
      const row = await insertClientStatus({ meta_category: s.meta_category || 'active', display_name: s.display_name.trim(), icon: s.icon || null, is_default: false })
      clientStatusIdByName.set(key, row.id)
      summary.clientStatuses.created += 1
    } catch (e) {
      summary.clientStatuses.failed += 1
      summary.errors.push(`client status "${s.display_name}": ${e.message || 'unknown'}`)
    }
  }
  const leadStatusIdByName = new Map()
  existingLeadStatuses.forEach((s) => { if (s?.display_name) leadStatusIdByName.set(norm(s.display_name), s.id) })
  for (const s of leadStatuses) {
    const key = norm(s.display_name)
    if (!key) continue
    if (leadStatusIdByName.has(key)) { summary.leadStatuses.skipped += 1; continue }
    try {
      const row = await insertLeadStatus({ meta_category: s.meta_category || 'in_process', display_name: s.display_name.trim(), color: s.color || null, icon: s.icon || null, is_default: false })
      leadStatusIdByName.set(key, row.id)
      summary.leadStatuses.created += 1
    } catch (e) {
      summary.leadStatuses.failed += 1
      summary.errors.push(`lead status "${s.display_name}": ${e.message || 'unknown'}`)
    }
  }
  /* meta_category lookups, so a record carrying status_name resolves to
     both its status_id AND its meta bucket. */
  const clientStatusMetaByName = new Map()
  ;[...existingClientStatuses, ...clientStatuses].forEach((s) => { if (s?.display_name) clientStatusMetaByName.set(norm(s.display_name), s.meta_category) })
  const leadStatusMetaByName = new Map()
  ;[...existingLeadStatuses, ...leadStatuses].forEach((s) => { if (s?.display_name) leadStatusMetaByName.set(norm(s.display_name), s.meta_category) })

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
  /* Payments to create from clients' `paid` totals — collected here, made
     after the client rows exist so we can FK them. Each becomes one
     confirmed income transaction dated today (the sheet rarely says when). */
  const clientPayments = []
  for (const c of clients) {
    const key = norm(c.name)
    if (!key) continue
    if (clientIdByName.has(key)) { summary.clients.skipped += 1; continue }
    const project_id = c.project_name ? (projectIdByName.get(norm(c.project_name)) || null) : null
    /* Resolve an imported status name → its row id + meta bucket. An
       explicit status_meta on the row still wins if there's no name. */
    const statusName = c.status_name ? norm(c.status_name) : null
    const status_id = statusName ? (clientStatusIdByName.get(statusName) || null) : null
    const resolvedMeta = (statusName && clientStatusMetaByName.get(statusName)) || c.status_meta || 'active'
    try {
      const row = await insertClient({
        name: c.name.trim(),
        status: resolvedMeta === 'past' ? 'past' : resolvedMeta === 'no_status' ? 'no_status' : resolvedMeta === 'wandering' ? 'wandering' : 'active',
        status_meta: resolvedMeta,
        status_id,
        project_id,
        group_id: null,
        sessions: Number(c.sessions) || 0,
        price_per_session: Number(c.price_per_session) || 0,
        /* Imported "סה״כ לתשלום" → the client's total due. When present it
           overrides sessions×price so the balance (total − paid) matches
           what the coach already tracks. */
        total_override: Number(c.total_due) > 0 ? Number(c.total_due) : null,
        has_custom_price: Number(c.total_due) > 0,
        recurring_day: null,
        recurring_time: null,
        left_mid_process: false,
        phone: c.phone || null,
        notes: c.notes || null,
        notes_updated_at: null,
      })
      clientIdByName.set(key, row.id)
      summary.clients.created += 1
      /* Carry the client's already-paid amount into a real payment so the
         client arrives with paid history, not just a hollow shell. */
      const paid = Number(c.paid)
      if (paid > 0) clientPayments.push({ client_id: row.id, project_id, amount: paid, name: c.name })
    } catch (e) {
      summary.clients.failed += 1
      summary.errors.push(`client "${c.name}": ${e.message || 'unknown'}`)
    }
  }

  /* Existing transactions — fetched ONCE, used for both payment
     idempotency and the dated-transaction dedup below, so re-running
     onboarding never doubles anything. ── */
  let existingTxns = []
  try { existingTxns = await listTransactions() } catch { /* assume none */ }
  const txnKey = (amount, type, date, cId, pId) => `${Math.abs(amount)}|${type}|${date}|${cId || ''}|${pId || ''}`
  const seenTxns = new Set(
    existingTxns.map((t) => txnKey(t.amount, t.type, String(t.date).slice(0, 10), t.client_id, t.project_id)),
  )
  /* Client payments are dated "today", so a plain date-keyed check would
     let a re-import on a DIFFERENT day duplicate them. Dedup them
     date-AGNOSTICALLY by client+amount+desc. */
  const payKey = (cId, amount, desc) => `${cId || ''}|${Math.abs(Number(amount))}|${(desc || '').trim()}`
  const seenPay = new Set(
    existingTxns.filter((t) => t.type === 'income').map((t) => payKey(t.client_id, t.amount, t.desc)),
  )

  /* Create the collected client payments (confirmed income, dated today). */
  const todayIso = nowIso ? String(nowIso).slice(0, 10) : null
  for (const pmt of clientPayments) {
    if (!todayIso) break /* no clock passed → skip (caller can pass one) */
    const desc = `תשלום מיובא — ${pmt.name}`
    const pk = payKey(pmt.client_id, pmt.amount, desc)
    if (seenPay.has(pk)) { summary.transactions.skipped += 1; continue }
    try {
      await insertTransaction({
        amount: Math.abs(pmt.amount), type: 'income', desc,
        date: todayIso, status: 'confirmed', project_id: pmt.project_id, client_id: pmt.client_id,
        category_id: null, recurring_id: null, orphaned_from: null,
      })
      seenPay.add(pk)
      seenTxns.add(txnKey(pmt.amount, 'income', todayIso, pmt.client_id, pmt.project_id))
      summary.transactions.created += 1
    } catch (e) {
      summary.transactions.failed += 1
      summary.errors.push(`payment "${pmt.name}": ${e.message || 'unknown'}`)
    }
  }

  /* ── Recurring rules (rate-table rows: a fixed monthly cost with no
     date) → create a recurring_templates rule, NOT a dated transaction.
     The recurring engine then generates the monthly instances. Dedup by
     type+amount+desc against existing templates and within this run. ── */
  const recurringTxns = transactions.filter((t) => t.recurring)
  if (recurringTxns.length) {
    let existingRec = []
    try { existingRec = await listRecurring() } catch { /* assume none */ }
    const recKey = (type, amount, desc) => `${type}|${Math.abs(Number(amount))}|${(desc || '').trim()}`
    const seenRec = new Set(existingRec.map((r) => recKey(r.type, r.amount, r.desc)))
    for (const t of recurringTxns) {
      const amount = Number(t.amount)
      if (Number.isNaN(amount) || amount === 0) { summary.recurring.skipped += 1; continue }
      const type = t.type === 'income' ? 'income' : 'expense'
      const key = recKey(type, amount, t.desc)
      if (seenRec.has(key)) { summary.recurring.skipped += 1; continue }
      const project_id = t.project_name ? (projectIdByName.get(norm(t.project_name)) || null) : null
      try {
        await insertRecurring({
          type,
          amount: Math.abs(amount),
          desc: t.desc || null,
          cadence_type: t.cadence === 'weekly' ? 'weekly' : 'monthly_date',
          day_of_month: t.cadence === 'weekly' ? null : (t.day_of_month || 1),
          day_of_week: null,
          trigger_type: 'schedule',
          project_id,
          client_id: null,
          category_id: null,
          until_date: null,
          active: true,
        })
        seenRec.add(key)
        summary.recurring.created += 1
      } catch (e) {
        summary.recurring.failed += 1
        summary.errors.push(`recurring "${t.desc || amount}": ${e.message || 'unknown'}`)
      }
    }
  }

  for (const t of transactions) {
    if (t.recurring) continue /* handled above as a recurring rule */
    const date = normalizeDate(t.date)
    const amount = Number(t.amount)
    if (!date || Number.isNaN(amount) || amount === 0) { summary.transactions.skipped += 1; continue }
    const client_id = t.client_name ? (clientIdByName.get(norm(t.client_name)) || null) : null
    const project_id = t.project_name ? (projectIdByName.get(norm(t.project_name)) || null) : null
    const type = t.type === 'expense' ? 'expense' : 'income'
    const key = txnKey(amount, type, date, client_id, project_id)
    if (seenTxns.has(key)) { summary.transactions.skipped += 1; continue }
    try {
      await insertTransaction({
        amount: Math.abs(amount),
        type,
        desc: t.desc || null,
        date,
        status: 'confirmed',
        project_id,
        client_id,
        category_id: null,
        recurring_id: null,
        orphaned_from: null,
      })
      seenTxns.add(key)
      summary.transactions.created += 1
    } catch (e) {
      summary.transactions.failed += 1
      summary.errors.push(`transaction ${date} ${amount}: ${e.message || 'unknown'}`)
    }
  }

  /* ── Leads — link to their imported sub-status (so they land in the
     right kanban column). status_name → status_id + status_meta.
     DEDUP by name (case-insensitive) against the DB and within this run,
     so re-importing or a name on two sheets doesn't double the lead. ── */
  let existingLeads = []
  try { existingLeads = await listLeads() } catch { /* assume none */ }
  const seenLeadNames = new Set(existingLeads.map((l) => norm(l?.name)).filter(Boolean))
  for (const l of leads) {
    const name = (l.name || '').trim()
    if (!name) { summary.leads.skipped += 1; continue }
    if (seenLeadNames.has(norm(name))) { summary.leads.skipped += 1; continue }
    const statusName = l.status_name ? norm(l.status_name) : null
    const status_id = statusName ? (leadStatusIdByName.get(statusName) || null) : null
    const status_meta = (statusName && leadStatusMetaByName.get(statusName)) || l.status_meta || 'in_process'
    try {
      await insertLead({
        name,
        phone: l.phone || null,
        status_meta,
        status_id,
        source_id: null,
        inquiry_date: normalizeDate(l.inquiry_date) || null,
        notes: l.notes || null,
      })
      seenLeadNames.add(norm(name))
      summary.leads.created += 1
    } catch (e) {
      summary.leads.failed += 1
      summary.errors.push(`lead "${name}": ${e.message || 'unknown'}`)
    }
  }

  return summary
}

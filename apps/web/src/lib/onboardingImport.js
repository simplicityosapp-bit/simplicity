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
import { insertPaymentPlan, insertPaymentInstallments, listPaymentPlans } from './api/paymentPlans'
import { generateInstallments, installmentsCoveredByPaid } from '@simplicity/core'
import { insertRecurring, listRecurring } from './api/recurring'
import { insertClientStatus, listClientStatuses } from './api/clientStatuses'
import { insertLeadStatus, listLeadStatuses } from './api/leadStatuses'
import { insertLead, listLeads } from './api/leads'
import { insertSession, listSessions } from './api/sessions'
import { normalizeDate } from './csvImport'
import { mapValueToMeta } from './statusImport'
import { listCategories, insertCategory, CATEGORY_COLORS } from './api/categories'

const norm = (s) => (s || '').trim().toLowerCase()

export async function finalizeOnboardingImport(input = {}) {
  /* Clock for dated derived rows (client payments). Caller may pass
     input.nowIso; default to the real now (app runtime, not a workflow). */
  const nowIso = input.nowIso || new Date().toISOString()
  /* Placeholder date for amounts the file gave us with no real date — the
     last day of the previous year (clear, non-distorting). Defined up here
     because the payment-plan path (inside the client loop) needs it too. */
  const estimatedDate = `${new Date(nowIso).getFullYear() - 1}-12-31`
  const summary = {
    projects:       { created: 0, skipped: 0, failed: 0 },
    clients:        { created: 0, skipped: 0, failed: 0 },
    transactions:   { created: 0, skipped: 0, failed: 0, dateEstimated: 0 },
    recurring:      { created: 0, skipped: 0, failed: 0 },
    leads:          { created: 0, skipped: 0, failed: 0 },
    clientStatuses: { created: 0, skipped: 0, failed: 0 },
    leadStatuses:   { created: 0, skipped: 0, failed: 0 },
    paymentPlans:   { created: 0, skipped: 0, failed: 0 },
    errors:         [],
  }

  /* Resolve the work list — explicit reviewed arrays win; otherwise
     fall back to the raw parsed_data buckets. */
  let projects
  let clients
  let transactions
  let leads = []
  let clientStatuses = []
  let leadStatuses = []
  let ledgerSessions = []
  if (Array.isArray(input.projects) || Array.isArray(input.clients) || Array.isArray(input.transactions)
      || Array.isArray(input.leads) || Array.isArray(input.clientStatuses) || Array.isArray(input.leadStatuses)
      || Array.isArray(input.sessions)) {
    projects = input.projects || []
    clients = input.clients || []
    transactions = input.transactions || []
    leads = input.leads || []
    clientStatuses = input.clientStatuses || []
    leadStatuses = input.leadStatuses || []
    ledgerSessions = input.sessions || []
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
  /* Clients that already have a payment plan — so a re-import never builds a
     second plan for the same client. */
  const clientsWithPlan = new Set()
  try { (await listPaymentPlans()).forEach((p) => { if (p?.client_id) clientsWithPlan.add(p.client_id) }) } catch { /* assume none */ }

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
  /* Held/past sessions to create from each client's "פגישות שנעשו" count
     (O2) — collected here, made after the client rows exist. */
  const clientSessions = []
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
    /* Total due: an explicit "סה״כ לתשלום" wins. Otherwise, if the file
       only gave us how much was PAID (no total, and no sessions×price to
       compute one), assume the paid amount IS the total — otherwise the
       client would import with a negative balance (paid against a total of
       0, looking like the coach owes them). The user can still override it
       per client. */
    const calcTotal = (Number(c.sessions) || 0) * (Number(c.price_per_session) || 0)
    const totalDue = Number(c.total_due) > 0
      ? Number(c.total_due)
      : (Number(c.paid) > 0 && calcTotal === 0 ? Number(c.paid) : null)
    /* Payment PLAN (פריסת תשלומים): a "מספר תשלומים" ≥ 2 + a total → build a
       plan instead of a single lump payment. The plan defines the client's
       total (decision), so total_override = the plan total. */
    const nInst = Math.floor(Number(c.num_installments) || 0)
    const planTotal = totalDue != null ? totalDue : (calcTotal > 0 ? calcTotal : (Number(c.paid) > 0 ? Number(c.paid) : 0))
    const willPlan = nInst >= 2 && planTotal > 0
    const clientTotal = willPlan ? planTotal : totalDue
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
        total_override: clientTotal,
        has_custom_price: clientTotal != null,
        recurring_day: null,
        recurring_time: null,
        left_mid_process: false,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        birth_date: c.birth_date || null,
        notes: c.notes || null,
        notes_updated_at: null,
      })
      clientIdByName.set(key, row.id)
      summary.clients.created += 1
      const paid = Number(c.paid)
      /* Build a payment plan when the file asked for one (num_installments ≥ 2).
         The installments the `paid` amount already covers are created RECEIVED
         — each with its own linked income transaction — so the paid history is
         preserved through the plan, NOT the lump push below (no double count). */
      let planned = false
      if (willPlan && !clientsWithPlan.has(row.id)) {
        try {
          const plan = await insertPaymentPlan({ client_id: row.id, project_id, total_amount: planTotal, num_installments: nInst, notes: null })
          const gen = generateInstallments({ total: planTotal, count: nInst, startDate: c.pay_date || undefined })
          const covered = installmentsCoveredByPaid(gen.map((g) => g.amount), paid)
          const instRows = []
          for (let i = 0; i < gen.length; i += 1) {
            const g = gen[i]
            let transaction_id = null; let received_date = null
            if (i < covered) {
              const txDate = c.pay_date || estimatedDate
              const tx = await insertTransaction({
                amount: Math.abs(g.amount), type: 'income', desc: `תשלום ${g.num}/${nInst} — ${c.name}`,
                date: txDate, status: 'confirmed', project_id, client_id: row.id,
                category_id: null, payment_method: c.pay_method || null,
                recurring_id: null, orphaned_from: c.pay_date ? null : { date_estimated: true },
              })
              transaction_id = tx.id; received_date = txDate
              summary.transactions.created += 1
              if (!c.pay_date) summary.transactions.dateEstimated += 1
            }
            instRows.push({ plan_id: plan.id, num: g.num, due_date: g.due_date, amount: g.amount, received: i < covered, received_date, payment_method: i < covered ? (c.pay_method || null) : null, transaction_id })
          }
          await insertPaymentInstallments(instRows)
          clientsWithPlan.add(row.id)
          summary.paymentPlans.created += 1
          planned = true
        } catch (e) {
          summary.paymentPlans.failed += 1
          summary.errors.push(`payment plan "${c.name}": ${e.message || 'unknown'}`)
        }
      }
      /* Carry the client's already-paid amount into a real payment so the
         client arrives with paid history — UNLESS a plan already did it. */
      if (paid > 0 && !planned) clientPayments.push({ client_id: row.id, project_id, amount: paid, name: c.name, payment_method: c.pay_method || null, pay_date: c.pay_date || null })
      /* O2: a "פגישות שנעשו" count → that many logged sessions. */
      const done = Math.floor(Number(c.sessions_done) || 0)
      if (done > 0) clientSessions.push({ client_id: row.id, count: done, name: c.name })
    } catch (e) {
      summary.clients.failed += 1
      summary.errors.push(`client "${c.name}": ${e.message || 'unknown'}`)
    }
  }

  /* ── Held/past sessions — create logged `sessions` rows so imported
     clients arrive with real history (counts toward the X/Y tally +
     per-session billing). Two sources combine:
       • O1 LEDGER (input.sessions): one row per meeting, with its real date.
       • O2 COUNT (client.sessions_done): "N done" with no dates → tops the
         client up to N using the historical placeholder date.
     `num` continues from existing sessions per client, and the ledger is
     deduped by client+date, so a re-import never doubles. ── */
  const ledgerByClient = new Map()
  for (const ls of ledgerSessions) {
    const cId = ls.client_name ? clientIdByName.get(norm(ls.client_name)) : null
    if (!cId) continue /* unlinked client → skip (flagged in the review) */
    if (!ledgerByClient.has(cId)) ledgerByClient.set(cId, [])
    ledgerByClient.get(cId).push({ date: normalizeDate(ls.date), summary: ls.summary || null })
  }

  if (clientSessions.length || ledgerByClient.size) {
    summary.sessions = { created: 0, skipped: 0, failed: 0 }
    let existingSessions = []
    try { existingSessions = await listSessions() } catch { /* assume none */ }
    const numByClient = new Map()   /* client_id → highest num seen */
    const datesByClient = new Map() /* client_id → Set<YYYY-MM-DD> for ledger dedup */
    for (const s of existingSessions) {
      if (!s?.client_id) continue
      numByClient.set(s.client_id, Math.max(numByClient.get(s.client_id) || 0, Number(s.num) || 0))
      if (!datesByClient.has(s.client_id)) datesByClient.set(s.client_id, new Set())
      datesByClient.get(s.client_id).add(String(s.date).slice(0, 10))
    }
    const placeholderDate = `${new Date(nowIso).getFullYear() - 1}-12-31T12:00:00.000Z`
    const insertOne = async (cId, dateIso, summaryText) => {
      const next = (numByClient.get(cId) || 0) + 1
      try {
        await insertSession({
          client_id: cId, group_id: null, subject_type: 'client', subject_id: cId,
          date: dateIso, num: next, notes: null, summary: summaryText,
        })
        numByClient.set(cId, next)
        summary.sessions.created += 1
        return true
      } catch (e) {
        summary.sessions.failed += 1
        summary.errors.push(`session #${next}: ${e.message || 'unknown'}`)
        return false
      }
    }
    /* 1) Ledger rows — real dates; dedup by client+date. */
    for (const [cId, rows] of ledgerByClient) {
      const seen = datesByClient.get(cId) || new Set()
      for (const r of rows) {
        const dayKey = (r.date || placeholderDate).slice(0, 10)
        if (r.date && seen.has(dayKey)) { summary.sessions.skipped += 1; continue }
        const iso = r.date ? `${r.date}T12:00:00.000Z` : placeholderDate
        await insertOne(cId, iso, r.summary || 'יובא מהקובץ')
        seen.add(dayKey)
      }
      datesByClient.set(cId, seen)
    }
    /* 2) Count fallback — top each client up to its sessions_done target. */
    for (const cs of clientSessions) {
      while ((numByClient.get(cs.client_id) || 0) < cs.count) {
        const ok = await insertOne(cs.client_id, placeholderDate, 'יובא מהקובץ')
        if (!ok) break
      }
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

  /* Imported "amount paid so far" totals + any dateless transactions carry
     no real date. Rather than dropping them (lost revenue) or dating them
     today (pollutes the current month's reports), park them on the last
     day of the PREVIOUS year — a clear, non-distorting placeholder (defined
     near the top) — and count them so the user can fix the dates in Finance. */
  for (const pmt of clientPayments) {
    const desc = `תשלום מיובא — ${pmt.name}`
    const pk = payKey(pmt.client_id, pmt.amount, desc)
    if (seenPay.has(pk)) { summary.transactions.skipped += 1; continue }
    /* A recognized payment date wins; without one, park on the placeholder and
       flag it as estimated so the user can fix it in Finance. */
    const payDate = pmt.pay_date || estimatedDate
    const payEstimated = !pmt.pay_date
    try {
      await insertTransaction({
        amount: Math.abs(pmt.amount), type: 'income', desc,
        date: payDate, status: 'confirmed', project_id: pmt.project_id, client_id: pmt.client_id,
        category_id: null, payment_method: pmt.payment_method || null,
        recurring_id: null, orphaned_from: payEstimated ? { date_estimated: true } : null,
      })
      seenPay.add(pk)
      seenTxns.add(txnKey(pmt.amount, 'income', payDate, pmt.client_id, pmt.project_id))
      summary.transactions.created += 1
      if (payEstimated) summary.transactions.dateEstimated += 1
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

  /* ── Category resolution for imported expenses (Option A): map the
     file's "קטגוריה"/category label to a category_id, creating the
     category if it doesn't exist yet. Additive + data-safe — no schema
     change; new category rows pick a colour from the preset palette. ── */
  let existingCats = []
  try { existingCats = await listCategories() } catch { /* assume none */ }
  const categoryIdByName = new Map()
  existingCats.forEach((c) => { if (c?.name) categoryIdByName.set(norm(c.name), c.id) })
  let catColorIdx = existingCats.length
  const resolveCategoryId = async (rawName) => {
    const name = (rawName || '').trim()
    if (!name) return null
    const k = norm(name)
    if (categoryIdByName.has(k)) return categoryIdByName.get(k)
    try {
      const row = await insertCategory({ name, color: CATEGORY_COLORS[catColorIdx++ % CATEGORY_COLORS.length] })
      categoryIdByName.set(k, row.id)
      return row.id
    } catch { return null }
  }

  for (const t of transactions) {
    if (t.recurring) continue /* handled above as a recurring rule */
    let date = normalizeDate(t.date)
    const amount = Number(t.amount)
    if (Number.isNaN(amount) || amount === 0) { summary.transactions.skipped += 1; continue }
    /* O6: a valid amount with no/invalid date is no longer dropped — it
       gets the historical placeholder date and is flagged as estimated. */
    const dateEstimated = !date
    if (dateEstimated) date = estimatedDate
    const client_id = t.client_name ? (clientIdByName.get(norm(t.client_name)) || null) : null
    const project_id = t.project_name ? (projectIdByName.get(norm(t.project_name)) || null) : null
    const type = t.type === 'expense' ? 'expense' : 'income'
    const category_id = type === 'expense' ? await resolveCategoryId(t.category) : null
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
        category_id,
        payment_method: t.payment_method || null,
        recurring_id: null,
        orphaned_from: dateEstimated ? { date_estimated: true } : null,
      })
      seenTxns.add(key)
      summary.transactions.created += 1
      if (dateEstimated) summary.transactions.dateEstimated += 1
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

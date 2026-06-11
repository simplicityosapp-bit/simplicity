import { useEffect, useMemo, useRef, useState } from 'react'
import DateField from '../../components/DateField'
import { X, Users, FolderKanban, Receipt, CalendarDays, Check, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useLeads } from '../../hooks/useLeads'
import { isr } from '../../lib/finance'
import './OnboardingReviewWizard.css'

/* ════════════════════════════════════════════════════════════════
   ONBOARDING REVIEW WIZARD — approve / edit / reject before write.
   ════════════════════════════════════════════════════════════════
   Interstitial opened from Step 9's "finish" CTA. Reads the entities
   derived from `parsed_data` (clients, projects, SUGGESTED
   transactions) and lets the user, per row, include / edit / exclude
   before anything is written to Supabase.
     - onConfirm(payload)  → runs the import, RETURNS the summary.
     - onComplete()        → clears parsed_data, finishes onboarding,
                             navigates home.
     - onCancel()          → returns to Step 9 untouched.
   Inclusion is derived live (existing-name sets load async); explicit
   toggles win. Rows that would be skipped/orphaned by the importer are
   surfaced (dup names, missing fields, unlinked references) instead of
   failing silently, and partial import failures are shown, not eaten.
   ════════════════════════════════════════════════════════════════ */

const norm = (s) => (s || '').trim().toLowerCase()
const PAGE = 100 /* rows rendered per tab before "load more" */

/* Turn a raw importer error into one plain-Hebrew sentence the user can
   actually act on. The importer prefixes each error with the entity +
   name ("lead \"דנה\": <db message>"); we keep that label and translate
   the common database messages. Unknown messages fall back to a generic
   but still-friendly line (never raw SQL jargon alone). */
function humanizeError(raw) {
  const s = String(raw || '')
  const labelMatch = s.match(/^(\w+)\s+"([^"]*)":/)
  const who = labelMatch
    ? `${{ client: 'הלקוח', project: 'הפרויקט', lead: 'הליד', transaction: 'התנועה' }[labelMatch[1]] || ''} "${labelMatch[2]}"`.trim()
    : ''
  const lower = s.toLowerCase()
  let why
  if (lower.includes('schema cache') || lower.includes('column')) why = 'שדה שלא קיים במערכת — כנראה עמודה שמופתה לא נכון.'
  else if (lower.includes('duplicate') || lower.includes('unique')) why = 'כבר קיים אצלך פריט זהה.'
  else if (lower.includes('violates') && lower.includes('check')) why = 'אחד הערכים לא תקין (למשל תאריך או סטטוס לא מוכר).'
  else if (lower.includes('foreign key')) why = 'הפריט מקושר למשהו שלא נוצר.'
  else if (lower.includes('null value') || lower.includes('not-null')) why = 'חסר ערך בשדה חובה.'
  else if (lower.includes('date')) why = 'התאריך לא תקין.'
  else if (lower.includes('אין חיבור')) why = 'נותק החיבור — צריך להתחבר מחדש.'
  else why = 'שגיאה לא צפויה.'
  return who ? `${who}: ${why}` : why
}

/* Default client status options offered in the review (the 4 meta
   buckets). The file's own status text is added on top so a recognised
   custom status ("פולואפ" etc.) stays selectable. */
const CLIENT_STATUS_DEFAULTS = ['פעיל׌', 'ביניים', 'לשעבר', 'ללא סטטוס']

/* `mode`: 'create' (step 9 — actually writes the data) or 'approve'
   (step 2 — only records the user's approval; step 9 leans on it and is
   the single place data is created). The two differ only in wording; the
   confirm flow is identical (onConfirm decides whether to write). */
export default function OnboardingReviewWizard({ parsed, onConfirm, onComplete, onCancel, mode = 'create' }) {
  const { clients: existingClients, loading: clientsLoading } = useClients()
  const { projects: existingProjects, loading: projectsLoading } = useProjects()
  const { leads: existingLeads } = useLeads()
  const dataLoading = clientsLoading || projectsLoading
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [result, setResult] = useState(null) /* import summary, when shown */
  const panelRef = useRef(null)
  const confirmingRef = useRef(false) /* synchronous double-confirm guard */

  const existingClientNames = useMemo(
    () => new Set((existingClients || []).map((c) => norm(c?.name))),
    [existingClients],
  )
  const existingProjectNames = useMemo(
    () => new Set((existingProjects || []).map((p) => norm(p?.name))),
    [existingProjects],
  )
  const existingLeadNames = useMemo(
    () => new Set((existingLeads || []).map((l) => norm(l?.name))),
    [existingLeads],
  )

  /* Editable working copy of the rows (field edits only). */
  const [state, setState] = useState(() => ({
    clients: (parsed?.clients || []).map((c) => ({ ...c })),
    projects: (parsed?.projects || []).map((p) => ({ ...p })),
    leads: (parsed?.leads || []).map((l) => ({ ...l })),
    transactions: (parsed?.transactions || []).map((t) => ({ ...t })),
    sessions: (parsed?.sessions || []).map((s) => ({ ...s })),
  }))
  const [overrides, setOverrides] = useState({ clients: {}, projects: {}, leads: {}, transactions: {}, sessions: {} })

  const rowExists = (type, row) => {
    if (type === 'clients') return existingClientNames.has(norm(row.name))
    if (type === 'projects') return existingProjectNames.has(norm(row.name))
    if (type === 'leads') return existingLeadNames.has(norm(row.name))
    return false
  }
  const isIncluded = (type, idx, row) => {
    const o = overrides[type][idx]
    return o === undefined ? !rowExists(type, row) : o
  }
  /* A row the importer would actually write: included AND well-formed. */
  const isValid = (type, row) => {
    if (type === 'transactions') {
      const amt = Number(row.amount)
      /* Recurring rules have no single date (they repeat) — only the
         amount must be valid. One-off transactions still need a date. */
      return !Number.isNaN(amt) && amt !== 0 && (row.recurring || !!row.date)
    }
    /* A session row needs a client to attach to; the date is optional (a
       missing one falls back to the historical placeholder at import). */
    if (type === 'sessions') return (row.client_name || '').trim().length > 0
    return (row.name || '').trim().length > 0
  }
  const creatableRows = (type) => state[type].filter((row, i) => isIncluded(type, i, row) && isValid(type, row))

  /* Names that will exist after this import (existing ∪ creatable) — used
     to tell the user when a transaction references something that won't
     be created, so its link would be dropped. */
  const willClientNames = useMemo(() => {
    const s = new Set(existingClientNames)
    state.clients.forEach((c, i) => { if (isIncluded('clients', i, c) && isValid('clients', c)) s.add(norm(c.name)) })
    return s
  }, [state.clients, overrides.clients, existingClientNames]) // eslint-disable-line react-hooks/exhaustive-deps
  const willProjectNames = useMemo(() => {
    const s = new Set(existingProjectNames)
    state.projects.forEach((p, i) => { if (isIncluded('projects', i, p) && isValid('projects', p)) s.add(norm(p.name)) })
    return s
  }, [state.projects, overrides.projects, existingProjectNames]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Duplicate client names WITHIN the file — only the first will be
     created (importer dedups by name). Mark the 2nd+ occurrences. */
  const dupClientIdx = useMemo(() => {
    const seen = new Set(); const dup = new Set()
    state.clients.forEach((c, i) => { const k = norm(c.name); if (!k) return; if (seen.has(k)) dup.add(i); else seen.add(k) })
    return dup
  }, [state.clients])
  const dupLeadIdx = useMemo(() => {
    const seen = new Set(); const dup = new Set()
    state.leads.forEach((l, i) => { const k = norm(l.name); if (!k) return; if (seen.has(k)) dup.add(i); else seen.add(k) })
    return dup
  }, [state.leads])

  const projectOptions = useMemo(() => {
    const names = new Set()
    ;(existingProjects || []).forEach((p) => { if (p?.name) names.add(p.name) })
    ;(state.projects || []).forEach((p) => { if (p?.name) names.add(p.name) })
    return Array.from(names)
  }, [existingProjects, state.projects])

  /* Client names for the sessions tab's client picker — existing clients
     plus the ones being created in this import. */
  const clientOptions = useMemo(() => {
    const names = new Set()
    ;(existingClients || []).forEach((c) => { if (c?.name) names.add(c.name) })
    ;(state.clients || []).forEach((c) => { if (c?.name) names.add(c.name) })
    return Array.from(names)
  }, [existingClients, state.clients])

  /* Client status options = the 4 defaults + any distinct status text
     that came in from the file, so every imported value stays pickable. */
  const clientStatusOptions = useMemo(() => {
    const set = new Set(CLIENT_STATUS_DEFAULTS)
    state.clients.forEach((c) => { if (c.status_name) set.add(c.status_name) })
    return Array.from(set)
  }, [state.clients])

  const TABS = [
    { key: 'clients',      label: 'לקוחות',   icon: Users },
    { key: 'projects',     label: 'פרויקטים', icon: FolderKanban },
    { key: 'leads',        label: 'לידים',    icon: Users },
    { key: 'transactions', label: 'תנועות',   icon: Receipt },
    { key: 'sessions',     label: 'פגישות',   icon: CalendarDays },
  ].filter((t) => state[t.key].length > 0)

  const [tab, setTab] = useState(TABS[0]?.key || 'clients')
  const [visible, setVisible] = useState(PAGE)
  useEffect(() => { setVisible(PAGE) }, [tab])

  const requestClose = () => { if (busy) return; if (dirty) setConfirmingClose(true); else onCancel() }

  /* Focus the dialog ONCE on mount. (Previously this ran on every render with
     no dep array, so it stole focus back from the inline inputs on every
     keystroke — typing in the review rows was broken.) */
  useEffect(() => { panelRef.current?.focus() }, [])

  /* Escape closes (guarded by the dirty confirm). Re-bind when the values
     requestClose reads change, so the handler never goes stale. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchRow = (type, idx, patch) => {
    setDirty(true)
    setState((s) => ({ ...s, [type]: s[type].map((row, i) => (i === idx ? { ...row, ...patch } : row)) }))
  }
  const toggle = (type, idx, row) => {
    setDirty(true)
    setOverrides((s) => ({ ...s, [type]: { ...s[type], [idx]: !isIncluded(type, idx, row) } }))
  }
  const setAll = (type, val) => {
    setDirty(true)
    setOverrides((s) => ({ ...s, [type]: Object.fromEntries(state[type].map((_, i) => [i, val])) }))
  }

  const counts = {
    clients: creatableRows('clients').length,
    projects: creatableRows('projects').length,
    leads: creatableRows('leads').length,
    transactions: creatableRows('transactions').length,
    sessions: creatableRows('sessions').length,
  }
  const totalIncluded = counts.clients + counts.projects + counts.leads + counts.transactions + counts.sessions
  const txIssues = parsed?.transaction_issues || 0

  const handleConfirm = async () => {
    /* Ref guard, not just `busy`: state updates are async, so a fast
       double-click could pass the `busy` check twice before re-render —
       which is exactly what double-imports the data. The ref flips
       synchronously, so the second call returns immediately. */
    if (busy || confirmingRef.current) return
    confirmingRef.current = true
    setBusy(true)
    try {
      const strip = (type) => state[type]
        .filter((row, i) => isIncluded(type, i, row) && isValid(type, row))
        .map(({ _row, ...rest }) => rest)
      const summary = await onConfirm({ projects: strip('projects'), clients: strip('clients'), leads: strip('leads'), transactions: strip('transactions'), sessions: strip('sessions') })
      const failed = summary
        ? (summary.projects?.failed || 0) + (summary.clients?.failed || 0) + (summary.leads?.failed || 0) + (summary.transactions?.failed || 0) + (summary.recurring?.failed || 0) + (summary.sessions?.failed || 0)
        : 0
      if (summary?.fatal || failed > 0) setResult(summary)
      else await onComplete()
    } finally {
      setBusy(false)
      confirmingRef.current = false
    }
  }

  const renderToggle = (type, i, row, inc) => (
    <button type="button" className={`obrw-toggle${inc ? ' on' : ''}`} onClick={() => toggle(type, i, row)}
      aria-label={inc ? 'אל תכלול' : 'כלול'}>
      {inc ? <Check size={14} strokeWidth={2.4} /> : <RotateCcw size={13} strokeWidth={2} />}
    </button>
  )

  /* ── Result / error view (after a confirm that hit failures) ── */
  if (result) {
    const created = {
      clients: result.clients?.created || 0,
      projects: result.projects?.created || 0,
      leads: result.leads?.created || 0,
      transactions: result.transactions?.created || 0,
      recurring: result.recurring?.created || 0,
    }
    const totalCreated = created.clients + created.projects + created.leads + created.transactions + created.recurring
    const totalFailed = (result.clients?.failed || 0) + (result.projects?.failed || 0)
      + (result.leads?.failed || 0) + (result.transactions?.failed || 0) + (result.recurring?.failed || 0)
    /* Plain-language created summary line (only non-zero kinds). */
    const parts = []
    if (created.clients) parts.push(`${created.clients} לקוחות`)
    if (created.projects) parts.push(`${created.projects} פרויקטים`)
    if (created.leads) parts.push(`${created.leads} לידים`)
    if (created.transactions) parts.push(`${created.transactions} תנועות`)
    if (created.recurring) parts.push(`${created.recurring} הוצאות חוזרות`)

    return (
      <div className="obrw-back" role="dialog" aria-modal="true" aria-label="תוצאת הייבוא">
        <div className="obrw-panel" ref={panelRef} tabIndex={-1}>
          <div className="obrw-result">
            <AlertTriangle size={28} strokeWidth={1.8} className="obrw-result-icon" aria-hidden="true" />
            {result.fatal ? (
              <>
                <p className="obrw-result-title">לא הצלחנו לייבא את הנתונים</p>
                <p className="obrw-result-txt">
                  משהו השתבש לפני שנוצר משהו — שום דבר לא נשמר. אפשר לנסות שוב, ואם זה חוזר נשמח לעזור.
                </p>
                <p className="obrw-result-hint">פרטים טכניים: {humanizeError(result.error)}</p>
              </>
            ) : (
              <>
                <p className="obrw-result-title">
                  {totalCreated > 0 ? 'הייבוא הושלם — אבל חלק מהשורות לא נכנסו' : 'אף שורה לא נכנסה'}
                </p>
                {totalCreated > 0 && (
                  <p className="obrw-result-txt">נוצרו בהצלחה: {parts.join(' · ')}.</p>
                )}
                <p className="obrw-result-txt obrw-result-fail">
                  {totalFailed} שורות לא נכנסו. הנה למה:
                </p>
                {result.errors?.length > 0 && (
                  <ul className="obrw-result-errs">
                    {result.errors.slice(0, 5).map((e, i) => <li key={i}>{humanizeError(e)}</li>)}
                    {result.errors.length > 5 && <li>ועוד {result.errors.length - 5} שורות דומות…</li>}
                  </ul>
                )}
                <p className="obrw-result-hint">מה שכן נכנס כבר נשמר. אפשר להמשיך, או לחזור ולתקן את השורות שנכשלו.</p>
              </>
            )}
            <div className="obrw-actions">
              <button type="button" className="ob-btn ghost" onClick={() => setResult(null)} disabled={busy}>
                חזרה לרשימה
              </button>
              <button type="button" className="ob-btn primary" onClick={onComplete} disabled={busy}>
                המשך
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="obrw-back" role="dialog" aria-modal="true" aria-label="סקירה לפני יצירה">
      <div className="obrw-panel" ref={panelRef} tabIndex={-1}>
        <header className="obrw-head">
          <div>
            <p className="obrw-title">סקירה לפני יצירה</p>
            <p className="obrw-sub">עברו על מה שזוהה מהקובץ. אפשר לערוך, לכלול או להשאיר בחוץ — רק מה שמסומן ייכתב.</p>
          </div>
          <button type="button" className="obrw-x" onClick={requestClose} aria-label="חזרה" disabled={busy}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {dataLoading ? (
          <div className="obrw-loading">
            <img className="obrw-logo obrw-logo-day"   src="/logo-dark.png"  alt="" aria-hidden="true" />
            <img className="obrw-logo obrw-logo-night" src="/logo-light.png" alt="" aria-hidden="true" />
            <p className="obrw-loading-txt">טוען את הנתונים הקיימים…</p>
          </div>
        ) : (
        <>
        <div className="obrw-tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button key={t.key} type="button" role="tab" id={`obrw-tab-${t.key}`}
                aria-selected={tab === t.key} aria-controls="obrw-panel"
                className={`obrw-tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
                <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                {t.label}
                <span className="obrw-tab-count">{counts[t.key]}/{state[t.key].length}</span>
              </button>
            )
          })}
        </div>

        <div className="obrw-bulk">
          <button type="button" className="obrw-bulk-btn" onClick={() => setAll(tab, true)}>כלול הכל</button>
          <span className="obrw-bulk-sep">·</span>
          <button type="button" className="obrw-bulk-btn" onClick={() => setAll(tab, false)}>נקה הכל</button>
          {tab === 'transactions' && txIssues > 0 && (
            <span className="obrw-warn">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {txIssues} שורות עם סכום/תאריך לא תקין לא יובאו כתנועות
            </span>
          )}
          {tab === 'clients' && parsed?.truncated && (
            <span className="obrw-warn">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              הקובץ נקטע ל-{parsed.row_cap} שורות ראשונות (מתוך {parsed.raw_rows})
            </span>
          )}
        </div>

        <div className="obrw-body" role="tabpanel" id="obrw-panel" aria-labelledby={`obrw-tab-${tab}`}>
          {tab === 'clients' && state.clients.slice(0, visible).map((c, i) => {
            const inc = isIncluded('clients', i, c)
            const exists = existingClientNames.has(norm(c.name))
            const dup = dupClientIdx.has(i)
            const invalid = inc && !isValid('clients', c)
            const projectOrphan = inc && c.project_name && !willProjectNames.has(norm(c.project_name))
            /* The current value might be a project the user just excluded —
               keep it selectable so it still displays. */
            const opts = c.project_name && !projectOptions.includes(c.project_name)
              ? [c.project_name, ...projectOptions] : projectOptions
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('clients', i, c, inc)}
                <div className="obrw-fields">
                  <input className="obrw-input obrw-grow" value={c.name || ''} placeholder="שם" disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { name: e.target.value })} />
                  <select className="obrw-input obrw-cl-proj" value={c.project_name || ''} title="פרויקט" disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { project_name: e.target.value || null })}>
                    <option value="">בלי פרויקט</option>
                    {opts.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select className={`obrw-input obrw-cl-status${c.status_unsure ? ' unsure' : ''}`} value={c.status_name || ''} title="סטטוס לקוח" disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { status_name: e.target.value || null, status_unsure: false })}>
                    <option value="">סטטוס: פעיל</option>
                    {clientStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="obrw-input obrw-num" type="number" min="0" value={c.sessions ?? ''} placeholder="פגישות" title="מספר פגישות" disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { sessions: Number(e.target.value) || 0 })} />
                  <input className="obrw-input obrw-num" type="number" min="0" value={c.price_per_session ?? ''} placeholder="מחיר" title="מחיר לפגישה" disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { price_per_session: Number(e.target.value) || 0 })} />
                  {invalid && <span className="obrw-invalid">חסר שם</span>}
                  {c.status_unsure && inc && <span className="obrw-unsure">❓ ודא/י סטטוס</span>}
                  {projectOrphan && <span className="obrw-invalid">הפרויקט לא ייווצר</span>}
                </div>
                {exists ? <span className="obrw-badge">כבר קיים</span>
                  : dup ? <span className="obrw-badge dup">כפול בקובץ</span> : null}
              </div>
            )
          })}

          {tab === 'projects' && state.projects.slice(0, visible).map((p, i) => {
            const inc = isIncluded('projects', i, p)
            const exists = existingProjectNames.has(norm(p.name))
            const invalid = inc && !isValid('projects', p)
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('projects', i, p, inc)}
                <div className="obrw-fields">
                  <input className="obrw-input obrw-grow" value={p.name || ''} placeholder="שם הפרויקט" disabled={!inc}
                    onChange={(e) => patchRow('projects', i, { name: e.target.value })} />
                  {invalid && <span className="obrw-invalid">חסר שם</span>}
                </div>
                {exists && <span className="obrw-badge">כבר קיים</span>}
              </div>
            )
          })}

          {tab === 'leads' && state.leads.slice(0, visible).map((l, i) => {
            const inc = isIncluded('leads', i, l)
            const invalid = inc && !isValid('leads', l)
            const exists = existingLeadNames.has(norm(l.name))
            const dup = dupLeadIdx.has(i)
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('leads', i, l, inc)}
                <div className="obrw-fields">
                  <input className="obrw-input obrw-grow" value={l.name || ''} placeholder="שם הליד" disabled={!inc}
                    onChange={(e) => patchRow('leads', i, { name: e.target.value })} />
                  <input className={`obrw-input obrw-cl-proj${l.status_unsure ? ' unsure' : ''}`} value={l.status_name || ''} placeholder="סטטוס" title="סטטוס הליד" disabled={!inc}
                    onChange={(e) => patchRow('leads', i, { status_name: e.target.value || null, status_unsure: false })} />
                  {invalid && <span className="obrw-invalid">חסר שם</span>}
                  {l.status_unsure && inc && <span className="obrw-unsure">❓ ודא/י סטטוס</span>}
                </div>
                {exists ? <span className="obrw-badge">כבר קיים</span>
                  : dup ? <span className="obrw-badge dup">כפול בקובץ</span>
                  : l.status_name ? <span className="obrw-badge">{l.status_name}</span> : null}
              </div>
            )
          })}

          {tab === 'transactions' && state.transactions.slice(0, visible).map((t, i) => {
            const inc = isIncluded('transactions', i, t)
            const invalid = inc && !isValid('transactions', t)
            const expense = t.type === 'expense'
            const clientOrphan = inc && t.client_name && !willClientNames.has(norm(t.client_name))
            const projectOrphan = inc && t.project_name && !willProjectNames.has(norm(t.project_name))
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('transactions', i, t, inc)}
                <div className="obrw-fields">
                  <label className="obrw-tx-field obrw-tx-type">
                    <span className="obrw-tx-lbl">סוג</span>
                    <select className="obrw-input" value={t.type || 'income'} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { type: e.target.value })}>
                      <option value="income">הכנסה</option>
                      <option value="expense">הוצאה</option>
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-tx-amount">
                    <span className="obrw-tx-lbl">סכום</span>
                    <input className="obrw-input" type="number" value={t.amount ?? ''} placeholder="סכום" disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { amount: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="obrw-tx-field obrw-tx-date">
                    <span className="obrw-tx-lbl">{t.recurring ? 'תדירות' : 'תאריך'}</span>
                    {t.recurring ? (
                      <span className="obrw-recurring" title="הוצאה חוזרת — תיווצר אוטומטית בכל חודש">🔁 חוזרת חודשית</span>
                    ) : (
                      <DateField className="obrw-input" value={t.date || ''} disabled={!inc}
                        onChange={(e) => patchRow('transactions', i, { date: e.target.value })} />
                    )}
                  </label>
                  <label className="obrw-tx-field obrw-tx-proj">
                    <span className="obrw-tx-lbl">פרויקט</span>
                    <select className="obrw-input" value={t.project_name || ''} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { project_name: e.target.value || null })}>
                      <option value="">ללא פרויקט</option>
                      {projectOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-grow">
                    <span className="obrw-tx-lbl">תיאור</span>
                    <input className="obrw-input" value={t.desc || ''} placeholder="תיאור (אופציונלי)" disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { desc: e.target.value || null })} />
                  </label>
                  {t.client_name && (
                    <span className={`obrw-link${clientOrphan ? ' muted' : ''}`} title={clientOrphan ? 'הלקוח לא ייכלל — התנועה תיווצר בלי קישור' : ''}>
                      ↪ {t.client_name}{clientOrphan ? ' (ללא קישור)' : ''}
                    </span>
                  )}
                  {invalid && <span className="obrw-invalid">חסר סכום/תאריך</span>}
                  {projectOrphan && <span className="obrw-invalid">הפרויקט לא ייווצר</span>}
                </div>
                <span className={`obrw-badge${expense ? ' expense' : ' income'}`}>
                  {expense ? '−' : '+'}{isr(Math.abs(Number(t.amount) || 0))}
                </span>
              </div>
            )
          })}

          {tab === 'sessions' && state.sessions.slice(0, visible).map((s, i) => {
            const inc = isIncluded('sessions', i, s)
            const invalid = inc && !isValid('sessions', s)
            const clientOrphan = inc && s.client_name && !willClientNames.has(norm(s.client_name))
            const opts = s.client_name && !clientOptions.includes(s.client_name)
              ? [s.client_name, ...clientOptions] : clientOptions
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('sessions', i, s, inc)}
                <div className="obrw-fields">
                  <label className="obrw-tx-field obrw-grow">
                    <span className="obrw-tx-lbl">לקוח</span>
                    <select className="obrw-input" value={s.client_name || ''} disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { client_name: e.target.value || null })}>
                      <option value="">— בחר/י לקוח</option>
                      {opts.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-tx-date">
                    <span className="obrw-tx-lbl">תאריך</span>
                    <DateField className="obrw-input" value={s.date || ''} disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { date: e.target.value })} />
                  </label>
                  <label className="obrw-tx-field obrw-grow">
                    <span className="obrw-tx-lbl">סיכום</span>
                    <input className="obrw-input" value={s.summary || ''} placeholder="סיכום (אופציונלי)" disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { summary: e.target.value || null })} />
                  </label>
                  {invalid && <span className="obrw-invalid">חסר לקוח</span>}
                  {clientOrphan && <span className="obrw-invalid">הלקוח לא ייווצר — הפגישה תידלג</span>}
                  {inc && !s.date && <span className="obrw-link muted">ללא תאריך — יוצב בתאריך משוער</span>}
                </div>
              </div>
            )
          })}

          {state[tab].length > visible && (
            <button type="button" className="obrw-more" onClick={() => setVisible((v) => v + PAGE)}>
              הצג עוד {Math.min(PAGE, state[tab].length - visible)} (מתוך {state[tab].length})
            </button>
          )}
        </div>

        <footer className="obrw-foot">
          <p className="obrw-summary">
            {mode === 'approve' ? 'יאושרו' : 'ייווצרו'}: <strong>{counts.clients}</strong> לקוחות · <strong>{counts.projects}</strong> פרויקטים
            {counts.leads > 0 && <> · <strong>{counts.leads}</strong> לידים</>}
            {' · '}<strong>{counts.transactions}</strong> תנועות
          </p>
          <div className="obrw-actions">
            <button type="button" className="ob-btn ghost" onClick={requestClose} disabled={busy}>
              חזרה
            </button>
            <button type="button" className="ob-btn primary" onClick={handleConfirm} disabled={busy}>
              {busy
                ? (mode === 'approve' ? 'שומר…' : 'יוצר…')
                : totalIncluded === 0
                  ? (mode === 'approve' ? 'אישור והמשך' : 'סיום ללא ייבוא')
                  : (mode === 'approve' ? `אישור והמשך (${totalIncluded})` : `אישור ויצירה (${totalIncluded})`)}
            </button>
          </div>
        </footer>
        </>
        )}

        {/* Dirty-close guard */}
        {confirmingClose && (
          <div className="obrw-confirm">
            <p className="obrw-confirm-txt">לצאת בלי לשמור? כל העריכות שעשית כאן יימחקו.</p>
            <div className="obrw-actions">
              <button type="button" className="ob-btn ghost" onClick={() => setConfirmingClose(false)}>הישאר</button>
              <button type="button" className="ob-btn danger" onClick={onCancel}>צא בלי לשמור</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

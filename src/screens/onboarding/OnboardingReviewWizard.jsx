import { useEffect, useMemo, useRef, useState } from 'react'
import DateField from '../../components/DateField'
import { X, Users, FolderKanban, Receipt, CalendarDays, Check, RotateCcw, Repeat, CornerDownLeft, AlertTriangle } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useLeads } from '../../hooks/useLeads'
import { isr } from '../../lib/finance'
import { useT } from '../../i18n/useT'
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

/* Turn a raw importer error into one plain-language sentence the user can
   actually act on. The importer prefixes each error with the entity +
   name ("lead \"דנה\": <db message>"); we keep that label and translate
   the common database messages. Unknown messages fall back to a generic
   but still-friendly line (never raw SQL jargon alone). `t` is the
   onboarding-namespace translator passed in from the component. */
function humanizeError(raw, t) {
  const s = String(raw || '')
  const labelMatch = s.match(/^(\w+)\s+"([^"]*)":/)
  const who = labelMatch
    ? `${t(`review.error.who.${labelMatch[1]}`, { defaultValue: '' })} "${labelMatch[2]}"`.trim()
    : ''
  const lower = s.toLowerCase()
  let why
  if (lower.includes('schema cache') || lower.includes('column')) why = t('review.error.why.schema')
  else if (lower.includes('duplicate') || lower.includes('unique')) why = t('review.error.why.duplicate')
  else if (lower.includes('violates') && lower.includes('check')) why = t('review.error.why.check')
  else if (lower.includes('foreign key')) why = t('review.error.why.foreignKey')
  else if (lower.includes('null value') || lower.includes('not-null')) why = t('review.error.why.notNull')
  else if (lower.includes('date')) why = t('review.error.why.date')
  else if (lower.includes('אין חיבור')) why = t('review.error.why.noConnection')
  else why = t('review.error.why.generic')
  return who ? t('review.error.withWho', { who, why }) : why
}

/* Default client status options offered in the review (the 4 meta
   buckets — these are the stored enum VALUES from lib/enums.js, not UI
   chrome; they round-trip to the DB so they stay verbatim). The file's
   own status text is added on top so a recognised custom status
   ("פולואפ" etc.) stays selectable. */
const CLIENT_STATUS_DEFAULTS = ['פעיל׌', 'ביניים', 'לשעבר', 'ללא סטטוס']

/* `mode`: 'create' (step 9 — actually writes the data) or 'approve'
   (step 2 — only records the user's approval; step 9 leans on it and is
   the single place data is created). The two differ only in wording; the
   confirm flow is identical (onConfirm decides whether to write). */
export default function OnboardingReviewWizard({ parsed, onConfirm, onComplete, onCancel, mode = 'create', allowSkipImport = false }) {
  const { t } = useT('onboarding')
  const { clients: existingClients, loading: clientsLoading } = useClients()
  const { projects: existingProjects, loading: projectsLoading } = useProjects()
  const { leads: existingLeads } = useLeads()
  const dataLoading = clientsLoading || projectsLoading
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [result, setResult] = useState(null) /* import summary, when shown */
  const panelRef = useRef(null)
  const stayBtnRef = useRef(null) /* dirty-close: focus the safe action when shown */
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
    { key: 'clients',      label: t('review.tabs.clients'),      icon: Users },
    { key: 'projects',     label: t('review.tabs.projects'),     icon: FolderKanban },
    { key: 'leads',        label: t('review.tabs.leads'),        icon: Users },
    { key: 'transactions', label: t('review.tabs.transactions'), icon: Receipt },
    { key: 'sessions',     label: t('review.tabs.sessions'),     icon: CalendarDays },
  ].filter((tabDef) => state[tabDef.key].length > 0)

  const [tab, setTab] = useState(TABS[0]?.key || 'clients')
  const [visible, setVisible] = useState(PAGE)
  useEffect(() => { setVisible(PAGE) }, [tab])
  /* When the dirty-close confirmation appears, move focus to its safe action. */
  useEffect(() => { if (confirmingClose) stayBtnRef.current?.focus() }, [confirmingClose])

  const requestClose = () => { if (busy) return; if (dirty) setConfirmingClose(true); else onCancel() }

  /* Focus the dialog ONCE on mount, and restore focus to whatever was
     focused before it opened when it closes (a11y: don't strand keyboard /
     screen-reader users at the top of the page). */
  const restoreFocusRef = useRef(null)
  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    panelRef.current?.focus()
    return () => { try { restoreFocusRef.current?.focus?.() } catch { /* element gone */ } }
  }, [])

  /* Escape closes (guarded by the dirty confirm); Tab is trapped inside the
     dialog so focus can't wander to the page behind it. Re-bind when the
     values requestClose reads change, so the handler never goes stale. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { requestClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const f = panel.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')
      if (!f.length) return
      const first = f[0]; const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
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

  /* "Start without importing" — finish onboarding and enter the app WITHOUT
     running the import. Keeps everything the user already set up (profile,
     projects, clients from the earlier steps); the uploaded file is simply
     not imported (they can import later from Settings → ייבוא). Only offered
     at the final step ('create'); step 2's "approve" has no creation to skip.
     Guarded by the same synchronous ref as confirm so a double-tap can't
     finish twice. */
  const handleSkipImport = async () => {
    if (busy || confirmingRef.current) return
    confirmingRef.current = true
    setBusy(true)
    try {
      await onComplete()
    } finally {
      setBusy(false)
      confirmingRef.current = false
    }
  }

  const renderToggle = (type, i, row, inc) => (
    <button type="button" className={`obrw-toggle${inc ? ' on' : ''}`} onClick={() => toggle(type, i, row)}
      aria-pressed={inc} aria-label={inc ? t('review.toggle.includedAria') : t('review.toggle.excludedAria')}>
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
    if (created.clients) parts.push(t('review.result.created.clients', { count: created.clients }))
    if (created.projects) parts.push(t('review.result.created.projects', { count: created.projects }))
    if (created.leads) parts.push(t('review.result.created.leads', { count: created.leads }))
    if (created.transactions) parts.push(t('review.result.created.transactions', { count: created.transactions }))
    if (created.recurring) parts.push(t('review.result.created.recurring', { count: created.recurring }))

    return (
      <div className="obrw-back" role="dialog" aria-modal="true" aria-label={t('review.result.dialogAria')}>
        <div className="obrw-panel" ref={panelRef} tabIndex={-1}>
          <div className="obrw-result">
            <AlertTriangle size={28} strokeWidth={1.8} className="obrw-result-icon" aria-hidden="true" />
            {result.fatal ? (
              <>
                <p className="obrw-result-title">{t('review.result.fatalTitle')}</p>
                <p className="obrw-result-txt">
                  {t('review.result.fatalBody')}
                </p>
                <p className="obrw-result-hint">{t('review.result.whatHappened', { detail: humanizeError(result.error, t) })}</p>
              </>
            ) : (
              <>
                <p className="obrw-result-title">
                  {totalCreated > 0 ? t('review.result.partialTitle') : t('review.result.noneTitle')}
                </p>
                {totalCreated > 0 && (
                  <p className="obrw-result-txt">{t('review.result.createdLine', { parts: parts.join(' · ') })}</p>
                )}
                <p className="obrw-result-txt obrw-result-fail">
                  {t('review.result.failedLine', { count: totalFailed })}
                </p>
                {result.errors?.length > 0 && (
                  <ul className="obrw-result-errs">
                    {result.errors.slice(0, 5).map((e, i) => <li key={i}>{humanizeError(e, t)}</li>)}
                    {result.errors.length > 5 && <li>{t('review.result.moreErrors', { count: result.errors.length - 5 })}</li>}
                  </ul>
                )}
                <p className="obrw-result-hint">{t('review.result.partialHint')}</p>
              </>
            )}
            <div className="obrw-actions">
              <button type="button" className="ob-btn ghost" onClick={() => setResult(null)} disabled={busy}>
                {t('review.result.backToList')}
              </button>
              <button type="button" className="ob-btn primary" onClick={onComplete} disabled={busy}>
                {t('review.result.continue')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="obrw-back" role="dialog" aria-modal="true" aria-label={t('review.dialogAria')}>
      <div className="obrw-panel" ref={panelRef} tabIndex={-1}>
        <header className="obrw-head">
          <div>
            <p className="obrw-title">{t('review.title')}</p>
            <p className="obrw-sub">{mode === 'approve'
              ? t('review.subApprove')
              : t('review.subCreate')}</p>
          </div>
          <button type="button" className="obrw-x" onClick={requestClose} aria-label={t('review.closeAria')} disabled={busy}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {dataLoading ? (
          <div className="obrw-loading">
            <img className="obrw-logo obrw-logo-day"   src="/logo-dark.png"  alt="" aria-hidden="true" />
            <img className="obrw-logo obrw-logo-night" src="/logo-light.png" alt="" aria-hidden="true" />
            <p className="obrw-loading-txt">{t('review.loading')}</p>
          </div>
        ) : (
        <>
        <div className="obrw-tabs" role="tablist">
          {TABS.map((tabDef) => {
            const Icon = tabDef.icon
            return (
              <button key={tabDef.key} type="button" role="tab" id={`obrw-tab-${tabDef.key}`}
                aria-selected={tab === tabDef.key} aria-controls="obrw-panel"
                aria-label={t('review.tabAria', { label: tabDef.label, included: counts[tabDef.key], total: state[tabDef.key].length })}
                className={`obrw-tab${tab === tabDef.key ? ' on' : ''}`} onClick={() => setTab(tabDef.key)}>
                <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                {tabDef.label}
                <span className="obrw-tab-count" aria-hidden="true">{counts[tabDef.key]}/{state[tabDef.key].length}</span>
              </button>
            )
          })}
        </div>

        <div className="obrw-bulk">
          <button type="button" className="obrw-bulk-btn" onClick={() => setAll(tab, true)}>{t('review.includeAll')}</button>
          <span className="obrw-bulk-sep">·</span>
          <button type="button" className="obrw-bulk-btn" onClick={() => setAll(tab, false)}>{t('review.clearAll')}</button>
          {tab === 'transactions' && txIssues > 0 && (
            <span className="obrw-warn">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {t('review.txIssues', { count: txIssues })}
            </span>
          )}
          {tab === 'clients' && parsed?.truncated && (
            <span className="obrw-warn">
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {t('review.truncated', { cap: parsed.row_cap, raw: parsed.raw_rows })}
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
                  <input className="obrw-input obrw-grow" value={c.name || ''} placeholder={t('review.client.namePlaceholder')} aria-label={t('review.client.nameAria')} disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { name: e.target.value })} />
                  <select className="obrw-input obrw-cl-proj" value={c.project_name || ''} title={t('review.client.projectTitle')} aria-label={t('review.client.projectTitle')} disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { project_name: e.target.value || null })}>
                    <option value="">{t('review.client.noProject')}</option>
                    {opts.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select className={`obrw-input obrw-cl-status${c.status_unsure ? ' unsure' : ''}`} value={c.status_name || ''} title={t('review.client.statusTitle')} aria-label={t('review.client.statusAria')} disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { status_name: e.target.value || null, status_unsure: false })}>
                    <option value="">{t('review.client.statusDefault')}</option>
                    {clientStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="obrw-input obrw-num" type="number" min="0" value={c.sessions ?? ''} placeholder={t('review.client.sessionsPlaceholder')} title={t('review.client.sessionsTitle')} aria-label={t('review.client.sessionsTitle')} disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { sessions: Number(e.target.value) || 0 })} />
                  <input className="obrw-input obrw-num" type="number" min="0" value={c.price_per_session ?? ''} placeholder={t('review.client.pricePlaceholder')} title={t('review.client.priceTitle')} aria-label={t('review.client.priceTitle')} disabled={!inc}
                    onChange={(e) => patchRow('clients', i, { price_per_session: Number(e.target.value) || 0 })} />
                  {invalid && <span className="obrw-invalid">{t('review.client.missingName')}</span>}
                  {c.status_unsure && inc && <span className="obrw-unsure">{t('review.client.statusUnsure')}</span>}
                  {projectOrphan && <span className="obrw-invalid">{t('review.client.projectOrphan')}</span>}
                  {Number(c.num_installments) >= 2 && <span className="obrw-plan-note">{t('review.client.planBadge', { count: Number(c.num_installments) })}</span>}
                </div>
                {exists ? <span className="obrw-badge">{t('review.badge.exists')}</span>
                  : dup ? <span className="obrw-badge dup">{t('review.badge.duplicate')}</span> : null}
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
                  <input className="obrw-input obrw-grow" value={p.name || ''} placeholder={t('review.project.namePlaceholder')} disabled={!inc}
                    onChange={(e) => patchRow('projects', i, { name: e.target.value })} />
                  {invalid && <span className="obrw-invalid">{t('review.project.missingName')}</span>}
                </div>
                {exists && <span className="obrw-badge">{t('review.badge.exists')}</span>}
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
                  <input className="obrw-input obrw-grow" value={l.name || ''} placeholder={t('review.lead.namePlaceholder')} aria-label={t('review.lead.nameAria')} disabled={!inc}
                    onChange={(e) => patchRow('leads', i, { name: e.target.value })} />
                  <input className={`obrw-input obrw-cl-proj${l.status_unsure ? ' unsure' : ''}`} value={l.status_name || ''} placeholder={t('review.lead.statusPlaceholder')} title={t('review.lead.statusTitle')} aria-label={t('review.lead.statusAria')} disabled={!inc}
                    onChange={(e) => patchRow('leads', i, { status_name: e.target.value || null, status_unsure: false })} />
                  {invalid && <span className="obrw-invalid">{t('review.lead.missingName')}</span>}
                  {l.status_unsure && inc && <span className="obrw-unsure">{t('review.lead.statusUnsure')}</span>}
                </div>
                {exists ? <span className="obrw-badge">{t('review.badge.exists')}</span>
                  : dup ? <span className="obrw-badge dup">{t('review.badge.duplicate')}</span>
                  : l.status_name ? <span className="obrw-badge">{l.status_name}</span> : null}
              </div>
            )
          })}

          {tab === 'transactions' && state.transactions.slice(0, visible).map((tx, i) => {
            const inc = isIncluded('transactions', i, tx)
            const invalid = inc && !isValid('transactions', tx)
            const expense = tx.type === 'expense'
            const clientOrphan = inc && tx.client_name && !willClientNames.has(norm(tx.client_name))
            const projectOrphan = inc && tx.project_name && !willProjectNames.has(norm(tx.project_name))
            return (
              <div className={`obrw-row${inc ? '' : ' off'}${invalid ? ' invalid' : ''}`} key={i}>
                {renderToggle('transactions', i, tx, inc)}
                <div className="obrw-fields">
                  <label className="obrw-tx-field obrw-tx-type">
                    <span className="obrw-tx-lbl">{t('review.tx.type')}</span>
                    <select className="obrw-input" value={tx.type || 'income'} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { type: e.target.value })}>
                      <option value="income">{t('review.tx.income')}</option>
                      <option value="expense">{t('review.tx.expense')}</option>
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-tx-amount">
                    <span className="obrw-tx-lbl">{t('review.tx.amount')}</span>
                    <input className="obrw-input" type="number" value={tx.amount ?? ''} placeholder={t('review.tx.amountPlaceholder')} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { amount: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="obrw-tx-field obrw-tx-date">
                    <span className="obrw-tx-lbl">{tx.recurring ? t('review.tx.frequency') : t('review.tx.date')}</span>
                    {tx.recurring ? (
                      <span className="obrw-recurring" title={t('review.tx.recurringTitle')}><Repeat size={12} strokeWidth={1.5} aria-hidden="true" /> {t('review.tx.recurringMonthly')}</span>
                    ) : (
                      <DateField className="obrw-input" value={tx.date || ''} disabled={!inc}
                        onChange={(e) => patchRow('transactions', i, { date: e.target.value })} />
                    )}
                  </label>
                  <label className="obrw-tx-field obrw-tx-proj">
                    <span className="obrw-tx-lbl">{t('review.tx.project')}</span>
                    <select className="obrw-input" value={tx.project_name || ''} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { project_name: e.target.value || null })}>
                      <option value="">{t('review.tx.noProject')}</option>
                      {projectOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-grow">
                    <span className="obrw-tx-lbl">{t('review.tx.desc')}</span>
                    <input className="obrw-input" value={tx.desc || ''} placeholder={t('review.tx.descPlaceholder')} disabled={!inc}
                      onChange={(e) => patchRow('transactions', i, { desc: e.target.value || null })} />
                  </label>
                  {tx.client_name && (
                    <span className={`obrw-link${clientOrphan ? ' muted' : ''}`} title={clientOrphan ? t('review.tx.clientOrphanTitle') : ''}>
                      <CornerDownLeft size={12} strokeWidth={1.5} aria-hidden="true" /> {tx.client_name}{clientOrphan ? ` ${t('review.tx.noLink')}` : ''}
                    </span>
                  )}
                  {invalid && <span className="obrw-invalid">{t('review.tx.invalid')}</span>}
                  {projectOrphan && <span className="obrw-invalid">{t('review.tx.projectOrphan')}</span>}
                </div>
                <span className={`obrw-badge${expense ? ' expense' : ' income'}`}>
                  {expense ? '−' : '+'}{isr(Math.abs(Number(tx.amount) || 0))}
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
                    <span className="obrw-tx-lbl">{t('review.session.client')}</span>
                    <select className="obrw-input" value={s.client_name || ''} disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { client_name: e.target.value || null })}>
                      <option value="">{t('review.session.pickClient')}</option>
                      {opts.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="obrw-tx-field obrw-tx-date">
                    <span className="obrw-tx-lbl">{t('review.session.date')}</span>
                    <DateField className="obrw-input" value={s.date || ''} disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { date: e.target.value })} />
                  </label>
                  <label className="obrw-tx-field obrw-grow">
                    <span className="obrw-tx-lbl">{t('review.session.summary')}</span>
                    <input className="obrw-input" value={s.summary || ''} placeholder={t('review.session.summaryPlaceholder')} disabled={!inc}
                      onChange={(e) => patchRow('sessions', i, { summary: e.target.value || null })} />
                  </label>
                  {invalid && <span className="obrw-invalid">{t('review.session.missingClient')}</span>}
                  {clientOrphan && <span className="obrw-invalid">{t('review.session.clientOrphan')}</span>}
                  {inc && !s.date && <span className="obrw-link muted">{t('review.session.noDate')}</span>}
                </div>
              </div>
            )
          })}

          {state[tab].length > visible && (
            <button type="button" className="obrw-more" onClick={() => setVisible((v) => v + PAGE)}>
              {t('review.loadMore', { count: Math.min(PAGE, state[tab].length - visible), total: state[tab].length })}
            </button>
          )}
        </div>

        <footer className="obrw-foot">
          <p className="obrw-summary">
            {mode === 'approve' ? t('review.summary.willApprove') : t('review.summary.willCreate')}: <strong>{counts.clients}</strong> {t('review.summary.clients')} · <strong>{counts.projects}</strong> {t('review.summary.projects')}
            {counts.leads > 0 && <> · <strong>{counts.leads}</strong> {t('review.summary.leads')}</>}
            {' · '}<strong>{counts.transactions}</strong> {t('review.summary.transactions')}
          </p>
          <div className="obrw-actions">
            <button type="button" className="ob-btn ghost" onClick={requestClose} disabled={busy}>
              {t('common.back')}
            </button>
            {allowSkipImport && (
              <button type="button" className="ob-btn ghost" onClick={handleSkipImport} disabled={busy}
                title={t('review.confirm.skipImportHint')}>
                {t('review.confirm.skipImport')}
              </button>
            )}
            <button type="button" className="ob-btn primary" onClick={handleConfirm} disabled={busy}>
              {busy
                ? (mode === 'approve' ? t('review.confirm.savingApprove') : t('review.confirm.savingCreate'))
                : totalIncluded === 0
                  ? (mode === 'approve' ? t('review.confirm.approveEmpty') : t('review.confirm.createEmpty'))
                  : (mode === 'approve' ? t('review.confirm.approve', { count: totalIncluded }) : t('review.confirm.create', { count: totalIncluded }))}
            </button>
          </div>
        </footer>
        </>
        )}

        {/* Dirty-close guard */}
        {confirmingClose && (
          <div className="obrw-confirm" role="alertdialog" aria-modal="true" aria-label={t('review.dirty.ariaLabel')}>
            <p className="obrw-confirm-txt">{t('review.dirty.text')}</p>
            <div className="obrw-actions">
              <button type="button" className="ob-btn ghost" ref={stayBtnRef} onClick={() => setConfirmingClose(false)}>{t('review.dirty.stay')}</button>
              <button type="button" className="ob-btn danger" onClick={onCancel}>{t('review.dirty.leave')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

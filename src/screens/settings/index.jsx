import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, User, LayoutGrid, Users, Target, Wallet, Sparkles, Palette, Info,
  Plus, Trash2, Leaf, GripVertical, ChevronLeft, CalendarDays, Database, Download, Upload,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { parseFile } from '../../lib/csvImport'
import ImportDataModal from '../onboarding/ImportDataModal'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useClientStatuses } from '../../hooks/useClientStatuses'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTransactions } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { useTasks } from '../../hooks/useTasks'
import { useLeads } from '../../hooks/useLeads'
import { countClientsByStatus, reassignClientsStatus } from '../../lib/api/clientStatuses'
import { countLeadsByStatus, reassignLeadsStatus } from '../../lib/api/leadStatuses'
import DeleteSubStatusModal from '../../modals/DeleteSubStatusModal'
import ResetAccountModal from '../../modals/ResetAccountModal'
import { resetAllUserData } from '../../lib/api/account'
import {
  ROLE_LABELS, CURRENCY_OPTIONS, DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, WEEK_START_OPTIONS,
  TEXT_SIZE_OPTIONS, GENDER_OPTIONS, WIDGET_REGISTRY, ACCENT_OPTIONS,
  CARD_STYLE_OPTIONS, TEXT_STRENGTH_OPTIONS, DENSITY_OPTIONS,
} from '../../lib/preferences'
import { questionText, describeSchedule } from '../../lib/questionTemplates'
import { exportTransactionsCSV, exportClientsCSV, exportProjectsCSV } from '../../lib/export'
import { defaultOnboarding } from '../../lib/preferences'
import AddQuestionModal from '../../modals/AddQuestionModal'
import QuestionScheduleEditor from './QuestionScheduleEditor'
import './SettingsScreen.css'

const SECTIONS = [
  { key: 'profile', title: 'פרופיל', icon: User, sub: 'שם, תפקיד והתמחות' },
  { key: 'widgets', title: 'ווידג׳טים ותצוגה', icon: LayoutGrid, sub: 'מה מופיע במסך הבית' },
  { key: 'clients', title: 'לקוחות וסטטוסים', icon: Users, sub: 'תתי-סטטוסים מותאמים אישית' },
  { key: 'goals', title: 'יעדים וקטגוריות', icon: Target, sub: 'קטגוריות מדידה' },
  { key: 'payments', title: 'תשלומים ומטבע', icon: Wallet, sub: 'מטבע ופורמט סכומים' },
  { key: 'questions', title: 'שאלות יומיות', icon: Sparkles, sub: 'מה נשאל בכל יום' },
  { key: 'leads', title: 'הגדרות לידים', icon: Leaf, sub: 'מקורות וסטטוסים' },
  { key: 'design', title: 'עיצוב', icon: Palette, sub: 'מצב יום/לילה, גודל טקסט' },
  { key: 'data', title: 'נתונים', icon: Database, sub: 'ייצוא, יבוא, איפוס' },
  { key: 'about', title: 'אודות', icon: Info, sub: 'גרסה ומידע' },
]

const CLIENT_METAS = [
  { k: 'active', l: 'פעיל' },
  { k: 'wandering', l: 'ביניים' },
  { k: 'past', l: 'לשעבר' },
  { k: 'no_status', l: 'ללא סטטוס' },
]
const LEAD_METAS = [
  { k: 'in_process', l: 'בתהליך' },
  { k: 'converted', l: 'הומר' },
  { k: 'not_relevant', l: 'לא רלוונטי' },
  { k: 'ghost', l: 'רפאים' },
]

/* ── Segmented control ────────────────────────────────────────────
   Compact horizontal pill group. Used by payments + design. */
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="m-field">
      <label className="m-label">{label}</label>
      <div className="set-seg" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            className={`set-seg-btn${value === o.v ? ' on' : ''}`}
            onClick={() => onChange(o.v)}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Payments + currency body ────────────────────────────────────
   Persists to prefs.format. Currency is also surfaced to module-level
   state (lib/finance) via PrefsApplier so isr() picks it up app-wide. */
function PaymentsBody({ prefs, onUpdate }) {
  const f = prefs?.format || {}
  const setVal = (k) => (v) => onUpdate({ format: { [k]: v } })
  return (
    <div className="set-profile-body">
      <Segmented label="מטבע" value={f.currency || 'ILS'} options={CURRENCY_OPTIONS} onChange={setVal('currency')} />
      <Segmented label="פורמט תאריך" value={f.date_format || 'DD/MM/YY'} options={DATE_FORMAT_OPTIONS} onChange={setVal('date_format')} />
      <Segmented label="פורמט שעה" value={f.time_format || '24h'} options={TIME_FORMAT_OPTIONS} onChange={setVal('time_format')} />
      <Segmented label="יום ראשון בשבוע" value={f.week_start || 'sunday'} options={WEEK_START_OPTIONS} onChange={setVal('week_start')} />
    </div>
  )
}

/* ── Widgets body ────────────────────────────────────────────────
   Per-widget controls: enabled, accent, compact (when supported),
   density override. Globals + reorder live in WidgetsGlobals below. */
function WidgetsBody({ prefs, onUpdate }) {
  const cfg = prefs?.widgets || {}
  const list = cfg.list || []
  const global = cfg.global || {}
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)

  const updateWidget = (id, patch) => {
    const next = list.map((w) => (w.id === id ? { ...w, ...patch } : w))
    onUpdate({ widgets: { list: next } })
  }
  const setGlobal = (k) => (v) => {
    onUpdate({ widgets: { global: { [k]: v } } })
  }
  const reorder = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    const fromIdx = list.findIndex((w) => w.id === fromId)
    if (fromIdx < 0) return
    const next = [...list]
    const [item] = next.splice(fromIdx, 1)
    if (toId == null) next.push(item)
    else {
      const toIdx = next.findIndex((w) => w.id === toId)
      if (toIdx < 0) next.push(item)
      else next.splice(toIdx, 0, item)
    }
    onUpdate({ widgets: { list: next } })
  }
  const handleDragStart = (e, id) => {
    setDraggingId(id)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) } catch { /* noop */ }
  }
  const handleDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== overId) setOverId(id)
  }
  const handleDrop = (e, id) => {
    e.preventDefault()
    if (draggingId && draggingId !== id) reorder(draggingId, id)
    setDraggingId(null)
    setOverId(null)
  }
  const handleDragEnd = () => { setDraggingId(null); setOverId(null) }

  return (
    <div className="set-w-body">
      <p className="set-sub-h">תצוגה גלובלית</p>
      <Segmented label="סגנון כרטיסים" value={global.cardStyle || 'frosted'} options={CARD_STYLE_OPTIONS} onChange={setGlobal('cardStyle')} />
      <Segmented label="עוצמת טקסט" value={global.textStrength || 'normal'} options={TEXT_STRENGTH_OPTIONS} onChange={setGlobal('textStrength')} />
      <Segmented label="צפיפות" value={global.density || 'comfortable'} options={DENSITY_OPTIONS} onChange={setGlobal('density')} />

      <p className="set-sub-h" style={{ marginTop: 8 }}>ווידג׳טים</p>
      <div className="set-w-list">
        {list.map((w) => {
          const reg = WIDGET_REGISTRY.find((r) => r.id === w.id)
          if (!reg) return null
          return (
            <WidgetRow
              key={w.id}
              cfg={w}
              reg={reg}
              onUpdate={(p) => updateWidget(w.id, p)}
              dragging={draggingId === w.id}
              over={overId === w.id}
              onDragStart={(e) => handleDragStart(e, w.id)}
              onDragOver={(e) => handleDragOver(e, w.id)}
              onDrop={(e) => handleDrop(e, w.id)}
              onDragEnd={handleDragEnd}
            />
          )
        })}
      </div>
    </div>
  )
}

function WidgetRow({ cfg, reg, onUpdate, dragging, over, onDragStart, onDragOver, onDrop, onDragEnd }) {
  return (
    <div
      className={`set-w-row${cfg.enabled ? '' : ' off'}${dragging ? ' dragging' : ''}${over ? ' over' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="set-w-row-head">
        <span className="set-w-grip" aria-hidden="true">
          <GripVertical size={14} strokeWidth={1.5} />
        </span>
        <span className="set-w-row-name">{reg.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.enabled}
          className={`set-w-toggle${cfg.enabled ? ' on' : ''}`}
          aria-label={`${reg.label} — ${cfg.enabled ? 'כיבוי' : 'הפעלה'}`}
          onClick={() => onUpdate({ enabled: !cfg.enabled })}
        >
          <span className="set-w-toggle-knob" />
        </button>
      </div>
      {cfg.enabled && (
        <div className="set-w-row-ctrls">
          <div className="set-w-accents" role="radiogroup" aria-label="צבע מבטא">
            {ACCENT_OPTIONS.map((a) => (
              <button
                key={a.v}
                type="button"
                role="radio"
                aria-checked={cfg.accent === a.v}
                aria-label={`צבע ${a.l}`}
                title={a.l}
                className={`set-w-accent${cfg.accent === a.v ? ' on' : ''}`}
                style={{ background: a.color }}
                onClick={() => onUpdate({ accent: a.v })}
              />
            ))}
          </div>
          {reg.supportsCompact && (
            <button
              type="button"
              className={`set-w-chip${cfg.compact ? ' on' : ''}`}
              onClick={() => onUpdate({ compact: !cfg.compact })}
            >קומפקטי</button>
          )}
          <div className="set-w-density">
            {[
              { v: null,         l: 'גלובלי' },
              { v: 'compact',     l: 'צפוף' },
              { v: 'comfortable', l: 'רגיל' },
              { v: 'spacious',    l: 'מרווח' },
            ].map((d) => (
              <button
                key={d.v ?? 'global'}
                type="button"
                className={`set-w-chip${(cfg.density ?? null) === d.v ? ' on' : ''}`}
                onClick={() => onUpdate({ density: d.v })}
              >{d.l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Design body ─────────────────────────────────────────────────
   Theme + text size + grammatical gender. PrefsApplier picks up the
   change and pushes it to <html> attributes app-wide. */
const THEME_OPTIONS = [
  { v: 'light', l: 'יום' },
  { v: 'dark',  l: 'לילה' },
]

function DesignBody({ prefs, onUpdate }) {
  const d = prefs?.design || {}
  const setVal = (k) => (v) => onUpdate({ design: { [k]: v } })
  return (
    <div className="set-profile-body">
      <Segmented label="מצב יום/לילה" value={d.theme || 'light'} options={THEME_OPTIONS} onChange={setVal('theme')} />
      <Segmented label="גודל טקסט" value={d.text_size || 'normal'} options={TEXT_SIZE_OPTIONS} onChange={setVal('text_size')} />
      <Segmented label="פנייה" value={d.gender || 'neutral'} options={GENDER_OPTIONS} onChange={setVal('gender')} />
    </div>
  )
}

/* ── About body ──────────────────────────────────────────────────
   Static section: app identity, version, credits. */
const APP_VERSION = '0.1.0'
function AboutBody() {
  return (
    <div className="set-about">
      <p className="set-about-name">Simplicity</p>
      <p className="set-about-tag">Practice OS — לקצב הטיפוח שלך</p>
      <div className="set-about-meta">
        <span>גרסה {APP_VERSION}</span>
        <span className="set-about-dot">·</span>
        <span>2026</span>
      </div>
      <p className="set-about-credit">נבנה בעבודה משותפת עם Claude.</p>
    </div>
  )
}

/* ── Profile body ────────────────────────────────────────────────
   Editable name + role pills + gender + role_other custom panel.
   Saves on blur (name / role_other) / click (role / gender). */
function ProfileBody({ prefs, onUpdate }) {
  const [name, setName] = useState(prefs?.profile?.full_name || '')
  const role = prefs?.profile?.role || 'other'
  const [roleOther, setRoleOther] = useState(prefs?.profile?.role_other || '')
  const [savedName, setSavedName] = useState(false)
  const [savedRoleOther, setSavedRoleOther] = useState(false)
  const gender = prefs?.design?.gender || 'neutral'
  const ROLES = Object.entries(ROLE_LABELS)
  const GENDERS = [
    { k: 'female',  l: 'נקבה' },
    { k: 'male',    l: 'זכר' },
    { k: 'neutral', l: 'נייטרלי' },
  ]

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed === (prefs?.profile?.full_name || '')) return
    onUpdate({ profile: { full_name: trimmed } })
    setSavedName(true)
  }
  const commitRoleOther = () => {
    const trimmed = roleOther.trim()
    if (trimmed === (prefs?.profile?.role_other || '')) return
    onUpdate({ profile: { role_other: trimmed } })
    setSavedRoleOther(true)
  }

  /* Safety net: blur usually commits, but if the section is collapsed
     (which unmounts this body) before a blur fires, the in-flight edit
     would be lost. Commit any pending change on unmount. Refs hold the
     latest typed + persisted values so the cleanup sees fresh data. */
  const liveRef = useRef({ name, roleOther, savedName: prefs?.profile?.full_name || '', savedRole: prefs?.profile?.role_other || '' })
  /* Keep the ref synced AFTER each render (never during render). */
  useEffect(() => {
    liveRef.current = { name, roleOther, savedName: prefs?.profile?.full_name || '', savedRole: prefs?.profile?.role_other || '' }
  })
  useEffect(() => () => {
    const { name: n, roleOther: ro, savedName: sn, savedRole: sr } = liveRef.current
    if (n.trim() !== sn) onUpdate({ profile: { full_name: n.trim() } })
    if (ro.trim() !== sr) onUpdate({ profile: { role_other: ro.trim() } })
  }, [onUpdate])
  const pickRole = (k) => {
    if (k === role) return
    onUpdate({ profile: { role: k, role_other: k === 'other' ? roleOther : '' } })
  }
  const pickGender = (g) => {
    if (g === gender) return
    onUpdate({ design: { gender: g } })
  }

  return (
    <div className="set-profile-body">
      <div className="m-field">
        <label className="m-label">שם מלא {savedName && <span style={{ color: 'var(--sage)', fontWeight: 600 }}>· נשמר</span>}</label>
        <input
          className="m-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setSavedName(false) }}
          onBlur={commitName}
          placeholder="איך תרצה/י שאקרא לך?"
        />
      </div>
      <div className="m-field">
        <label className="m-label">לשון פנייה</label>
        <div className="m-pills">
          {GENDERS.map((g) => (
            <button key={g.k} type="button" className={`m-pill${gender === g.k ? ' on' : ''}`} onClick={() => pickGender(g.k)}>{g.l}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">תפקיד</label>
        <div className="m-pills">
          {ROLES.map(([k, l]) => (
            <button key={k} type="button" className={`m-pill${role === k ? ' on' : ''}`} onClick={() => pickRole(k)}>{l}</button>
          ))}
        </div>
      </div>
      {role === 'other' && (
        <div className="m-field set-role-other">
          <label className="m-label">פרט/י את התחום {savedRoleOther && <span style={{ color: 'var(--sage)', fontWeight: 600 }}>· נשמר</span>}</label>
          <input
            className="m-input"
            value={roleOther}
            onChange={(e) => { setRoleOther(e.target.value); setSavedRoleOther(false) }}
            onBlur={commitRoleOther}
            placeholder="לדוגמה: יוגה תרפיסט/ית, מורה למתמטיקה"
          />
        </div>
      )}
    </div>
  )
}

/* Render a meta-grouped sub-status list with an inline add row per meta.
   Used for both client_statuses and lead_statuses. */
function StatusGroups({ metas, statuses, drafts, setDraft, onAdd, onRemove, loading, error }) {
  const [addError, setAddError] = useState(null)
  if (loading) {
    return <div className="set-sub"><p className="set-sub-empty">טוען…</p></div>
  }
  return (
    <div className="set-sub">
      {error && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>שגיאה בטעינה: {error}</p>}
      {metas.map((m) => {
        const list = statuses.filter((s) => s.meta_category === m.k)
        const draft = drafts[m.k] || ''
        const submit = async () => {
          const name = draft.trim()
          if (!name) return
          try {
            await onAdd({ meta_category: m.k, display_name: name, icon: null, is_default: false })
            setDraft(m.k, '')
            setAddError(null)
          } catch (e) {
            setAddError(e?.message || 'ההוספה נכשלה — נסה/י שוב.')
          }
        }
        return (
          <div key={m.k} className="set-sub-group">
            <p className="set-sub-meta">{m.l}</p>
            {list.length === 0 && <p className="set-sub-empty">—</p>}
            {list.map((s) => (
              <div key={s.id} className="set-q-row">
                <span className="set-q-icon" style={s.color ? { color: s.color } : undefined}>{s.icon || '•'}</span>
                <span className="set-q-text">{s.display_name}</span>
                <button type="button" className="set-q-del" onClick={() => onRemove(s, list)} aria-label="מחיקה">
                  <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="set-sub-add">
              <input
                className="m-input"
                value={draft}
                onChange={(e) => setDraft(m.k, e.target.value)}
                placeholder={`תת-סטטוס ל"${m.l}"`}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              />
              <button type="button" className="set-q-add" onClick={submit} disabled={!draft.trim()}>
                <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })}
      {addError && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{addError}</p>}
    </div>
  )
}

export default function SettingsScreen() {
  const [open, setOpen] = useState('profile')
  const [showAddQ, setShowAddQ] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [sourceError, setSourceError] = useState(null)
  const [clientDrafts, setClientDrafts] = useState({})
  const [leadDrafts, setLeadDrafts] = useState({})
  const [editingScheduleId, setEditingScheduleId] = useState(null)
  const { questions, loading: questionsLoading, error: questionsError, addQuestion, toggleActive, updateQuestion, removeQuestion } = useUserQuestions()
  const { sources, loading: sourcesLoading, error: sourcesError, addSource, removeSource } = useLeadSources()
  const { statuses: clientStatuses, loading: clientStatusesLoading, error: clientStatusesError, addStatus: addClientStatus, removeStatus: removeClientStatus } = useClientStatuses()
  const { statuses: leadStatuses, loading: leadStatusesLoading, error: leadStatusesError, addStatus: addLeadStatus, removeStatus: removeLeadStatus } = useLeadStatuses()
  const { prefs, loading: prefsLoading, update: updatePrefs } = useUserPreferences()
  /* Data-section hooks — pulled lazily-ish: useClients/etc. all use a
     single network round-trip on mount, so this isn't expensive. */
  const { clients: dataClients, refetch: refetchClients } = useClients()
  const { projects: dataProjects, refetch: refetchProjects } = useProjects()
  const { transactions: dataTransactions, refetch: refetchTransactions } = useTransactions()
  const { categories: dataCategories } = useCategories()
  const { tasks: dataTasks } = useTasks()
  const { leads: dataLeads } = useLeads()
  const [pendingDelete, setPendingDelete] = useState(null)  /* { kind, status, peers } | null */
  const [showReset, setShowReset] = useState(false)
  /* Full account wipe → then restart onboarding so the user lands on a
     clean first-run experience. */
  const onResetAccount = async () => {
    /* Best-effort wipe: resetAllUserData() continues through every table
       and is idempotent (safe to retry). Reset onboarding REGARDLESS, in
       `finally`, so a partial failure can never strand the user in a
       half-emptied app with onboarding still "done" — they always land
       back in the clean first-run flow. A wipe error still propagates to
       the modal so the user is told something didn't delete. */
    try {
      await resetAllUserData()
    } finally {
      await updatePrefs({ onboarding: defaultOnboarding() })
      navigate(ROUTES.ONBOARDING)
    }
  }
  /* CSV import (Settings → data). Pick a file → parse → open the
     mapping+review modal (reused from onboarding). */
  const importFileRef = useRef(null)
  const [importParsed, setImportParsed] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const onPickImport = async (file) => {
    if (!file) return
    setImportMsg('')
    try {
      const parsed = await parseFile(file)
      setImportParsed({ kind: 'csv', ...parsed })
    } catch {
      setImportMsg('הקובץ לא נקרא — ודא/י שזה CSV או Excel תקין.')
    }
  }
  const onImported = (summary) => {
    refetchClients?.(); refetchProjects?.(); refetchTransactions?.()
    if (summary) {
      const c = summary.clients?.created || 0
      const p = summary.projects?.created || 0
      const t = summary.transactions?.created || 0
      setImportMsg(
        c + p + t === 0
          ? 'לא נוצרו רשומות חדשות (ייתכן שכבר היו קיימות).'
          : `יובאו בהצלחה: ${c} לקוחות · ${p} פרויקטים · ${t} תנועות.`,
      )
    }
  }
  const navigate = useNavigate()
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key))

  const setClientDraft = (k, v) => setClientDrafts((d) => ({ ...d, [k]: v }))
  const setLeadDraft = (k, v) => setLeadDrafts((d) => ({ ...d, [k]: v }))

  const renderBody = (key) => {
    if (key === 'profile') {
      if (prefsLoading) return <p className="set-soon">טוען…</p>
      return <ProfileBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'payments') {
      if (prefsLoading) return <p className="set-soon">טוען…</p>
      return <PaymentsBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'design') {
      if (prefsLoading) return <p className="set-soon">טוען…</p>
      return <DesignBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'about') {
      return <AboutBody />
    }
    if (key === 'widgets') {
      if (prefsLoading) return <p className="set-soon">טוען…</p>
      return <WidgetsBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'goals') {
      return (
        <div className="set-profile-body">
          <p className="set-shortcut-hint">קטגוריות המדידה מנוהלות במסך היעדים — שם רואים את התרומה של כל קטגוריה לציון הירח.</p>
          <button type="button" className="set-shortcut-btn" onClick={() => navigate(ROUTES.GOALS)}>
            לניהול קטגוריות
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      )
    }
    if (key === 'questions') {
      const reminderPref = prefs?.insightsReminder || { enabled: false, time: '20:00' }
      const setReminder = (patch) => updatePrefs?.({ insightsReminder: { ...reminderPref, ...patch } })
      return (
        <div className="set-q">
          {questionsLoading ? (
            <p className="set-q-empty">טוען…</p>
          ) : questionsError ? (
            <p className="set-q-empty" style={{ color: 'var(--clay)' }}>שגיאה בטעינת השאלות: {questionsError}</p>
          ) : questions.length === 0 ? (
            <p className="set-q-empty">עדיין אין שאלות יומיות. הוסף/י את הראשונה.</p>
          ) : (
            questions.map((q) => (
              <div key={q.id} className={`set-q-block${q.active ? '' : ' off'}`}>
                <div className={`set-q-row`}>
                  <span className="set-q-icon">{q.icon || '🫧'}</span>
                  <span className="set-q-text">{questionText(q)}</span>
                  <button
                    type="button"
                    className="set-q-sched"
                    onClick={() => setEditingScheduleId(editingScheduleId === q.id ? null : q.id)}
                    aria-expanded={editingScheduleId === q.id}
                  >
                    <CalendarDays size={11} strokeWidth={1.7} aria-hidden="true" />
                    {describeSchedule(q)}
                  </button>
                  <button
                    type="button"
                    className={`set-q-toggle${q.active ? ' on' : ''}`}
                    onClick={() => toggleActive(q)}
                    aria-pressed={q.active}
                  >{q.active ? 'פעילה' : 'כבויה'}</button>
                  <button type="button" className="set-q-del" onClick={() => removeQuestion(q.id)} aria-label="מחיקת שאלה">
                    <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </div>
                {editingScheduleId === q.id && (
                  <QuestionScheduleEditor
                    question={q}
                    onClose={() => setEditingScheduleId(null)}
                    onUpdate={updateQuestion}
                  />
                )}
              </div>
            ))
          )}
          <button type="button" className="set-q-add" onClick={() => setShowAddQ(true)}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" /> הוסף שאלה
          </button>

          <div className="set-sub-divider" />
          <p className="set-sub-h">תזכורת יומית</p>
          <div className="set-reminder-row">
            <label className="set-reminder-toggle">
              <input
                type="checkbox"
                checked={!!reminderPref.enabled}
                onChange={(e) => setReminder({ enabled: e.target.checked })}
              />
              <span>תזכיר/י לי לענות אם לא ענית עד</span>
            </label>
            <input
              type="time"
              className="m-input set-reminder-time"
              value={reminderPref.time || '20:00'}
              onChange={(e) => setReminder({ time: e.target.value })}
              disabled={!reminderPref.enabled}
            />
          </div>
          <p className="set-reminder-hint">
            ההעדפה נשמרת. ההתראה עצמה (push בדפדפן) תופעל בעדכון הבא.
          </p>
        </div>
      )
    }
    if (key === 'data') {
      const txAll = (dataTransactions || []).filter((t) => !t.deleted_at)
      const exportAll = () => exportTransactionsCSV({
        transactions: txAll,
        clients: dataClients,
        projects: dataProjects,
        categories: dataCategories,
        monthDate: new Date(),
      })
      const exportClients = () => exportClientsCSV({ clients: dataClients, projects: dataProjects, now: new Date() })
      const exportProjects = () => exportProjectsCSV({ projects: dataProjects, now: new Date() })
      const counts = [
        { l: 'לקוחות', n: dataClients?.length || 0 },
        { l: 'תנועות', n: txAll.length },
        { l: 'לידים',  n: dataLeads?.length || 0 },
        { l: 'משימות', n: dataTasks?.length || 0 },
        { l: 'פרויקטים', n: dataProjects?.length || 0 },
        { l: 'קטגוריות', n: dataCategories?.length || 0 },
      ]
      return (
        <div className="set-data">
          <p className="set-sub-intro">סיכום מצב הנתונים שלך, ייצוא וייבוא מקובץ CSV / Excel.</p>
          <div className="set-data-stats">
            {counts.map((c) => (
              <div key={c.l} className="set-data-stat">
                <p className="set-data-stat-v mono">{c.n}</p>
                <p className="set-data-stat-l">{c.l}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="set-data-action"
            onClick={exportAll}
            disabled={txAll.length === 0}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            ייצוא תנועות לקובץ CSV
          </button>
          <p className="set-data-hint">
            הקובץ כולל את כל התנועות (כולל ממתינות ודולגו) עם עמודות תאריך, סוג, סכום, תיאור, סטטוס, לקוח, פרויקט, קטגוריה.
          </p>

          <button
            type="button"
            className="set-data-action"
            onClick={exportClients}
            disabled={(dataClients?.length || 0) === 0}
            style={{ marginTop: 10 }}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            ייצוא לקוחות לקובץ CSV
          </button>
          <button
            type="button"
            className="set-data-action"
            onClick={exportProjects}
            disabled={(dataProjects?.length || 0) === 0}
            style={{ marginTop: 10 }}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            ייצוא פרויקטים לקובץ CSV
          </button>
          <p className="set-data-hint">
            קבצי הלקוחות והפרויקטים נשמרים בפורמט שניתן לייבא בחזרה (אותן כותרות שהמערכת מזהה).
          </p>

          <input
            ref={importFileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => { onPickImport(e.target.files?.[0]); e.target.value = '' }}
          />
          <button
            type="button"
            className="set-data-action"
            onClick={() => importFileRef.current?.click()}
            style={{ marginTop: 10 }}
          >
            <Upload size={15} strokeWidth={1.7} aria-hidden="true" />
            ייבוא מקובץ (CSV / Excel)
          </button>
          <p className="set-data-hint">
            תומך ב-CSV, TSV ו-Excel. מזהה אוטומטית עמודות (שם, טלפון, מייל, פרויקט, סכום, תאריך ועוד), נותן להתאים ידנית, ולסקור כל שורה לפני שנכתבת.
          </p>
          {importMsg && (
            <p className="set-data-hint" style={{ color: 'var(--sage)', fontWeight: 600 }}>{importMsg}</p>
          )}

          <button
            type="button"
            className="set-data-action"
            onClick={async () => {
              if (!window.confirm('להתחיל מחדש את ההכרות? הצעדים יחזרו לאפס — הנתונים שכבר נוצרו (לקוחות, פרויקטים וכו\') יישארו.')) return
              await updatePrefs({ onboarding: defaultOnboarding() })
              navigate(ROUTES.ONBOARDING)
            }}
            style={{ marginTop: 10 }}
          >
            <Sparkles size={15} strokeWidth={1.7} aria-hidden="true" />
            התחל מחדש את ההכרות
          </button>
          <p className="set-data-hint">
            פותח את אשף ההכרות מהצעד הראשון. נוח לחזור אם דילגת באמצע.
          </p>

          <div className="set-danger-zone">
            <p className="set-danger-title">איפוס חשבון</p>
            <button
              type="button"
              className="set-data-action danger"
              onClick={() => setShowReset(true)}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" />
              מחיקת כל הנתונים והתחלה מאפס
            </button>
            <p className="set-data-hint">
              מוחק את כל הנתונים בחשבון (לקוחות, פרויקטים, לידים, תנועות, יעדים, תזכורות ועוד) ומתחיל את ההכרות מחדש. הפעולה דורשת אישור כפול ואי אפשר לבטל אותה.
            </p>
          </div>
        </div>
      )
    }
    if (key === 'clients') {
      return (
        <StatusGroups
          metas={CLIENT_METAS}
          statuses={clientStatuses}
          drafts={clientDrafts}
          setDraft={setClientDraft}
          onAdd={addClientStatus}
          onRemove={(status, peers) => setPendingDelete({ kind: 'client', status, peers })}
          loading={clientStatusesLoading}
          error={clientStatusesError}
        />
      )
    }
    if (key === 'leads') {
      const submitNewSource = async () => {
        const v = newSourceName.trim()
        if (!v) return
        try {
          await addSource({ name: v, color: '#0e9888' })
          setNewSourceName('')
          setSourceError(null)
        } catch (e) {
          setSourceError(e?.message || 'הוספת המקור נכשלה — נסה/י שוב.')
        }
      }
      return (
        <div className="set-q">
          <p className="set-sub-h">מקורות פנייה</p>
          {sourcesLoading ? (
            <p className="set-sub-empty">טוען…</p>
          ) : sourcesError ? (
            <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>שגיאה בטעינת המקורות: {sourcesError}</p>
          ) : sources.length === 0 ? (
            <p className="set-sub-empty">עדיין אין מקורות. הוסף/י את הראשון.</p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="set-q-row">
                <span className="set-q-icon" style={{ color: s.color }}>●</span>
                <span className="set-q-text">{s.name}</span>
                <button type="button" className="set-q-del" onClick={() => removeSource(s.id)} aria-label="מחיקת מקור">
                  <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            ))
          )}
          <div className="set-sub-add">
            <input
              className="m-input"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="שם מקור חדש"
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewSource() }}
            />
            <button type="button" className="set-q-add" onClick={submitNewSource} disabled={!newSourceName.trim()}>
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          {sourceError && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{sourceError}</p>}

          <p className="set-sub-h" style={{ marginTop: 14 }}>תתי-סטטוסים</p>
          <StatusGroups
            metas={LEAD_METAS}
            statuses={leadStatuses}
            drafts={leadDrafts}
            setDraft={setLeadDraft}
            onAdd={addLeadStatus}
            onRemove={(status, peers) => setPendingDelete({ kind: 'lead', status, peers })}
            loading={leadStatusesLoading}
            error={leadStatusesError}
          />
        </div>
      )
    }
    return <p className="set-soon">ההגדרות יתווספו בהמשך.</p>
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{SECTIONS.length} אזורים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">התאמה אישית</p>
            </div>
            <p className="lbl-sm">ברירות מחדל טובות, גמישות מלאה.</p>
          </div>
          <p className="t-screen">הגדרות</p>
        </header>
      </div>

      <div className="set-list">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isOpen = open === s.key
          return (
            <div key={s.key} className={`set-acc${isOpen ? ' open' : ''}`}>
              <button type="button" className="set-acc-head" onClick={() => toggle(s.key)} aria-expanded={isOpen}>
                <span className="set-acc-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className="set-acc-text">
                  <span className="set-acc-title">{s.title}</span>
                  <span className="set-acc-sub">{s.sub}</span>
                </span>
                <ChevronDown size={18} strokeWidth={1.6} className="set-acc-chev" aria-hidden="true" />
              </button>
              {isOpen && <div className="set-acc-body">{renderBody(s.key)}</div>}
            </div>
          )
        })}
      </div>

      <AddQuestionModal
        open={showAddQ}
        onClose={() => setShowAddQ(false)}
        nextOrder={questions.length}
        onSave={addQuestion}
      />

      <DeleteSubStatusModal
        key={pendingDelete?.status?.id || 'none'}
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        status={pendingDelete?.status}
        peers={pendingDelete?.peers || []}
        onCount={pendingDelete?.kind === 'lead' ? countLeadsByStatus : countClientsByStatus}
        onReassign={pendingDelete?.kind === 'lead' ? reassignLeadsStatus : reassignClientsStatus}
        onDelete={pendingDelete?.kind === 'lead' ? removeLeadStatus : removeClientStatus}
      />

      {importParsed && (
        <ImportDataModal
          parsed={importParsed}
          onClose={() => setImportParsed(null)}
          onImported={onImported}
        />
      )}

      <ResetAccountModal
        open={showReset}
        onClose={() => setShowReset(false)}
        onConfirm={onResetAccount}
      />
    </div>
  )
}

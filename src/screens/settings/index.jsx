import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, User, LayoutGrid, Users, Target, Wallet, Sparkles, Palette, Info,
  Plus, Trash2, Leaf, GripVertical, CalendarDays, Database, Download, Upload,
  BookOpen, HelpCircle, Lightbulb, Eye, Layers, Gem,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { buildSheetsFromFiles, ACCEPT } from '../../lib/importFlow'
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
import { useGoals } from '../../hooks/useGoals'
import { countClientsByStatus, reassignClientsStatus, reassignClientsStatusByIds, restoreClientStatus } from '../../lib/api/clientStatuses'
import { countLeadsByStatus, reassignLeadsStatus, reassignLeadsStatusByIds, restoreLeadStatus } from '../../lib/api/leadStatuses'
import { pushUndo } from '../../lib/undo'
import { MeetingTypesManager } from '../../modals/MeetingTypesModal'
import DeleteSubStatusModal from '../../modals/DeleteSubStatusModal'
import ResetAccountModal from '../../modals/ResetAccountModal'
import ConfirmModal from '../../modals/ConfirmModal'
import DeleteAccountModal from '../../modals/DeleteAccountModal'
import { resetAllUserData, buildAccountDeletionRequest } from '../../lib/api/account'
import {
  ROLE_LABELS, roleLabel, CURRENCY_OPTIONS, DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, WEEK_START_OPTIONS,
  TEXT_SIZE_OPTIONS, WIDGET_REGISTRY,
  CARD_STYLE_OPTIONS, TEXT_STRENGTH_OPTIONS, DENSITY_OPTIONS,
} from '../../lib/preferences'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { useT } from '../../i18n/useT'
import { LANGUAGE_OPTIONS } from '../../i18n/config'
import { questionText, describeSchedule } from '../../lib/questionTemplates'
import { exportTransactionsCSV, exportClientsCSV, exportProjectsCSV, exportAllXLSX } from '../../lib/export'
import { loadSensitiveExportData } from '../../lib/exportSensitive'
import ExportDataModal from '../../modals/ExportDataModal'
import { defaultOnboarding } from '../../lib/preferences'
import AddQuestionModal from '../../modals/AddQuestionModal'
import QuestionScheduleEditor from './QuestionScheduleEditor'
import SubscriptionBody from './SubscriptionBody'
import { BILLING_ENABLED } from '../../lib/subscription'
import { getHelpScreen, getGlobalFaq, getAboutContent } from '../../lib/helpContent'
import MG from '../../components/MG'
import './SettingsScreen.css'

/* Section identity (key + icon). Titles + subtitles are translated at
   render time via t(`sections.${key}.title` / `.sub`). */
const SECTION_DEFS = {
  profile: { key: 'profile', icon: User, titleKey: 'sections.profile.title', subKey: 'sections.profile.sub' },
  subscription: { key: 'subscription', icon: Gem, titleKey: 'sections.subscription.title', subKey: 'sections.subscription.sub' },
  widgets: { key: 'widgets', icon: LayoutGrid, titleKey: 'sections.widgets.title', subKey: 'sections.widgets.sub' },
  clients: { key: 'clients', icon: Users, titleKey: 'sections.clients.title', subKey: 'sections.clients.sub' },
  payments: { key: 'payments', icon: Wallet, titleKey: 'sections.payments.title', subKey: 'sections.payments.sub' },
  questions: { key: 'questions', icon: Sparkles, titleKey: 'sections.questions.title', subKey: 'sections.questions.sub' },
  leads: { key: 'leads', icon: Leaf, titleKey: 'sections.leads.title', subKey: 'sections.leads.sub' },
  design: { key: 'design', icon: Palette, titleKey: 'sections.design.title', subKey: 'sections.design.sub' },
  data: { key: 'data', icon: Database, titleKey: 'sections.data.title', subKey: 'sections.data.sub' },
  about: { key: 'about', icon: Info, titleKey: 'sections.about.title', subKey: 'sections.about.sub' },
}

const SECTION_GROUPS = [
  {
    key: 'personal',
    icon: User,
    titleKey: 'groups.personal.title',
    subKey: 'groups.personal.sub',
    /* The "מנוי" section only appears once billing is live — while the master
       switch is off it's infrastructure-only and every user has full access,
       so showing pricing / upgrade prompts would be premature. (The admin
       console can still set tiers + beta exemptions to pre-configure.) */
    items: ['profile', 'design', ...(BILLING_ENABLED ? ['subscription'] : [])],
  },
  {
    key: 'display',
    icon: Eye,
    titleKey: 'groups.display.title',
    subKey: 'groups.display.sub',
    items: ['widgets', 'payments'],
  },
  {
    key: 'workflow',
    icon: Layers,
    titleKey: 'groups.workflow.title',
    subKey: 'groups.workflow.sub',
    items: ['clients', 'leads', 'questions'],
  },
  {
    key: 'data',
    icon: Database,
    titleKey: 'groups.data.title',
    subKey: 'groups.data.sub',
    items: ['data'],
  },
  {
    key: 'about',
    icon: Info,
    titleKey: 'groups.about.title',
    subKey: 'groups.about.sub',
    items: ['about'],
  },
]

/* Meta-category keys; labels are translated via t(`clientMetas.${k}`) /
   t(`leadMetas.${k}`) at the call site. */
const CLIENT_METAS = ['active', 'wandering', 'past', 'no_status']
const LEAD_METAS = ['in_process', 'converted', 'not_relevant']

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
  const { t } = useT('settings')
  const f = prefs?.format || {}
  const setVal = (k) => (v) => onUpdate({ format: { [k]: v } })
  /* Option labels come from lib arrays (Hebrew `l`); re-label via t() so the
     <Segmented> pills follow the active language. */
  const tOpts = (group, opts) => opts.map((o) => ({ ...o, l: t(`options.${group}.${o.v}`) }))
  return (
    <div className="set-profile-body">
      <Segmented label={t('payments.currency')} value={f.currency || 'ILS'} options={tOpts('currency', CURRENCY_OPTIONS)} onChange={setVal('currency')} />
      <Segmented label={t('payments.dateFormat')} value={f.date_format || 'DD/MM/YY'} options={tOpts('dateFormat', DATE_FORMAT_OPTIONS)} onChange={setVal('date_format')} />
      <Segmented label={t('payments.timeFormat')} value={f.time_format || '24h'} options={tOpts('timeFormat', TIME_FORMAT_OPTIONS)} onChange={setVal('time_format')} />
      <Segmented label={t('payments.weekStart')} value={f.week_start || 'sunday'} options={tOpts('weekStart', WEEK_START_OPTIONS)} onChange={setVal('week_start')} />
    </div>
  )
}

/* ── Color dots ───────────────────────────────────────────────────
   Shared swatch picker (reuses the finance category palette) for the
   lead-source and lead sub-status colors. */
function ColorDots({ value, onChange }) {
  const { t } = useT('settings')
  return (
    <div className="set-color-dots" role="radiogroup" aria-label={t('common.color')}>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t('common.colorNamed', { color: c })}
          className={`set-color-dot${value === c ? ' on' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

/* ── Switch ───────────────────────────────────────────────────────
   One on/off control used everywhere in settings (replaces the old mix
   of pressed-button / checkbox / faux-switch idioms). role="switch". */
function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`set-w-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="set-w-toggle-knob" />
    </button>
  )
}

/* ── Widgets body ────────────────────────────────────────────────
   Per-widget controls: enabled, accent, compact (when supported),
   density override. Globals + reorder live in WidgetsGlobals below. */
function WidgetsBody({ prefs, onUpdate }) {
  const { t } = useT('settings')
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
  /* Keyboard-accessible reorder (swap with neighbour) — the drag handle
     is pointer-only, so the up/down buttons are the accessible path. */
  const moveWidget = (id, dir) => {
    const idx = list.findIndex((w) => w.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= list.length) return
    const next = [...list]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onUpdate({ widgets: { list: next } })
  }

  return (
    <div className="set-w-body">
      <p className="set-sub-h">{t('widgets.globalView')}</p>
      <Segmented label={t('widgets.cardStyle')} value={(global.cardStyle === 'outlined' || !global.cardStyle) ? 'frosted' : global.cardStyle} options={CARD_STYLE_OPTIONS.map((o) => ({ ...o, l: t(`options.cardStyle.${o.v}`) }))} onChange={setGlobal('cardStyle')} />
      <Segmented label={t('widgets.textStrength')} value={global.textStrength || 'normal'} options={TEXT_STRENGTH_OPTIONS.map((o) => ({ ...o, l: t(`options.textStrength.${o.v}`) }))} onChange={setGlobal('textStrength')} />
      <Segmented label={t('widgets.density')} value={global.density || 'comfortable'} options={DENSITY_OPTIONS.map((o) => ({ ...o, l: t(`options.density.${o.v}`) }))} onChange={setGlobal('density')} />

      <details className="set-w-collapse">
      <summary className="set-w-summary">{t('widgets.widgets')}</summary>
      <div className="set-w-list">
        {list.map((w, i) => {
          const reg = WIDGET_REGISTRY.find((r) => r.id === w.id)
          if (!reg) return null
          return (
            <WidgetRow
              key={w.id}
              cfg={w}
              reg={reg}
              index={i}
              total={list.length}
              onMove={moveWidget}
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
      </details>
    </div>
  )
}

function WidgetRow({ cfg, reg, index, total, onMove, onUpdate, dragging, over, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const { t } = useT('settings')
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
        <span className="set-w-move">
          <button
            type="button"
            className="set-w-move-btn"
            aria-label={t('widgets.moveUp', { label: t(`widgets.names.${reg.id}`) })}
            disabled={index === 0}
            onClick={() => onMove(cfg.id, -1)}
          >
            <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="set-w-move-btn"
            aria-label={t('widgets.moveDown', { label: t(`widgets.names.${reg.id}`) })}
            disabled={index === total - 1}
            onClick={() => onMove(cfg.id, 1)}
          >
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </span>
        <span className="set-w-row-name">{t(`widgets.names.${reg.id}`)}</span>
        <Switch
          checked={cfg.enabled}
          onChange={(v) => onUpdate({ enabled: v })}
          label={t('widgets.toggle', { label: t(`widgets.names.${reg.id}`), state: cfg.enabled ? t('widgets.off') : t('widgets.on') })}
        />
      </div>
      {cfg.enabled && (
        <div className="set-w-row-ctrls">
          {reg.supportsCompact && (
            <button
              type="button"
              className={`set-w-chip${cfg.compact ? ' on' : ''}`}
              onClick={() => onUpdate({ compact: !cfg.compact })}
            >{t('widgets.compact')}</button>
          )}
          <div className="set-w-density">
            {[
              { v: null,         l: t('widgets.rowDensity.global') },
              { v: 'compact',     l: t('widgets.rowDensity.compact') },
              { v: 'comfortable', l: t('widgets.rowDensity.comfortable') },
              { v: 'spacious',    l: t('widgets.rowDensity.spacious') },
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
  { v: 'light' },
  { v: 'dark' },
]

/* Background mode — applied to <html data-bg> by PrefsApplier (see
   index.css [data-bg] rules). 'nature' keeps the per-screen photos. */
const BACKGROUND_OPTIONS = [
  { v: 'nature' },
  { v: 'simple' },
  { v: 'blank' },
]

function DesignBody({ prefs, onUpdate }) {
  const d = prefs?.design || {}
  /* Namespaced to 'settings'; the language label lives in 'common', so it's
     resolved via the cross-namespace `common:language` key below. */
  const { t, i18n } = useT('settings')
  const setVal = (k) => (v) => onUpdate({ design: { [k]: v } })
  /* Language is special: also switch i18next live (localStorage-cached),
     not just persist the preference. */
  const activeLang = (i18n.language || 'he').split('-')[0]
  const setLanguage = (code) => { i18n.changeLanguage(code); onUpdate({ design: { language: code } }) }
  return (
    <div className="set-profile-body">
      <Segmented label={t('common:language')} value={activeLang} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      <Segmented label={t('design.theme')} value={d.theme || 'light'} options={THEME_OPTIONS.map((o) => ({ ...o, l: t(`options.theme.${o.v}`) }))} onChange={setVal('theme')} />
      <Segmented label={t('design.background')} value={d.background || 'nature'} options={BACKGROUND_OPTIONS.map((o) => ({ ...o, l: t(`options.background.${o.v}`) }))} onChange={setVal('background')} />
      <SwitchField
        label={t('design.hebrewCalendar')}
        hint={t('design.hebrewCalendarHint')}
        checked={!!d.hebrew_calendar}
        onChange={setVal('hebrew_calendar')}
      />
      <SwitchField
        label={t('design.hebrewDateInput')}
        hint={t('design.hebrewDateInputHint')}
        checked={!!d.hebrew_date_input}
        onChange={setVal('hebrew_date_input')}
      />
      {/* Dual display is shared — it affects both the calendar view and the
          date-input field, so surface it whenever either Hebrew mode is on. */}
      {(d.hebrew_calendar || d.hebrew_date_input) && (
        <SwitchField
          nested
          label={t('design.hebrewCalendarDual')}
          hint={t('design.hebrewCalendarDualHint')}
          checked={!!d.hebrew_calendar_dual}
          onChange={setVal('hebrew_calendar_dual')}
        />
      )}
      <Segmented label={t('design.textSize')} value={d.text_size || 'normal'} options={TEXT_SIZE_OPTIONS.map((o) => ({ ...o, l: t(`options.textSize.${o.v}`) }))} onChange={setVal('text_size')} />
    </div>
  )
}

/* Labeled on/off row for the design body — a <Switch> with a leading
   label + optional hint. `nested` indents it under its parent toggle. */
function SwitchField({ label, hint, checked, onChange, nested = false }) {
  return (
    <div className={`set-switch-field${nested ? ' nested' : ''}`}>
      <div className="set-switch-field-row">
        <span className="set-switch-field-label">{label}</span>
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
      {hint && <p className="set-switch-field-hint">{hint}</p>}
    </div>
  )
}

/* ── About body ──────────────────────────────────────────────────
   Three tabs: אודות (app identity) · מדריך (full per-screen guide) ·
   שאלות נפוצות (global FAQ). Guide/FAQ content lives in lib/helpContent.js
   (shared with the floating HelpFab). The tip/list sub-styles reuse the
   help-* classes from HelpFab.css, which is always loaded inside AppShell. */
const ABOUT_TABS = [
  { key: 'about', icon: Info },
  { key: 'guide', icon: BookOpen },
  { key: 'faq',   icon: HelpCircle },
]

/* Screen order for the full guide — a logical reading order (not the raw
   object key order). Owner-only screens (admin) are intentionally omitted. */
const GUIDE_ORDER = [
  'home', 'clients', 'leads', 'finance', 'projects', 'tasks',
  'calendar', 'goals', 'insights', 'moon', 'reports', 'connections',
  'settings', 'trash',
]

function AboutBody({ initialTab }) {
  const { t } = useT('settings')
  const navigate = useNavigate()
  const [tab, setTab] = useState(
    initialTab && ABOUT_TABS.some((x) => x.key === initialTab) ? initialTab : 'about',
  )
  return (
    <div className="set-about-wrap">
      <div className="set-about-tabs" role="tablist" aria-label={t('about.tabsAria')}>
        {ABOUT_TABS.map((tab2) => {
          const Icon = tab2.icon
          return (
            <button
              key={tab2.key}
              type="button"
              role="tab"
              aria-selected={tab === tab2.key}
              className={`set-about-tab${tab === tab2.key ? ' on' : ''}`}
              onClick={() => setTab(tab2.key)}
            >
              <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
              {t(`about.tabs.${tab2.key}`)}
            </button>
          )
        })}
      </div>
      {tab === 'about' && <AboutInfo navigate={navigate} />}
      {tab === 'guide' && <AboutGuide />}
      {tab === 'faq' && <AboutFaq />}
    </div>
  )
}

function AboutInfo({ navigate }) {
  const { t } = useT('settings')
  const about = getAboutContent()
  return (
    <div className="set-about">
      <p className="set-about-name">Simplicity</p>
      <p className="set-about-tag">{about.tagline}</p>
      <p className="set-about-desc"><MG text={about.description} /></p>
      <div className="set-about-principles">
        {about.principles.map((p, i) => (
          <div key={i} className="set-about-principle">
            <p className="set-about-principle-t">{p.title}</p>
            <p className="set-about-principle-b"><MG text={p.body} /></p>
          </div>
        ))}
      </div>
      <div className="set-about-meta">
        <span>{t('about.version', { version: about.version })}</span>
        <span className="set-about-dot">·</span>
        <span>2026</span>
      </div>
      <p className="set-about-credit">{about.built_with}</p>
      {/* Legal documents — the desktop sidebar surfaces these too, but this is
          the only path on mobile (no sidebar). Opens the public /legal page. */}
      <div className="set-about-legal">
        <button type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=privacy`)}>{t('about.privacy')}</button>
        <span className="set-about-dot">·</span>
        <button type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=terms`)}>{t('about.terms')}</button>
        <span className="set-about-dot">·</span>
        <button type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=dpa`)}>{t('about.dpa')}</button>
      </div>
    </div>
  )
}

function AboutGuide() {
  const { t } = useT('settings')
  return (
    <div className="set-guide">
      <p className="set-sub-intro">{t('about.guideIntro')}</p>
      {GUIDE_ORDER.map((key) => {
        const s = getHelpScreen(key)
        if (!s) return null
        return (
          <details key={key} className="set-guide-screen">
            <summary>
              {s.title}
              <ChevronDown size={16} strokeWidth={1.7} className="set-guide-chev" aria-hidden="true" />
            </summary>
            <div className="set-guide-screen-body">
              {s.intro && <p className="set-guide-intro"><MG text={s.intro} /></p>}
              {(s.features || []).map((f, i) => (
                <div key={i} className="set-guide-feat">
                  <p className="set-guide-feat-t"><MG text={f.title} /></p>
                  <p className="set-guide-feat-b"><MG text={f.body} /></p>
                </div>
              ))}
              {(s.tips || []).length > 0 && (
                <>
                  <p className="set-guide-sub">{t('about.guideTips')}</p>
                  <ul className="help-tips">
                    {s.tips.map((t, i) => (
                      <li key={i} className="help-tip">
                        <span className="help-tip-icon">
                          <Lightbulb size={15} strokeWidth={1.7} aria-hidden="true" />
                        </span>
                        <MG text={t} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {(s.faq || []).length > 0 && (
                <>
                  <p className="set-guide-sub">{t('about.guideFaq')}</p>
                  {s.faq.map((item, i) => (
                    <div key={i} className="set-guide-qa">
                      <p className="set-guide-q"><MG text={item.q} /></p>
                      <p className="set-guide-a"><MG text={item.a} /></p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function AboutFaq() {
  return (
    <div className="set-faq">
      {getGlobalFaq().map((cat, ci) => (
        <div key={ci} className="set-faq-group">
          <p className="set-faq-cat">{cat.category}</p>
          {cat.items.map((item, i) => (
            <details key={i} className="set-faq-item">
              <summary>
                <MG text={item.q} />
                <ChevronDown size={15} strokeWidth={1.7} className="set-faq-chev" aria-hidden="true" />
              </summary>
              <p className="set-faq-a"><MG text={item.a} /></p>
            </details>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── Profile body ────────────────────────────────────────────────
   Editable name + role pills + gender + role_other custom panel.
   Saves on blur (name / role_other) / click (role / gender). */
function ProfileBody({ prefs, onUpdate }) {
  const { t } = useT('settings')
  const [name, setName] = useState(prefs?.profile?.full_name || '')
  const role = prefs?.profile?.role || 'other'
  const [roleOther, setRoleOther] = useState(prefs?.profile?.role_other || '')
  const [savedName, setSavedName] = useState(false)
  const [savedRoleOther, setSavedRoleOther] = useState(false)
  const gender = prefs?.design?.gender || 'neutral'
  const ROLE_KEYS = Object.keys(ROLE_LABELS)
  const GENDERS = ['female', 'male', 'neutral']

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
        <label className="m-label">{t('profile.fullName')} {savedName && <span style={{ color: 'var(--sage)', fontWeight: 600 }}>{t('profile.saved')}</span>}</label>
        <input
          className="m-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setSavedName(false) }}
          onBlur={commitName}
          placeholder={t('profile.namePlaceholder')}
        />
      </div>
      <div className="m-field">
        <label className="m-label">{t('profile.address')}</label>
        <div className="m-pills">
          {GENDERS.map((g) => (
            <button key={g} type="button" className={`m-pill${gender === g ? ' on' : ''}`} onClick={() => pickGender(g)}>{t(`profile.genders.${g}`)}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('profile.role')}</label>
        <div className="m-pills">
          {ROLE_KEYS.map((k) => (
            <button key={k} type="button" className={`m-pill${role === k ? ' on' : ''}`} onClick={() => pickRole(k)}>{roleLabel(k, gender)}</button>
          ))}
        </div>
      </div>
      {role === 'other' && (
        <div className="m-field set-role-other">
          <label className="m-label">{t('profile.roleOther')} {savedRoleOther && <span style={{ color: 'var(--sage)', fontWeight: 600 }}>{t('profile.saved')}</span>}</label>
          <input
            className="m-input"
            value={roleOther}
            onChange={(e) => { setRoleOther(e.target.value); setSavedRoleOther(false) }}
            onBlur={commitRoleOther}
            placeholder={t('profile.roleOtherPlaceholder')}
          />
        </div>
      )}
    </div>
  )
}

/* Render a meta-grouped sub-status list with an inline add row per meta.
   Used for both client_statuses and lead_statuses. */
function StatusGroups({ metas, metaNs, statuses, drafts, setDraft, onAdd, onRemove, loading, error, withColor = false }) {
  const { t } = useT('settings')
  const [addError, setAddError] = useState(null)
  const [draftColors, setDraftColors] = useState({})
  if (loading) {
    return <div className="set-sub"><p className="set-sub-empty">{t('common.loading')}</p></div>
  }
  return (
    <div className="set-sub">
      {error && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{t('status.loadError', { error })}</p>}
      {metas.map((mk) => {
        const metaLabel = t(`${metaNs}.${mk}`)
        const list = statuses.filter((s) => s.meta_category === mk)
        const draft = drafts[mk] || ''
        const color = draftColors[mk] || CATEGORY_COLORS[0]
        const submit = async () => {
          const name = draft.trim()
          if (!name) return
          try {
            const payload = { meta_category: mk, display_name: name, icon: null, is_default: false }
            if (withColor) payload.color = color
            await onAdd(payload)
            setDraft(mk, '')
            setAddError(null)
          } catch (e) {
            setAddError(e?.message || t('status.addFailed'))
          }
        }
        return (
          <div key={mk} className="set-sub-group">
            <p className="set-sub-meta">{metaLabel}</p>
            {list.length === 0 && <p className="set-sub-empty">{t('status.empty')}</p>}
            {list.map((s) => (
              <div key={s.id} className="set-q-row">
                <span className="set-q-icon" style={s.color ? { color: s.color } : undefined}>{s.icon || '•'}</span>
                <span className="set-q-text">{s.display_name}</span>
                <button type="button" className="set-q-del" onClick={() => onRemove(s, list)} aria-label={t('status.deleteAria')}>
                  <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="set-sub-add">
              <input
                className="m-input"
                value={draft}
                onChange={(e) => setDraft(mk, e.target.value)}
                placeholder={t('status.subStatusPlaceholder', { meta: metaLabel })}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              />
              <button type="button" className="set-q-add" onClick={submit} disabled={!draft.trim()}>
                <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            {withColor && (
              <ColorDots value={color} onChange={(c) => setDraftColors((d) => ({ ...d, [mk]: c }))} />
            )}
          </div>
        )
      })}
      {addError && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{addError}</p>}
    </div>
  )
}

export default function SettingsScreen() {
  const { t } = useT('settings')
  /* Groups and sections start CLOSED. Only open a group or section when the
     user explicitly taps it, or when navigation state requests a specific one. */
  const location = useLocation()
  const [open, setOpen] = useState(() => {
    const section = location.state?.openSection
    return section ? { [section]: true } : {}
  })
  const [openGroups, setOpenGroups] = useState(() => {
    const group = location.state?.openGroup
    return group ? { [group]: true } : {}
  })
  const [showAddQ, setShowAddQ] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceColor, setNewSourceColor] = useState(CATEGORY_COLORS[0])
  const [sourceError, setSourceError] = useState(null)
  const [clientDrafts, setClientDrafts] = useState({})
  const [leadDrafts, setLeadDrafts] = useState({})
  const [editingScheduleId, setEditingScheduleId] = useState(null)
  const { questions, loading: questionsLoading, error: questionsError, addQuestion, toggleActive, updateQuestion, removeQuestion } = useUserQuestions()
  const { goals } = useGoals()
  /* C10 — which questions are wired to a goal (goals.tracked_by_question_id). */
  const goalLinkedQ = new Set((goals || []).filter((g) => g.tracked_by_question_id).map((g) => g.tracked_by_question_id))
  const { sources, loading: sourcesLoading, error: sourcesError, addSource, removeSource } = useLeadSources()
  const { statuses: clientStatuses, loading: clientStatusesLoading, error: clientStatusesError, addStatus: addClientStatus, removeStatus: removeClientStatus, refetch: refetchClientStatuses } = useClientStatuses()
  const { statuses: leadStatuses, loading: leadStatusesLoading, error: leadStatusesError, addStatus: addLeadStatus, removeStatus: removeLeadStatus, refetch: refetchLeadStatuses } = useLeadStatuses()
  const { prefs, loading: prefsLoading, update: updatePrefs } = useUserPreferences()
  const gender = prefs?.design?.gender || 'neutral'
  /* Data-section hooks — pulled lazily-ish: useClients/etc. all use a
     single network round-trip on mount, so this isn't expensive. */
  const { clients: dataClients, refetch: refetchClients } = useClients()
  const { projects: dataProjects, refetch: refetchProjects } = useProjects()
  const { transactions: dataTransactions, refetch: refetchTransactions } = useTransactions()
  const { categories: dataCategories } = useCategories()
  const { tasks: dataTasks } = useTasks()
  const { leads: dataLeads, refetch: refetchLeads } = useLeads()
  const [pendingDelete, setPendingDelete] = useState(null)  /* { kind, status, peers } | null */
  const [showExport, setShowExport] = useState(false)
  /* Captures which leads/clients a sub-status delete reassigned, so undo
     can move exactly those rows back (see handleSubStatusReassign/Delete). */
  const reassignRef = useRef(null)

  /* ── Sub-status delete with reassignment-aware undo ────────────────
     The modal calls reassign (if there are assignees) then delete. We
     snapshot the exact rows moved, then register ONE composite undo that
     restores the sub-status AND moves those rows back to it. */
  const handleSubStatusReassign = async (fromId, toId) => {
    const kind = pendingDelete?.kind
    const src = kind === 'lead' ? (dataLeads || []) : (dataClients || [])
    const ids = src.filter((x) => x.status_id === fromId && !x.deleted_at).map((x) => x.id)
    reassignRef.current = { kind, statusId: fromId, toId, ids }
    await (kind === 'lead' ? reassignLeadsStatus : reassignClientsStatus)(fromId, toId)
  }

  const handleSubStatusDelete = async (statusId) => {
    const kind = pendingDelete?.kind
    await (kind === 'lead' ? removeLeadStatus : removeClientStatus)(statusId)
    const snap = (reassignRef.current && reassignRef.current.statusId === statusId) ? reassignRef.current : null
    reassignRef.current = null
    const ids = snap?.ids || []
    const toId = snap?.toId ?? null
    /* Overwrites the restore-only undo the hook just queued, adding the
       reassignment revert. */
    pushUndo({
      label: t('status.subStatusDeleted'),
      undo: async () => {
        if (kind === 'lead') {
          try { await restoreLeadStatus(statusId) } catch { /* keep going */ }
          try { if (ids.length) await reassignLeadsStatusByIds(ids, statusId) } catch { /* keep going */ }
          refetchLeadStatuses(); refetchLeads()
        } else {
          try { await restoreClientStatus(statusId) } catch { /* keep going */ }
          try { if (ids.length) await reassignClientsStatusByIds(ids, statusId) } catch { /* keep going */ }
          refetchClientStatuses(); refetchClients()
        }
      },
      redo: async () => {
        if (kind === 'lead') {
          try { if (ids.length) await reassignLeadsStatusByIds(ids, toId) } catch { /* keep going */ }
          try { await removeLeadStatus(statusId) } catch { /* keep going */ }
          refetchLeads()
        } else {
          try { if (ids.length) await reassignClientsStatusByIds(ids, toId) } catch { /* keep going */ }
          try { await removeClientStatus(statusId) } catch { /* keep going */ }
          refetchClients()
        }
      },
    })
    /* Forward path must refresh clients/leads too — the reassign changed their
       status_id; the undo/redo paths already refetch, so mirror them here. */
    if (kind === 'lead') { refetchLeadStatuses(); refetchLeads() }
    else { refetchClientStatuses(); refetchClients() }
  }
  const [showReset, setShowReset] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showRestartOb, setShowRestartOb] = useState(false)
  /* Schedule permanent account deletion (30-day grace). We only RECORD the
     request in prefs; the App-level gate then takes over (locked countdown
     screen), and a scheduled edge function does the real auth.users delete
     once the window passes. No sign-out here — the gate shows immediately. */
  const onDeleteAccount = async () => {
    await updatePrefs({ accountDeletion: buildAccountDeletionRequest() })
  }
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
  /* CSV/Excel import (Settings → data). Pick one or more files → read
     every sheet via the shared multi-sheet engine → open the same
     mapping+review modal onboarding uses. */
  const importFileRef = useRef(null)
  const [importParsed, setImportParsed] = useState(null)
  const [importMsg, setImportMsg] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const onPickImport = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setImportMsg('')
    const UNSUPPORTED = ['pdf', 'numbers', 'pages', 'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'doc', 'docx', 'gsheet']
    if (files.some((f) => UNSUPPORTED.includes((f.name.split('.').pop() || '').toLowerCase()))) {
      setImportMsg(t('data.importUnsupported'))
      return
    }
    setImportBusy(true)
    try {
      const { sheets, names } = await buildSheetsFromFiles(files)
      setImportParsed({ kind: 'csv', file_name: names, sheets })
    } catch {
      setImportMsg(t('data.importFailed'))
    } finally {
      setImportBusy(false)
    }
  }
  const onImported = (summary) => {
    refetchClients?.(); refetchProjects?.(); refetchTransactions?.()
    if (summary) {
      const c = summary.clients?.created || 0
      const p = summary.projects?.created || 0
      const tx = summary.transactions?.created || 0
      const l = summary.leads?.created || 0
      const est = summary.transactions?.dateEstimated || 0
      const sCount = summary.sessions?.created || 0
      const estNote = est > 0 ? t('data.importEstNote', { count: est }) : ''
      const parts = []
      if (c) parts.push(t('data.importClients', { count: c }))
      if (p) parts.push(t('data.importProjects', { count: p }))
      if (l) parts.push(t('data.importLeads', { count: l }))
      if (tx) parts.push(t('data.importTransactions', { count: tx }))
      if (sCount) parts.push(t('data.importSessions', { count: sCount }))
      setImportMsg(
        parts.length === 0
          ? t('data.importNone')
          : t('data.importSuccess', { parts: parts.join(' · '), estNote }),
      )
    }
  }
  const navigate = useNavigate()
  const toggle = (key) => setOpen((cur) => ({ ...cur, [key]: !cur[key] }))
  const toggleGroup = (key) => setOpenGroups((cur) => ({ ...cur, [key]: !cur[key] }))

  const setClientDraft = (k, v) => setClientDrafts((d) => ({ ...d, [k]: v }))
  const setLeadDraft = (k, v) => setLeadDrafts((d) => ({ ...d, [k]: v }))

  const renderBody = (key) => {
    if (key === 'profile') {
      if (prefsLoading) return <p className="set-soon">{t('common.loading')}</p>
      return <ProfileBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'payments') {
      if (prefsLoading) return <p className="set-soon">{t('common.loading')}</p>
      return <PaymentsBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'design') {
      if (prefsLoading) return <p className="set-soon">{t('common.loading')}</p>
      return <DesignBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'about') {
      return <AboutBody initialTab={location.state?.aboutTab} />
    }
    if (key === 'subscription') {
      return <SubscriptionBody />
    }
    if (key === 'widgets') {
      if (prefsLoading) return <p className="set-soon">{t('common.loading')}</p>
      return <WidgetsBody prefs={prefs} onUpdate={updatePrefs} />
    }
    if (key === 'questions') {
      const reminderPref = prefs?.insightsReminder || { enabled: false, time: '20:00' }
      const setReminder = (patch) => updatePrefs?.({ insightsReminder: { ...reminderPref, ...patch } })
      return (
        <div className="set-q">
          {questionsLoading ? (
            <p className="set-q-empty">{t('common.loading')}</p>
          ) : questionsError ? (
            <p className="set-q-empty" style={{ color: 'var(--clay)' }}>{t('questions.loadError', { error: questionsError })}</p>
          ) : questions.length === 0 ? (
            <p className="set-q-empty">{t('questions.empty')}</p>
          ) : (
            questions.map((q) => (
              <div key={q.id} className={`set-q-block${q.active ? '' : ' off'}`}>
                <div className={`set-q-row`}>
                  <span className="set-q-icon">{q.icon || '🫧'}</span>
                  <span className="set-q-text">{questionText(q, gender)}</span>
                  {goalLinkedQ.has(q.id) && (
                    <span className="set-q-goal" title={t('questions.linkedToGoal')} aria-label={t('questions.linkedToGoal')}>
                      <Target size={12} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                  )}
                  <button
                    type="button"
                    className="set-q-sched"
                    onClick={() => setEditingScheduleId(editingScheduleId === q.id ? null : q.id)}
                    aria-expanded={editingScheduleId === q.id}
                  >
                    <CalendarDays size={11} strokeWidth={1.7} aria-hidden="true" />
                    {describeSchedule(q)}
                  </button>
                  <Switch
                    checked={q.active}
                    onChange={() => toggleActive(q)}
                    label={q.active ? t('questions.toggleOff') : t('questions.toggleOn')}
                  />
                  <button type="button" className="set-q-del" onClick={() => removeQuestion(q.id)} aria-label={t('questions.deleteAria')}>
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
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" /> {t('questions.add')}
          </button>

          <div className="set-sub-divider" />
          <p className="set-sub-h">{t('questions.reminderTitle')}</p>
          <div className="set-reminder-row">
            <span className="set-reminder-toggle">
              <Switch
                checked={!!reminderPref.enabled}
                onChange={(v) => setReminder({ enabled: v })}
                label={t('questions.reminderToggle')}
              />
              <span>{t('questions.reminderLabel')}</span>
            </span>
            <input
              type="time"
              className="m-input set-reminder-time"
              value={reminderPref.time || '20:00'}
              onChange={(e) => setReminder({ time: e.target.value })}
              disabled={!reminderPref.enabled}
            />
          </div>
          <p className="set-reminder-hint">
            {t('questions.reminderHint')}
          </p>
        </div>
      )
    }
    if (key === 'data') {
      const txAll = (dataTransactions || []).filter((tr) => !tr.deleted_at)
      const exportTransactions = () => exportTransactionsCSV({
        transactions: txAll,
        clients: dataClients,
        projects: dataProjects,
        categories: dataCategories,
        monthDate: new Date(),
      })
      const exportClients = () => exportClientsCSV({ clients: dataClients, projects: dataProjects, now: new Date() })
      const exportProjects = () => exportProjectsCSV({ projects: dataProjects, now: new Date() })
      const exportEverything = async (sel = {}) => {
        const sensitive = await loadSensitiveExportData(sel, gender)
        await exportAllXLSX({
          transactions: txAll,
          clients: dataClients,
          projects: dataProjects,
          categories: dataCategories,
          leads: dataLeads,
          tasks: dataTasks,
          now: new Date(),
          sensitive,
        })
      }
      const counts = [
        { k: 'clients', n: dataClients?.length || 0 },
        { k: 'transactions', n: txAll.length },
        { k: 'leads',  n: dataLeads?.length || 0 },
        { k: 'tasks', n: dataTasks?.length || 0 },
        { k: 'projects', n: dataProjects?.length || 0 },
        { k: 'categories', n: dataCategories?.length || 0 },
      ]
      return (
        <div className="set-data">
          <p className="set-sub-intro">{t('data.intro')}</p>
          <div className="set-data-stats">
            {counts.map((c) => (
              <div key={c.k} className="set-data-stat">
                <p className="set-data-stat-v mono">{c.n}</p>
                <p className="set-data-stat-l">{t(`data.counts.${c.k}`)}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="set-data-action"
            onClick={() => setShowExport(true)}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.export')}
          </button>
          <p className="set-data-hint">
            {t('data.exportHint')}
          </p>

          <ExportDataModal
            open={showExport}
            onClose={() => setShowExport(false)}
            onExportAll={exportEverything}
            onExportTransactions={exportTransactions}
            onExportClients={exportClients}
            onExportProjects={exportProjects}
            hasTransactions={txAll.length > 0}
            hasClients={(dataClients?.length || 0) > 0}
            hasProjects={(dataProjects?.length || 0) > 0}
          />

          <input
            ref={importFileRef}
            type="file"
            accept={ACCEPT}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { onPickImport(e.target.files); e.target.value = '' }}
          />
          <button
            type="button"
            className="set-data-action"
            onClick={() => importFileRef.current?.click()}
            disabled={importBusy}
            style={{ marginTop: 10 }}
          >
            <Upload size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.import')}
          </button>
          <p className="set-data-hint">
            {t('data.importHint')}
          </p>
          {importBusy && (
            <p className="set-data-hint" role="status" aria-live="polite">{t('data.importProcessing')}</p>
          )}
          {importMsg && (
            <p className="set-data-hint" role="status" aria-live="polite"
              style={{ color: importMsg.startsWith(t('data.importErrorPrefix')) ? 'var(--clay)' : 'var(--sage)', fontWeight: 600 }}>{importMsg}</p>
          )}

          <button
            type="button"
            className="set-data-action"
            onClick={() => setShowRestartOb(true)}
            style={{ marginTop: 10 }}
          >
            <Sparkles size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.restartOnboarding')}
          </button>
          <p className="set-data-hint">
            {t('data.restartHint')}
          </p>

          <div className="set-danger-zone">
            <p className="set-danger-title">{t('danger.resetTitle')}</p>
            <button
              type="button"
              className="set-data-action danger"
              onClick={() => setShowReset(true)}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" />
              {t('danger.resetAction')}
            </button>
            <p className="set-data-hint">
              {t('danger.resetHint')}
            </p>

            <p className="set-danger-title" style={{ marginTop: 20 }}>{t('danger.deleteTitle')}</p>
            <button
              type="button"
              className="set-data-action danger"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" />
              {t('danger.deleteAction')}
            </button>
            <p className="set-data-hint">
              {t('danger.deleteHint')}
            </p>
          </div>
        </div>
      )
    }
    if (key === 'clients') {
      return (
        <>
          <StatusGroups
            metas={CLIENT_METAS}
            metaNs="clientMetas"
            statuses={clientStatuses}
            drafts={clientDrafts}
            setDraft={setClientDraft}
            onAdd={addClientStatus}
            onRemove={(status, peers) => setPendingDelete({ kind: 'client', status, peers })}
            loading={clientStatusesLoading}
            error={clientStatusesError}
          />
          <div className="set-q" style={{ marginTop: 14 }}>
            <p className="set-sub-h">{t('clients.meetingTypesHeading')}</p>
            <MeetingTypesManager onChanged={refetchClients} />
          </div>
        </>
      )
    }
    if (key === 'leads') {
      const submitNewSource = async () => {
        const v = newSourceName.trim()
        if (!v) return
        try {
          await addSource({ name: v, color: newSourceColor })
          setNewSourceName('')
          setSourceError(null)
        } catch (e) {
          setSourceError(e?.message || t('leads.addSourceFailed'))
        }
      }
      return (
        <div className="set-q">
          <p className="set-sub-h">{t('leads.sources')}</p>
          {sourcesLoading ? (
            <p className="set-sub-empty">{t('common.loading')}</p>
          ) : sourcesError ? (
            <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{t('leads.sourcesLoadError', { error: sourcesError })}</p>
          ) : sources.length === 0 ? (
            <p className="set-sub-empty">{t('leads.sourcesEmpty')}</p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="set-q-row">
                <span className="set-q-icon" style={{ color: s.color }}>●</span>
                <span className="set-q-text">{s.name}</span>
                <button type="button" className="set-q-del" onClick={() => removeSource(s.id)} aria-label={t('leads.deleteSourceAria')}>
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
              placeholder={t('leads.newSourcePlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewSource() }}
            />
            <button type="button" className="set-q-add" onClick={submitNewSource} disabled={!newSourceName.trim()}>
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <ColorDots value={newSourceColor} onChange={setNewSourceColor} />
          {sourceError && <p className="set-sub-empty" style={{ color: 'var(--clay)' }}>{sourceError}</p>}

          <p className="set-sub-h" style={{ marginTop: 14 }}>{t('leads.subStatuses')}</p>
          <StatusGroups
            metas={LEAD_METAS}
            metaNs="leadMetas"
            statuses={leadStatuses}
            drafts={leadDrafts}
            setDraft={setLeadDraft}
            onAdd={addLeadStatus}
            onRemove={(status, peers) => setPendingDelete({ kind: 'lead', status, peers })}
            loading={leadStatusesLoading}
            error={leadStatusesError}
            withColor
          />
        </div>
      )
    }
    return <p className="set-soon">{t('common.soon')}</p>
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('header.areas', { count: SECTION_GROUPS.length })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{t('header.customization')}</p>
            </div>
            <p className="lbl-sm">{t('header.tagline')}</p>
          </div>
          <p className="t-screen">{t('header.title')}</p>
        </header>
      </div>

      <div className="set-list">
        {SECTION_GROUPS.map((group) => {
          const groupOpen = !!openGroups[group.key]
          const GroupIcon = group.icon
          return (
            <div key={group.key} className="set-group">
              <button
                type="button"
                className={`set-group-head${groupOpen ? ' open' : ''}`}
                onClick={() => toggleGroup(group.key)}
                aria-expanded={groupOpen}
              >
                <span className="set-group-icon"><GroupIcon size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                <div className="set-group-text">
                  <p className="set-group-title">{t(group.titleKey)}</p>
                  <p className="set-group-sub">{t(group.subKey)}</p>
                </div>
                <ChevronDown size={18} strokeWidth={1.6} className="set-group-chev" aria-hidden="true" />
              </button>
              {groupOpen && (
                <div className="set-group-children">
                  {group.items.map((key) => {
                    const section = SECTION_DEFS[key]
                    if (!section) return null
                    const Icon = section.icon
                    const isOpen = !!open[key]
                    return (
                      <div key={key} className={`set-acc${isOpen ? ' open' : ''}`}>
                        <button type="button" className="set-acc-head" onClick={() => toggle(key)} aria-expanded={isOpen}>
                          <span className="set-acc-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                          <span className="set-acc-text">
                            <span className="set-acc-title">{t(section.titleKey)}</span>
                            <span className="set-acc-sub">{t(section.subKey)}</span>
                          </span>
                          <ChevronDown size={18} strokeWidth={1.6} className="set-acc-chev" aria-hidden="true" />
                        </button>
                        {isOpen && <div className="set-acc-body">{renderBody(key)}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <AddQuestionModal
        open={showAddQ}
        onClose={() => setShowAddQ(false)}
        nextOrder={questions.length}
        onSave={addQuestion}
        usedTemplateKeys={questions.filter((q) => q.template_key).map((q) => q.template_key)}
      />

      <DeleteSubStatusModal
        key={pendingDelete?.status?.id || 'none'}
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        status={pendingDelete?.status}
        peers={pendingDelete?.peers || []}
        onCount={pendingDelete?.kind === 'lead' ? countLeadsByStatus : countClientsByStatus}
        onReassign={handleSubStatusReassign}
        onDelete={handleSubStatusDelete}
      />

      {importParsed && (
        <ImportDataModal
          parsed={importParsed}
          gender={gender}
          onClose={() => setImportParsed(null)}
          onImported={onImported}
        />
      )}

      <ConfirmModal
        open={showRestartOb}
        onClose={() => setShowRestartOb(false)}
        title={t('danger.restartTitle')}
        confirmLabel={t('danger.restartConfirm')}
        message={t('danger.restartMessage')}
        onConfirm={async () => {
          await updatePrefs({ onboarding: defaultOnboarding() })
          navigate(ROUTES.ONBOARDING)
        }}
      />

      <ResetAccountModal
        open={showReset}
        onClose={() => setShowReset(false)}
        onConfirm={onResetAccount}
      />

      <DeleteAccountModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={onDeleteAccount}
      />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, ChevronLeft, Target, Sparkles,
  Plus, Trash2, CalendarDays, Download, Upload, Search, X, Settings,
} from 'lucide-react'
import { SECTION_DEFS, SECTION_GROUPS, groupOfSection, soleSectionOf } from './sections'
import { searchTree } from './searchSettings'
import { ROUTES } from '../../lib/routes'
import { buildSheetsFromFiles, ACCEPT } from '../../lib/importFlow'
import ImportDataModal from '../onboarding/ImportDataModal'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTransactions } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { useTasks } from '../../hooks/useTasks'
import { useLeads } from '../../hooks/useLeads'
import { useGoals } from '../../hooks/useGoals'
import { pushNote } from '../../lib/undo'
import { MeetingTypesManager } from '../../modals/MeetingTypesModal'
import ResetAccountModal from '../../modals/ResetAccountModal'
import ConfirmModal from '../../modals/ConfirmModal'
import DeleteAccountModal from '../../modals/DeleteAccountModal'
import { resetAllUserData, buildAccountDeletionRequest } from '../../lib/api/account'
import {
  ROLE_LABELS, roleLabel, CURRENCY_OPTIONS, DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, WEEK_START_OPTIONS,
  TEXT_SIZE_OPTIONS, WIDGET_REGISTRY, setWidgetVisible, moveWidgetTo,
  CARD_STYLE_OPTIONS, TEXT_STRENGTH_OPTIONS, DENSITY_OPTIONS,
} from '../../lib/preferences'
import { useT } from '../../i18n/useT'
/* The instance, not the hook's `t`: savePrefs must keep a stable identity
   (ProfileBody's commit-on-unmount effect depends on it) and the hook's `t`
   is re-created on a language change. */
import i18n, { LANGUAGE_OPTIONS, setLanguage as applyLanguage } from '@simplicity/core/i18n'
import { questionText, describeSchedule, formatDateAs, formatTimeAs } from '@simplicity/core'
import { exportTransactionsCSV, exportClientsCSV, exportProjectsCSV, exportAllXLSX } from '../../lib/export'
import { loadSensitiveExportData } from '../../lib/exportSensitive'
import ExportDataModal from '../../modals/ExportDataModal'
import { defaultOnboarding } from '../../lib/preferences'
import AddQuestionModal from '../../modals/AddQuestionModal'
import QuestionScheduleEditor from './QuestionScheduleEditor'
/* The guide and the FAQ readers moved with them to screens/help; only the
   app's own identity is still read here. */
import { getAboutContent } from '../../lib/helpContent'
import MG from '../../components/MG'
import './SettingsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* ── Edge hint for a row that scrolls sideways ────────────────────
   Below 640px an option row that doesn't fit scrolls instead of wrapping
   (the C6 rule in Modal.css). That protects the layout and says nothing:
   on a 375px phone the מקצוע row hides 143px — the last two roles sit
   off-screen with no sign they exist. This marks the element while there
   is still something past its trailing edge; the CSS fades that edge, and
   the fade lifts the moment the end is reached.

   MEASURED, never assumed: a row that fits is never marked, which is why
   the segmented controls (they wrap) come out clean. */
function useEdgeHint(ref, dep) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const sync = () => {
      /* RTL reports scrollLeft as negative in most engines — the distance
         travelled is what matters, not its sign. */
      const more = el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft)
      el.classList.toggle('has-more', more > 2)
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', sync); ro?.disconnect() }
  }, [ref, dep])
}

/* ── Segmented control ────────────────────────────────────────────
   Compact horizontal pill group. Used by payments + design. */
function Segmented({ label, value, options, onChange }) {
  const idx = options.findIndex((o) => o.v === value)
  /* A radiogroup is ONE tab stop, and the arrow keys move within it. These
     were plain buttons wearing role="radio": tabbing through the design
     section meant stopping on all four languages, all three backgrounds and
     all three text sizes in turn, and the arrows did nothing. Roving
     tabindex + arrow handling, no visual change. */
  const groupRef = useRef(null)
  const step = (delta) => {
    if (!options.length) return
    const from = idx < 0 ? 0 : idx
    const at = (from + delta + options.length) % options.length
    const next = options[at]
    if (!next) return
    onChange(next.v)
    /* Focus follows selection, or the tab stop would stay on the option the
       user just moved off (and the next arrow press would go nowhere). */
    groupRef.current?.querySelectorAll('[role="radio"]')?.[at]?.focus()
  }
  const onKeyDown = (e) => {
    /* Horizontal keys are mirrored in RTL by the browser's own semantics,
       so map by document direction to keep "next" meaning next. */
    const rtl = typeof document !== 'undefined' && document.dir === 'rtl'
    if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); step(-1) }
  }

  /* Segmented groups keep `flex-wrap: wrap`, so the C6 sideways-scroll rule
     never engages on them — they wrap to a second line and every option
     stays visible. Measured on a 375px phone: all eleven of them report
     scrollWidth === clientWidth. No edge hint is needed here; the pill rows
     below, which are `nowrap`, are a different story (see useEdgeHint). */
  useEdgeHint(groupRef, options)
  return (
    <Box className="m-field">
      <Box as="label" className="m-label">{label}</Box>
      <Box ref={groupRef} className="set-seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        {options.map((o, i) => (
          <Btn
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            /* The checked option holds the tab stop; if none is checked yet,
               the first one does, so the group is never unreachable. */
            tabIndex={value === o.v || (idx < 0 && i === 0) ? 0 : -1}
            className={`set-seg-btn${value === o.v ? ' on' : ''}`}
            onClick={() => onChange(o.v)}
          >
            {o.l}
          </Btn>
        ))}
      </Box>
    </Box>
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

  /* The date and time pills used to read "DD/MM/YY" and "12h (AM/PM)" —
     the pattern strings straight out of the code. A coach choosing how
     their calendar should look was being shown developer notation and
     asked to picture the result.

     They now show the result: TODAY, formatted each way, through the same
     functions the app formats with — so the example cannot drift from
     what the choice actually produces. `now` is captured once per render
     rather than per option, so all three pills describe one moment. */
  const now = new Date()
  const dateOpts = DATE_FORMAT_OPTIONS.map((o) => ({ ...o, l: formatDateAs(o.v, now) }))
  const timeOpts = TIME_FORMAT_OPTIONS.map((o) => ({ ...o, l: formatTimeAs(o.v, now) }))

  return (
    <Box className="set-profile-body">
      <Segmented label={t('payments.currency')} value={f.currency || 'ILS'} options={tOpts('currency', CURRENCY_OPTIONS)} onChange={setVal('currency')} />
      <Segmented label={t('payments.dateFormat')} value={f.date_format || 'DD/MM/YY'} options={dateOpts} onChange={setVal('date_format')} />
      <Txt as="p" className="set-example-note">{t('payments.exampleToday')}</Txt>
      <Segmented label={t('payments.timeFormat')} value={f.time_format || '24h'} options={timeOpts} onChange={setVal('time_format')} />
      <Segmented label={t('payments.weekStart')} value={f.week_start || 'sunday'} options={tOpts('weekStart', WEEK_START_OPTIONS)} onChange={setVal('week_start')} />
    </Box>
  )
}

/* The colour-swatch picker that used to live here went with the lead
   sources and stages it coloured — the leads screen owns both now. Its
   `common.colorNamed` string stays in the locale files for that screen's
   own picker, which announces a position rather than a hex code. */

/* ── Switch ───────────────────────────────────────────────────────
   One on/off control used everywhere in settings (replaces the old mix
   of pressed-button / checkbox / faux-switch idioms). role="switch". */
function Switch({ checked, onChange, label }) {
  return (
    <Btn
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`set-w-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <Txt className="set-w-toggle-knob" />
    </Btn>
  )
}

/* ── Home-screen body ────────────────────────────────────────────
   A plain show/hide + order list, and nothing else.

   The three GLOBAL appearance controls (card style, text weight, density)
   used to head this panel. They were never about the home screen — they
   restyle every card in the app — so they now live in the design section
   with the rest of the appearance settings, and this section is left doing
   the one thing its name promises.

   Arranging the home screen also happens ON the home screen — press and hold
   a widget, drag it, ✕ to hide (see useHomeEdit). This panel used to carry
   ~45 controls: a drag handle, two arrows, a toggle, a "compact" chip and
   four density chips for every widget, describing a screen you could not see
   while adjusting it.

   What stays here, deliberately: an ORDERING path that works without a
   pointer. The home gesture is press-and-drag, which a keyboard user cannot
   perform — removing these arrows would have made rearranging mouse-only. */
function HomeBody({ prefs, onUpdate }) {
  const { t } = useT('settings')
  const cfg = prefs?.widgets || {}
  const list = cfg.list || []

  const setVisible = (id, visible) => onUpdate({ widgets: { list: setWidgetVisible(list, id, visible) } })
  const move = (id, dir) => {
    const idx = list.findIndex((w) => w.id === id)
    if (idx < 0) return
    onUpdate({ widgets: { list: moveWidgetTo(list, id, idx + dir) } })
  }

  return (
    <Box className="set-w-body">
      <Txt as="p" className="set-w-note">{t('widgets.editOnHome')}</Txt>
      <Box className="set-w-list">
        {list.map((w, i) => {
          const reg = WIDGET_REGISTRY.find((r) => r.id === w.id)
          if (!reg) return null
          const name = t(`widgets.names.${reg.id}`)
          return (
            <Box key={w.id} className={`set-w-row${w.enabled === false ? ' off' : ''}`}>
              <Txt className="set-w-move">
                <Btn
                  type="button"
                  className="set-w-move-btn"
                  aria-label={t('widgets.moveUp', { label: name })}
                  disabled={i === 0}
                  onClick={() => move(w.id, -1)}
                >
                  <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
                </Btn>
                <Btn
                  type="button"
                  className="set-w-move-btn"
                  aria-label={t('widgets.moveDown', { label: name })}
                  disabled={i === list.length - 1}
                  onClick={() => move(w.id, 1)}
                >
                  <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
                </Btn>
              </Txt>
              <Txt className="set-w-row-name">{name}</Txt>
              <Switch
                checked={w.enabled !== false}
                onChange={(v) => setVisible(w.id, v)}
                label={t('widgets.toggle', { label: name, state: w.enabled !== false ? t('widgets.off') : t('widgets.on') })}
              />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/* ── Design body ─────────────────────────────────────────────────
   Every appearance setting in the app, in one section. PrefsApplier picks
   up the change and pushes it to <html> attributes app-wide.

   The card style / text weight / density trio arrived here from the widgets
   panel: they restyle every card in the app, not the home screen, and being
   filed under "ווידג׳טים" put half the appearance settings in a different
   group from the other half. Three sub-headings keep the eight controls
   readable — what the app looks like, what its cards look like, and the
   Hebrew-calendar pair. */
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

/* ── Live example card ───────────────────────────────────────────
   The appearance controls describe things a coach cannot picture and
   cannot check: "מעורפל" or "שטוח", "צפוף" or "מרווח", text "רגיל" or
   "מודגש". The result of every one of them lives on OTHER screens, so
   the only way to judge a choice was to pick one, navigate away, look,
   and come back — which is why the panel had been trimmed once already.

   This is a real card wearing the choices as they are being made. It
   carries its own data-* attributes rather than inheriting the page's,
   so it previews the pending look even before the write lands, and it
   uses the same tokens the app's cards use — so it is a sample, not a
   drawing of one. */
function DesignPreview({ cardStyle, textStrength, density, textSize }) {
  const { t } = useT('settings')
  return (
    <Box
      className="set-preview"
      data-card-style={cardStyle}
      data-text-strength={textStrength}
      data-density={density}
      data-text-size={textSize}
      aria-hidden="true"
    >
      <Txt as="p" className="set-preview-label">{t('design.previewLabel')}</Txt>
      <Box className="set-preview-card">
        <Box className="set-preview-row">
          <Txt className="set-preview-title">{t('design.previewCardTitle')}</Txt>
          <Txt className="set-preview-chip">{t('design.previewChip')}</Txt>
        </Box>
        <Txt as="p" className="set-preview-body">{t('design.previewCardBody')}</Txt>
        <Box className="set-preview-row">
          <Txt className="set-preview-meta">{t('design.previewMeta')}</Txt>
          <Txt className="set-preview-num mono">₪450</Txt>
        </Box>
      </Box>
    </Box>
  )
}

function DesignBody({ prefs, onUpdate }) {
  const d = prefs?.design || {}
  const global = prefs?.widgets?.global || {}
  /* Namespaced to 'settings'; the language label lives in 'common', so it's
     resolved via the cross-namespace `common:language` key below. */
  const { t, i18n } = useT('settings')
  const setVal = (k) => (v) => onUpdate({ design: { [k]: v } })
  /* The card trio still persists under widgets.global — moving the CONTROLS
     is a settings-layout change, not a data migration, and every reader of
     that sub-tree (PrefsApplier, the home screen) stays untouched. */
  const setGlobal = (k) => (v) => onUpdate({ widgets: { global: { [k]: v } } })
  /* Language is special: also switch i18next live (localStorage-cached),
     not just persist the preference. */
  const activeLang = (i18n.language || 'he').split('-')[0]
  // applyLanguage (not i18n.changeLanguage) fetches the language chunk first.
  const setLanguage = (code) => { applyLanguage(code); onUpdate({ design: { language: code } }) }
  /* Same normalisation the control uses — 'outlined' is a retired value that
     still sits in older prefs blobs and reads as frosted. */
  const cardStyle = (global.cardStyle === 'outlined' || !global.cardStyle) ? 'frosted' : global.cardStyle
  return (
    <Box className="set-profile-body">
      <Segmented label={t('common:language')} value={activeLang} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      <Segmented label={t('design.theme')} value={d.theme || 'light'} options={THEME_OPTIONS.map((o) => ({ ...o, l: t(`options.theme.${o.v}`) }))} onChange={setVal('theme')} />
      <Segmented label={t('design.background')} value={d.background || 'nature'} options={BACKGROUND_OPTIONS.map((o) => ({ ...o, l: t(`options.background.${o.v}`) }))} onChange={setVal('background')} />
      <Segmented label={t('design.textSize')} value={d.text_size || 'normal'} options={TEXT_SIZE_OPTIONS.map((o) => ({ ...o, l: t(`options.textSize.${o.v}`) }))} onChange={setVal('text_size')} />

      <Txt as="p" className="set-sub-h">{t('design.cardsHeading')}</Txt>
      {/* Above the three controls it answers, so the change is visible in the
          same glance as the tap that caused it. */}
      <DesignPreview
        cardStyle={cardStyle}
        textStrength={global.textStrength || 'normal'}
        density={global.density || 'comfortable'}
        textSize={d.text_size || 'normal'}
      />
      <Segmented label={t('design.cardStyle')} value={(global.cardStyle === 'outlined' || !global.cardStyle) ? 'frosted' : global.cardStyle} options={CARD_STYLE_OPTIONS.map((o) => ({ ...o, l: t(`options.cardStyle.${o.v}`) }))} onChange={setGlobal('cardStyle')} />
      <Segmented label={t('design.textStrength')} value={global.textStrength || 'normal'} options={TEXT_STRENGTH_OPTIONS.map((o) => ({ ...o, l: t(`options.textStrength.${o.v}`) }))} onChange={setGlobal('textStrength')} />
      <Segmented label={t('design.density')} value={global.density || 'comfortable'} options={DENSITY_OPTIONS.map((o) => ({ ...o, l: t(`options.density.${o.v}`) }))} onChange={setGlobal('density')} />

      <Txt as="p" className="set-sub-h">{t('design.hebrewHeading')}</Txt>
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
    </Box>
  )
}

/* Labeled on/off row for the design body — a <Switch> with a leading
   label + optional hint. `nested` indents it under its parent toggle. */
function SwitchField({ label, hint, checked, onChange, nested = false }) {
  return (
    <Box className={`set-switch-field${nested ? ' nested' : ''}`}>
      <Box className="set-switch-field-row">
        <Txt className="set-switch-field-label">{label}</Txt>
        <Switch checked={checked} onChange={onChange} label={label} />
      </Box>
      {hint && <Txt as="p" className="set-switch-field-hint">{hint}</Txt>}
    </Box>
  )
}

/* ── About body ──────────────────────────────────────────────────
   The app's identity, its version and the legal documents — and nothing
   else. The full per-screen guide and the FAQ were two more tabs here
   until they became their own screen (screens/help): a manual filed four
   disclosures deep inside a settings section is a manual nobody opens. */
function AboutBody() {
  const { t } = useT('settings')
  const navigate = useNavigate()
  const about = getAboutContent()
  return (
    <Box className="set-about">
      <Txt as="p" className="set-about-name">Simplicity</Txt>
      <Txt as="p" className="set-about-tag">{about.tagline}</Txt>
      <Txt as="p" className="set-about-desc"><MG text={about.description} /></Txt>
      <Box className="set-about-principles">
        {about.principles.map((p, i) => (
          <Box key={i} className="set-about-principle">
            <Txt as="p" className="set-about-principle-t">{p.title}</Txt>
            <Txt as="p" className="set-about-principle-b"><MG text={p.body} /></Txt>
          </Box>
        ))}
      </Box>
      <Box className="set-about-meta">
        <Txt>{t('about.version', { version: about.version })}</Txt>
        <Txt className="set-about-dot">·</Txt>
        <Txt>2026</Txt>
      </Box>
      <Txt as="p" className="set-about-credit">{about.built_with}</Txt>
      {/* Legal documents — the desktop sidebar surfaces these too, but this is
          the only path on mobile (no sidebar). Opens the public /legal page. */}
      <Box className="set-about-legal">
        <Btn type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=privacy`)}>{t('about.privacy')}</Btn>
        <Txt className="set-about-dot">·</Txt>
        <Btn type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=terms`)}>{t('about.terms')}</Btn>
        <Txt className="set-about-dot">·</Txt>
        <Btn type="button" className="set-about-legal-link" onClick={() => navigate(`${ROUTES.LEGAL}?tab=dpa`)}>{t('about.dpa')}</Btn>
      </Box>
    </Box>
  )
}

/* ── Profile body ────────────────────────────────────────────────
   Editable name + role pills + gender + role_other custom panel.
   Saves on blur (name / role_other) / click (role / gender). */
function ProfileBody({ prefs, onUpdate }) {
  const { t } = useT('settings')
  const [name, setName] = useState(prefs?.profile?.full_name || '')
  /* No default: the field is optional, so an unset role shows no pill
     selected rather than pre-selecting "אחר" and opening its free-text
     panel for a specialisation the user never claimed. */
  const role = prefs?.profile?.role || null
  const [roleOther, setRoleOther] = useState(prefs?.profile?.role_other || '')
  const [savedName, setSavedName] = useState(false)
  const [savedRoleOther, setSavedRoleOther] = useState(false)
  /* "· נשמר" is a confirmation, not a state of the field: it used to stay
     up until the next keystroke, so a name saved yesterday still read as
     just-saved today. Both flags retire themselves. */
  useEffect(() => {
    if (!savedName) return undefined
    const id = setTimeout(() => setSavedName(false), 2500)
    return () => clearTimeout(id)
  }, [savedName])
  useEffect(() => {
    if (!savedRoleOther) return undefined
    const id = setTimeout(() => setSavedRoleOther(false), 2500)
    return () => clearTimeout(id)
  }, [savedRoleOther])
  const gender = prefs?.design?.gender || 'neutral'
  const ROLE_KEYS = Object.keys(ROLE_LABELS)
  const GENDERS = ['female', 'male', 'neutral']
  /* Both rows scroll sideways on a phone; only the one that actually
     overflows gets marked (see useEdgeHint). The role labels change with
     the form of address, so the gender is what re-measures them. */
  const genderPillsRef = useRef(null)
  const rolePillsRef = useRef(null)
  useEdgeHint(genderPillsRef, gender)
  useEdgeHint(rolePillsRef, gender)

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
  /* The typed specialisation is KEPT when the role moves off "אחר". It is
     only ever displayed while role === 'other', so nothing leaks — whereas
     clearing it silently threw away what the user had written the moment
     they tapped another pill, and made coming back a retype. */
  const pickRole = (k) => {
    if (k === role) return
    onUpdate({ profile: { role: k } })
  }
  const pickGender = (g) => {
    if (g === gender) return
    onUpdate({ design: { gender: g } })
  }

  return (
    <Box className="set-profile-body">
      <Box className="m-field">
        <Box as="label" className="m-label">{t('profile.fullName')} {savedName && <Txt style={{ color: 'var(--sage)', fontWeight: 600 }}>{t('profile.saved')}</Txt>}</Box>
        <Input
          className="m-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setSavedName(false) }}
          onBlur={commitName}
          placeholder={t('profile.namePlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('profile.address')}</Box>
        <Box ref={genderPillsRef} className="m-pills">
          {GENDERS.map((g) => (
            <Btn key={g} type="button" className={`m-pill${gender === g ? ' on' : ''}`} onClick={() => pickGender(g)}>{t(`profile.genders.${g}`)}</Btn>
          ))}
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('profile.role')}</Box>
        {/* Six roles do not fit a phone: this row hides ~143px of itself at
            375px, and used to do it silently. */}
        <Box ref={rolePillsRef} className="m-pills">
          {ROLE_KEYS.map((k) => (
            <Btn key={k} type="button" className={`m-pill${role === k ? ' on' : ''}`} onClick={() => pickRole(k)}>{roleLabel(k, gender)}</Btn>
          ))}
        </Box>
      </Box>
      {role === 'other' && (
        <Box className="m-field set-role-other">
          <Box as="label" className="m-label">{t('profile.roleOther')} {savedRoleOther && <Txt style={{ color: 'var(--sage)', fontWeight: 600 }}>{t('profile.saved')}</Txt>}</Box>
          <Input
            className="m-input"
            value={roleOther}
            onChange={(e) => { setRoleOther(e.target.value); setSavedRoleOther(false) }}
            onBlur={commitRoleOther}
            placeholder={t('profile.roleOtherPlaceholder')}
          />
        </Box>
      )}
    </Box>
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
    /* The section's own group counts as requested too — see groupOfSection. */
    const group = location.state?.openGroup || groupOfSection(location.state?.openSection)
    return group ? { [group]: true } : {}
  })
  /* A deep-linked section can sit thousands of pixels below the fold, so
     opening it is only half the job. The request is stamped with the
     navigation that made it; the effect below records which navigation it
     has already scrolled for, so the request retires itself without a
     second render. */
  const [scrollReq, setScrollReq] = useState(
    () => (location.state?.openSection ? { section: location.state.openSection, nav: location.key } : null),
  )
  const scrolledForNav = useRef(null)
  /* The initializers above only run on mount. When the user is ALREADY on
     /settings and navigates here again with fresh state (e.g. HelpFab "open full
     guide", or the profile-health "complete profile" row), there's no remount —
     so reconcile per-navigation (location.key changes once per navigation) and
     open the requested section/group. Adjusted during render (not in an effect,
     which the lint forbids) — mirrors the clients screen's deep-link handling.
     Merges, so manually-opened sections persist. */
  const [prevNavKey, setPrevNavKey] = useState(location.key)
  if (location.key !== prevNavKey) {
    setPrevNavKey(location.key)
    const section = location.state?.openSection
    const group = location.state?.openGroup || groupOfSection(section)
    if (section) { setOpen((o) => ({ ...o, [section]: true })); setScrollReq({ section, nav: location.key }) }
    if (group) setOpenGroups((g) => ({ ...g, [group]: true }))
  }

  /* Bring the requested section into view once it exists. No dep array: the
     section only mounts on the render AFTER its group opens, so this waits
     for whichever render puts it in the document. Marking the navigation as
     handled is what stops it repeating — a plain ref write, so no extra
     render. A no-op on every other pass. */
  useEffect(() => {
    if (!scrollReq || scrolledForNav.current === scrollReq.nav) return
    const el = document.getElementById(`set-sec-${scrollReq.section}`)
    if (!el) return
    scrolledForNav.current = scrollReq.nav
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  const [showAddQ, setShowAddQ] = useState(false)
  /* "Where do I change X?" — answered without knowing which heading X was
     filed under. See searchSettings.js for what a query is matched against. */
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const results = useMemo(() => searchTree(SECTION_GROUPS, t, query), [t, query])
  const [editingScheduleId, setEditingScheduleId] = useState(null)
  const { questions, loading: questionsLoading, error: questionsError, addQuestion, toggleActive, updateQuestion, removeQuestion } = useUserQuestions()
  const { goals } = useGoals()
  /* C10 — which questions are wired to a goal (goals.tracked_by_question_id). */
  const goalLinkedQ = new Set((goals || []).filter((g) => g.tracked_by_question_id).map((g) => g.tracked_by_question_id))
  /* Both taxonomies are edited on the screens that use them now — client
     sub-statuses in ClientStatusesModal, lead stages and sources on the
     leads screen. Settings links to both instead of keeping thinner copies. */
  /* prefsError was collected by the provider and shown to nobody: a failed
     write rolls the value back from the server, so a toggle the user had
     just flipped simply flipped itself back, silently. Surfaced below. */
  const { prefs, loading: prefsLoading, error: prefsError, update: updatePrefs } = useUserPreferences()
  /* Every control on this screen saved in total silence — the one exception
     being the name field's "· נשמר". Nothing else told the user their tap
     had landed, so a working toggle and a dead one looked identical.
     `savePrefs` is what the preference BODIES get; the screen's own
     bookkeeping writes (recording an import, resetting onboarding,
     scheduling account deletion) keep the raw update, since none of them is
     a setting the user just changed. Stable identity — ProfileBody's
     commit-on-unmount effect depends on it. */
  const savePrefs = useCallback(async (patch) => {
    await updatePrefs(patch)
    pushNote(i18n.t('settings:common.saved'))
  }, [updatePrefs])
  const gender = prefs?.design?.gender || 'neutral'
  /* Data-section hooks — pulled lazily-ish: useClients/etc. all use a
     single network round-trip on mount, so this isn't expensive. */
  const qc = useQueryClient()
  const { clients: dataClients, refetch: refetchClients } = useClients()
  const { projects: dataProjects } = useProjects()
  const { transactions: dataTransactions } = useTransactions()
  const { categories: dataCategories } = useCategories()
  const { tasks: dataTasks } = useTasks()
  const { leads: dataLeads } = useLeads()
  const [showExport, setShowExport] = useState(false)
  /* The sub-status delete-with-reassignment flow (and its composite undo,
     which restores the status AND moves exactly the clients that were
     reassigned back onto it) moved to ClientStatusesModal, alongside the
     editor it belongs to. */
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
    /* Wipe first. On FAILURE we intentionally do NOT reset onboarding or
       navigate — the error propagates to ResetAccountModal, which stays open
       and shows it. (Previously a `finally` navigated to onboarding before the
       modal could surface the error, so a failed/partial wipe looked like a
       clean success.) Only a fully successful wipe advances to first-run. */
    await resetAllUserData()
    await updatePrefs({ onboarding: defaultOnboarding() })
    navigate(ROUTES.ONBOARDING)
  }
  /* CSV/Excel import (Settings → data). Pick one or more files → read
     every sheet via the shared multi-sheet engine → open the same
     mapping+review modal onboarding uses. */
  const importFileRef = useRef(null)
  const [importParsed, setImportParsed] = useState(null)
  /* { text, kind: 'ok' | 'error' | 'info' }. The kind used to be inferred by
     testing whether the message STARTED WITH a translated error prefix —
     which mis-coloured "no new records were created" as a green success, and
     would have silently mis-coloured every message the day the copy moved. */
  const [importMsg, setImportMsg] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const onPickImport = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setImportMsg(null)
    const UNSUPPORTED = ['pdf', 'numbers', 'pages', 'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'doc', 'docx', 'gsheet']
    if (files.some((f) => UNSUPPORTED.includes((f.name.split('.').pop() || '').toLowerCase()))) {
      setImportMsg({ text: t('data.importUnsupported'), kind: 'error' })
      return
    }
    setImportBusy(true)
    try {
      const { sheets, names } = await buildSheetsFromFiles(files)
      setImportParsed({ kind: 'csv', file_name: names, sheets })
    } catch {
      setImportMsg({ text: t('data.importFailed'), kind: 'error' })
    } finally {
      setImportBusy(false)
    }
  }
  const onImported = (summary) => {
    /* The importer bulk-inserts via direct API calls (clients, projects,
       transactions, SESSIONS, payment plans/installments, categories, leads,
       client/lead statuses) — far more than the three caches refreshed before,
       so imported sessions/plans stayed invisible on the client drawer/reports
       until staleTime elapsed. A blanket invalidate after this rare, heavy op
       resyncs every cache at once and can't miss a written table. */
    qc.invalidateQueries()
    /* Ticks "import your file" off the home setup card. Unlike the other
       two tasks there is no row whose existence means "done" — imported
       clients look exactly like typed ones — so the act is recorded. */
    updatePrefs({ setup: { imported_at: new Date().toISOString() } })
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
          /* Nothing was written. Not a failure, but not a success either —
             it reads as "your file did nothing", so it gets the neutral tone. */
          ? { text: t('data.importNone'), kind: 'info' }
          : { text: t('data.importSuccess', { parts: parts.join(' · '), estNote }), kind: 'ok' },
      )
    }
  }
  const navigate = useNavigate()
  const toggle = (key) => setOpen((cur) => ({ ...cur, [key]: !cur[key] }))
  const toggleGroup = (key) => setOpenGroups((cur) => ({ ...cur, [key]: !cur[key] }))


  const renderBody = (key) => {
    if (key === 'profile') {
      if (prefsLoading) return <Txt as="p" className="set-soon">{t('common.loading')}</Txt>
      return <ProfileBody prefs={prefs} onUpdate={savePrefs} />
    }
    if (key === 'payments') {
      if (prefsLoading) return <Txt as="p" className="set-soon">{t('common.loading')}</Txt>
      return <PaymentsBody prefs={prefs} onUpdate={savePrefs} />
    }
    if (key === 'design') {
      if (prefsLoading) return <Txt as="p" className="set-soon">{t('common.loading')}</Txt>
      return <DesignBody prefs={prefs} onUpdate={savePrefs} />
    }
    if (key === 'about') {
      return <AboutBody />
    }
    if (key === 'home') {
      if (prefsLoading) return <Txt as="p" className="set-soon">{t('common.loading')}</Txt>
      return <HomeBody prefs={prefs} onUpdate={savePrefs} />
    }
    /* Promoted out of the client-statuses section: a price list is a setting
       of its own, and it was the only thing in there that wasn't a status —
       which mattered once that section became a link to the clients screen. */
    if (key === 'meetingTypes') {
      return (
        <Box className="set-q">
          <MeetingTypesManager onChanged={refetchClients} />
        </Box>
      )
    }
    if (key === 'questions') {
      const reminderPref = prefs?.insightsReminder || { enabled: false, time: '20:00' }
      const setReminder = (patch) => savePrefs({ insightsReminder: { ...reminderPref, ...patch } })
      return (
        <Box className="set-q">
          {questionsLoading ? (
            <Txt as="p" className="set-q-empty">{t('common.loading')}</Txt>
          ) : questionsError ? (
            <Txt as="p" className="set-q-empty" style={{ color: 'var(--clay)' }}>{t('questions.loadError', { error: questionsError })}</Txt>
          ) : questions.length === 0 ? (
            <Txt as="p" className="set-q-empty">{t('questions.empty')}</Txt>
          ) : (
            questions.map((q) => (
              <Box key={q.id} className={`set-q-block${q.active ? '' : ' off'}`}>
                <Box className={`set-q-row`}>
                  <Txt className="set-q-icon">{q.icon || '🫧'}</Txt>
                  <Txt className="set-q-text">{questionText(q, gender)}</Txt>
                  {goalLinkedQ.has(q.id) && (
                    <Txt className="set-q-goal" title={t('questions.linkedToGoal')} aria-label={t('questions.linkedToGoal')}>
                      <Target size={12} strokeWidth={1.9} aria-hidden="true" />
                    </Txt>
                  )}
                  <Btn
                    type="button"
                    className="set-q-sched"
                    onClick={() => setEditingScheduleId(editingScheduleId === q.id ? null : q.id)}
                    aria-expanded={editingScheduleId === q.id}
                  >
                    <CalendarDays size={11} strokeWidth={1.7} aria-hidden="true" />
                    {describeSchedule(q)}
                  </Btn>
                  <Switch
                    checked={q.active}
                    onChange={() => toggleActive(q)}
                    label={q.active ? t('questions.toggleOff') : t('questions.toggleOn')}
                  />
                  <Btn type="button" className="set-q-del" onClick={() => removeQuestion(q.id)} aria-label={t('questions.deleteAria')}>
                    <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                  </Btn>
                </Box>
                {editingScheduleId === q.id && (
                  <QuestionScheduleEditor
                    question={q}
                    onClose={() => setEditingScheduleId(null)}
                    onUpdate={updateQuestion}
                  />
                )}
              </Box>
            ))
          )}
          <Btn type="button" className="set-q-add" onClick={() => setShowAddQ(true)}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" /> {t('questions.add')}
          </Btn>

          <Box className="set-sub-divider" />
          <Txt as="p" className="set-sub-h">{t('questions.reminderTitle')}</Txt>
          <Box className="set-reminder-row">
            <Txt className="set-reminder-toggle">
              <Switch
                checked={!!reminderPref.enabled}
                onChange={(v) => setReminder({ enabled: v })}
                label={t('questions.reminderToggle')}
              />
              <Txt>{t('questions.reminderLabel')}</Txt>
            </Txt>
            <Input
              type="time"
              className="m-input set-reminder-time"
              value={reminderPref.time || '20:00'}
              onChange={(e) => setReminder({ time: e.target.value })}
              disabled={!reminderPref.enabled}
            />
          </Box>
          <Txt as="p" className="set-reminder-hint">
            {t('questions.reminderHint')}
          </Txt>
        </Box>
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
        <Box className="set-data">
          <Txt as="p" className="set-sub-intro">{t('data.intro')}</Txt>
          <Box className="set-data-stats">
            {counts.map((c) => (
              <Box key={c.k} className="set-data-stat">
                <Txt as="p" className="set-data-stat-v mono">{c.n}</Txt>
                <Txt as="p" className="set-data-stat-l">{t(`data.counts.${c.k}`)}</Txt>
              </Box>
            ))}
          </Box>
          <Btn
            type="button"
            className="set-data-action"
            onClick={() => setShowExport(true)}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.export')}
          </Btn>
          <Txt as="p" className="set-data-hint">
            {t('data.exportHint')}
          </Txt>

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

          <Input
            ref={importFileRef}
            type="file"
            accept={ACCEPT}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { onPickImport(e.target.files); e.target.value = '' }}
          />
          <Btn
            type="button"
            className="set-data-action"
            onClick={() => importFileRef.current?.click()}
            disabled={importBusy}
            style={{ marginTop: 10 }}
          >
            <Upload size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.import')}
          </Btn>
          <Txt as="p" className="set-data-hint">
            {t('data.importHint')}
          </Txt>
          {importBusy && (
            <Txt as="p" className="set-data-hint" role="status" aria-live="polite">{t('data.importProcessing')}</Txt>
          )}
          {importMsg && (
            <Txt as="p" className={`set-data-hint set-import-msg ${importMsg.kind}`} role="status" aria-live="polite">
              {importMsg.text}
            </Txt>
          )}

          <Btn
            type="button"
            className="set-data-action"
            onClick={() => setShowRestartOb(true)}
            style={{ marginTop: 10 }}
          >
            <Sparkles size={15} strokeWidth={1.7} aria-hidden="true" />
            {t('data.restartOnboarding')}
          </Btn>
          <Txt as="p" className="set-data-hint">
            {t('data.restartHint')}
          </Txt>

        </Box>
      )
    }
    /* Its own section now. Wiping the account and deleting it outright used
       to sit at the bottom of the export/import scroll, styled like the
       buttons above them — one section, one scroll, four buttons, two of
       them irreversible. Reaching them is now a deliberate choice made at a
       heading that says what they are. */
    if (key === 'reset') {
      return (
        <Box className="set-data">
          <Txt as="p" className="set-sub-intro">{t('danger.intro')}</Txt>
          <Box className="set-danger-zone">
            <Txt as="p" className="set-danger-title">{t('danger.resetTitle')}</Txt>
            <Btn
              type="button"
              className="set-data-action danger"
              onClick={() => setShowReset(true)}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" />
              {t('danger.resetAction')}
            </Btn>
            <Txt as="p" className="set-data-hint">
              {t('danger.resetHint')}
            </Txt>

            <Txt as="p" className="set-danger-title" style={{ marginTop: 20 }}>{t('danger.deleteTitle')}</Txt>
            <Btn
              type="button"
              className="set-data-action danger"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" />
              {t('danger.deleteAction')}
            </Btn>
            <Txt as="p" className="set-data-hint">
              {t('danger.deleteHint')}
            </Txt>
          </Box>
        </Box>
      )
    }
    return <Txt as="p" className="set-soon">{t('common.soon')}</Txt>
  }

  return (
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <Settings size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('header.title')}
          </Txt>
        </Box>
      </Box>

      {prefsError && (
        <Box className="set-save-error" role="alert">
          {t('common.saveError')}
        </Box>
      )}

      <Box className="set-search">
        <Search size={16} strokeWidth={1.7} aria-hidden="true" />
        <Input
          type="search"
          className="set-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.aria')}
        />
        {query && (
          <Btn type="button" className="set-search-clear" onClick={() => setQuery('')} aria-label={t('search.clear')}>
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </Btn>
        )}
      </Box>

      {searching && results.length === 0 && (
        <Box className="set-search-empty" role="status">
          <Txt as="p">{t('search.noResults', { query: query.trim() })}</Txt>
          <Txt as="p" className="set-search-empty-hint">{t('search.noResultsHint')}</Txt>
        </Box>
      )}

      <Box className="set-list">
        {results.map(({ group, items, links }) => {
          /* While searching, every surviving group is open and so is every
             surviving section: the point of a result is to BE the answer,
             not to be another thing to click open. */
          const groupOpen = searching || !!openGroups[group.key]
          const GroupIcon = group.icon
          /* A group holding one section is that section — opening it twice
             was a door leading to a door. Its header carries the section's
             anchor id so deep links still land on it. Suspended while
             searching, where the section header is what tells the user WHAT
             matched. */
          const sole = searching ? null : soleSectionOf(group)
          return (
            <Box key={group.key} id={sole ? `set-sec-${sole.key}` : undefined} className="set-group">
              <Btn
                type="button"
                className={`set-group-head${groupOpen ? ' open' : ''}`}
                onClick={() => toggleGroup(group.key)}
                aria-expanded={groupOpen}
              >
                <Txt className="set-group-icon"><GroupIcon size={18} strokeWidth={1.6} aria-hidden="true" /></Txt>
                <Box className="set-group-text">
                  <Txt as="p" className="set-group-title">{t(group.titleKey)}</Txt>
                  <Txt as="p" className="set-group-sub">{t(group.subKey)}</Txt>
                </Box>
                <ChevronDown size={18} strokeWidth={1.6} className="set-group-chev" aria-hidden="true" />
              </Btn>
              {groupOpen && sole && (
                <Box className="set-group-children">
                  <Box className="set-group-body">{renderBody(sole.key)}</Box>
                </Box>
              )}
              {groupOpen && !sole && (
                <Box className="set-group-children">
                  {items.map((key) => {
                    const section = SECTION_DEFS[key]
                    if (!section) return null
                    const Icon = section.icon
                    const isOpen = searching || !!open[key]
                    return (
                      <Box key={key} id={`set-sec-${key}`} className={`set-acc${isOpen ? ' open' : ''}`}>
                        <Btn type="button" className="set-acc-head" onClick={() => toggle(key)} aria-expanded={isOpen}>
                          <Txt className="set-acc-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></Txt>
                          <Txt className="set-acc-text">
                            <Txt className="set-acc-title">{t(section.titleKey)}</Txt>
                            <Txt className="set-acc-sub">{t(section.subKey)}</Txt>
                          </Txt>
                          <ChevronDown size={18} strokeWidth={1.6} className="set-acc-chev" aria-hidden="true" />
                        </Btn>
                        {isOpen && <Box className="set-acc-body">{renderBody(key)}</Box>}
                      </Box>
                    )
                  })}
                  {/* Rows that leave settings, after the sections. Same shape
                      as a section header so the group reads as one list, with
                      the chevron pointing the way out instead of down. */}
                  {links.map((link) => {
                    if (link.enabled && !link.enabled()) return null
                    const LinkIcon = link.icon
                    return (
                      <Box key={link.key} className="set-acc set-link">
                        <Btn type="button" className="set-acc-head" onClick={() => navigate(link.to)}>
                          <Txt className="set-acc-icon"><LinkIcon size={18} strokeWidth={1.6} aria-hidden="true" /></Txt>
                          <Txt className="set-acc-text">
                            <Txt className="set-acc-title">{t(link.titleKey)}</Txt>
                            <Txt className="set-acc-sub">{t(link.subKey)}</Txt>
                          </Txt>
                          <ChevronLeft size={18} strokeWidth={1.6} className="set-link-chev" aria-hidden="true" />
                        </Btn>
                      </Box>
                    )
                  })}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      <AddQuestionModal
        open={showAddQ}
        onClose={() => setShowAddQ(false)}
        nextOrder={questions.length}
        onSave={addQuestion}
        usedTemplateKeys={questions.filter((q) => q.template_key).map((q) => q.template_key)}
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
    </Box>
  )
}

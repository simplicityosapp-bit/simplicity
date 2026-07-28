import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Share, Alert, Platform, DevSettings, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useNavigation } from '@react-navigation/native'
import { User, Palette, Database, LogOut, ChevronDown, ChevronUp, Sparkles, Download, X, Plus, Check, Wallet, Info, LayoutGrid, Trash2, Eye, Users, Leaf, Briefcase, Settings2, CalendarClock, Plug } from 'lucide-react-native'
import { LANGUAGE_OPTIONS } from '@simplicity/core/i18n'
import { fmtShortDate, payMethodLabel, formatDateAs, formatTimeAs, SETTINGS_TREE, soleSectionKeyOf } from '@simplicity/core'
import i18n, { setGenderContext } from '../lib/i18n'
import { csvCell } from '../lib/csv'
import { supabase } from '../lib/supabase'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Select from '../components/Select'
import { colors, THEME_KEY, getThemeMode } from '../theme/theme'
import { usePreferences } from '../hooks/usePreferences'
import { applySavedLanguage, roleLabel } from '../lib/preferences'
import { useFinanceData } from '../hooks/useFinanceData'
import { useConfigTaxonomy } from '../hooks/useConfigTaxonomy'
import DeleteAccountModal from '../modals/DeleteAccountModal'
import { resetAllUserData, buildAccountDeletionRequest } from '../lib/account'

const GENDERS = ['female', 'male', 'neutral']
// Matches web's ROLE_LABELS / common:roles.* keys (consultant/trainer had no
// translations and weren't web roles).
const ROLES = ['therapist', 'coach', 'facilitator', 'teacher', 'instructor', 'other']
const BACKGROUNDS = ['nature', 'simple', 'blank']
const THEMES = ['light', 'dark']
// Home widget registry order (mirrors web WIDGET_REGISTRY); the home honors
// prefs.widgets.list (enabled + order), so this drives the config UI.
const WIDGET_IDS = ['quote', 'moon', 'insights', 'quick-row', 'attention', 'reminders', 'next-tasks', 'chips']
// Format options mirror web lib/preferences.js (values must match the core setters).
const CURRENCIES = [{ k: 'ILS', l: '₪ שקל' }, { k: 'USD', l: '$ דולר' }, { k: 'EUR', l: '€ יורו' }]
const DATE_FMTS = [{ k: 'DD/MM/YY', l: 'DD/MM/YY' }, { k: 'MM/DD/YY', l: 'MM/DD/YY' }, { k: 'YYYY-MM-DD', l: 'YYYY-MM-DD' }]
const TIME_FMTS = [{ k: '24h', l: '24 שעות' }, { k: '12h', l: '12h' }]
const WEEK_STARTS = [{ k: 'sunday', l: 'ראשון' }, { k: 'monday', l: 'שני' }]
const T = (k, o) => i18n.t(`settings:${k}`, o)

// Two-level section tree — a group (collapsible) holds sections (also
// collapsible), and each section key maps to a body in renderBody() below.
//
// The STRUCTURE comes from @simplicity/core, not from a copy kept here. This
// screen used to hold its own list while reading every title from the SAME
// shared i18n namespace, so when web regrouped (2026-07-28) each heading this
// file asked for was retired underneath it and the screen quietly rendered raw
// keys. Nothing threw; the only way to notice was to open the screen, on a
// platform that has no device to open it on. Icons stay local — lucide-react
// and lucide-react-native are different packages.
const SECTION_ICON = {
  profile: User, design: Palette, home: LayoutGrid, payments: CalendarClock,
  meetingTypes: Wallet, questions: Sparkles, clients: Users, leads: Leaf,
  data: Database, reset: Trash2, about: Info,
}
const GROUP_ICON = { personal: User, appearance: Eye, work: Briefcase, account: Settings2 }

// Rows that leave settings. The tree names them; each app resolves the name
// to its own destination, since a react-router path means nothing here.
// A key with no entry is simply not drawn — this build has no subscription
// or help screen, so those rows don't appear.
// Settings is a STACK screen, so a bare name only resolves to another stack
// screen. Clients is a TAB inside "Main" — navigating to it by name from here
// is not handled by any navigator and silently does nothing, which is how
// BottomBar and TileDrillModal already reach it. Leads / Connections / Trash
// are stack screens and take the plain form.
const LINK_TARGET = {
  clients: ['Main', { screen: 'Clients' }],
  leads: ['Leads'],
  connections: ['Connections'],
  trash: ['Trash'],
}
const LINK_ICON = { clients: Users, leads: Leaf, connections: Plug, trash: Trash2 }

// On/off switch (mirrors web Switch). RN has no built-in, so it's a pill track + knob.
function Switch({ checked, onChange }) {
  return (
    <Pressable style={[styles.switchTrack, checked && styles.switchTrackOn]} onPress={() => onChange(!checked)} accessibilityRole="switch" accessibilityState={{ checked }} hitSlop={6}>
      <View style={[styles.switchKnob, checked && styles.switchKnobOn]} />
    </Pressable>
  )
}

function SwitchField({ label, hint, checked, onChange }) {
  return (
    <View style={styles.field}>
      <View style={styles.switchRow}>
        <Text style={[styles.label, styles.switchLabel]}>{label}</Text>
        <Switch checked={checked} onChange={onChange} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

// Top-level group — a glass card (mirrors web's .set-group) holding a collapsible
// head + its nested section cards, so nothing floats bare on the screen photo.
function Group({ Icon, title, sub, open, onToggle, children }) {
  return (
    <Card padded={false} contentStyle={styles.groupCard}>
      <Pressable style={[styles.groupHead, open && styles.groupHeadOpen]} onPress={onToggle}>
        <View style={styles.groupIcon}><Icon size={19} strokeWidth={1.7} color={colors.brand} /></View>
        <View style={styles.groupTitleWrap}>
          <Text style={styles.groupTitle}>{title}</Text>
          {sub ? <Text style={styles.groupSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <ChevronDown size={18} strokeWidth={1.7} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? <View style={styles.groupChildren}>{children}</View> : null}
    </Card>
  )
}

function Section({ Icon, title, sub, open, onToggle, children }) {
  return (
    <Card padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
      <Pressable style={styles.secHead} onPress={onToggle}>
        <View style={styles.secIcon}><Icon size={17} strokeWidth={1.7} color={colors.brand} /></View>
        <View style={styles.secTitleWrap}>
          <Text style={styles.secTitle}>{title}</Text>
          {sub ? <Text style={styles.secSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? <View style={styles.secBody}>{children}</View> : null}
    </Card>
  )
}

function Pills({ options, value, onPick, accent }) {
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const on = value === o.k
        return (
          <Pressable key={o.k} style={[styles.pill, on && (accent === 'brand' ? styles.pillOnBrand : styles.pillOn)]} onPress={() => onPick(o.k)}>
            <Text style={[styles.pillText, on && (accent === 'brand' ? styles.pillTextOn : styles.pillTextOnInv)]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Settings — a two-level tree (groups → sections) matching the web app. Persists to
// user prefs (usePreferences); the language switch applies immediately via i18next
// (an RTL he↔ltr flip needs an app restart). Theme/format changes reload the app so
// RN's frozen StyleSheet colors + core format setters pick up the new values.
export default function SettingsScreen() {
  const nav = useNavigation()
  const { prefs, update } = usePreferences()
  const { transactions, clients, categories } = useFinanceData()
  const tax = useConfigTaxonomy()
  const [openGroups, setOpenGroups] = useState({})
  const [open, setOpen] = useState({})
  const [lang, setLang] = useState(i18n.language)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const toggleGroup = (k) => setOpenGroups((g) => ({ ...g, [k]: !g[k] }))
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // Optional field: an unset role shows the placeholder, not a pre-selected
  // "אחר" (which also opened its free-text row for a specialisation the user
  // never claimed). Mirrors the web Settings screen.
  const role = prefs.profile?.role || null
  const setLanguage = (code) => { setLang(code); applySavedLanguage(code); update({ design: { language: code } }) }
  // Form of address → i18next context (matches web's prefs.design.gender). Apply
  // immediately so this screen re-renders gendered; other screens pick it up on
  // their next render (gender is set-once, like web).
  const setGender = (g) => { setGenderContext(g); update({ design: { gender: g } }) }
  // update() one-level deep-merges, so pass only the changed leaf (passing a
  // spread of the render-closure prefs risks dropping a concurrently-changed sibling).
  const setDesign = (patch) => update({ design: patch })
  const setFormat = (k, v) => update({ format: { [k]: v } })
  // Theme lives in prefs.design.theme (synced with web) AND AsyncStorage THEME_KEY
  // (read at boot — RN freezes StyleSheet colors, so a switch needs a reload).
  const reloadApp = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) { window.location.reload(); return }
    try { DevSettings.reload() } catch { /* production build needs a manual restart */ }
  }
  const setTheme = async (mode) => {
    setDesign({ theme: mode })
    try { await AsyncStorage.setItem(THEME_KEY, mode) } catch { /* boot defaults to light */ }
    reloadApp()
  }
  // Legal pages live on the web app; open them in the browser (same content).
  const openLegal = (tab) => { Linking.openURL(`https://simplicity-os.com/legal?tab=${tab}`).catch(() => {}) }
  const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0'

  // Home widgets: enable/disable + order (what the home actually honors). Start
  // from the saved list, else the registry default; append any missing ids.
  const widgetList = (() => {
    const saved = prefs.widgets?.list
    const base = (saved && saved.length) ? saved.filter((w) => WIDGET_IDS.includes(w.id)) : []
    const have = new Set(base.map((w) => w.id))
    WIDGET_IDS.forEach((id) => { if (!have.has(id)) base.push({ id, enabled: true }) })
    return base
  })()
  const writeWidgets = (list) => update({ widgets: { list } })
  const toggleWidget = (id) => writeWidgets(widgetList.map((w) => (w.id === id ? { ...w, enabled: w.enabled === false } : w)))
  const moveWidget = (id, dir) => {
    const i = widgetList.findIndex((w) => w.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= widgetList.length) return
    const next = widgetList.slice()
    const tmp = next[i]; next[i] = next[j]; next[j] = tmp
    writeWidgets(next)
  }

  // Reset (soft-delete all data) — double-confirm, then reload so lists refresh.
  const resetData = () => {
    const cancel = i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })
    Alert.alert(
      T('danger.resetTitle', { defaultValue: 'איפוס חשבון' }),
      T('danger.resetHint', { defaultValue: 'מוחק את כל הנתונים בחשבון. אי אפשר לבטל.' }),
      [
        { text: cancel, style: 'cancel' },
        {
          text: T('danger.resetAction', { defaultValue: 'מחיקת כל הנתונים' }),
          style: 'destructive',
          onPress: () => Alert.alert(
            T('danger.resetTitle', { defaultValue: 'איפוס חשבון' }),
            i18n.t('settings:danger.resetConfirmAgain', { defaultValue: 'בטוח/ה? הפעולה בלתי-הפיכה.' }),
            [
              { text: cancel, style: 'cancel' },
              { text: T('danger.resetAction', { defaultValue: 'מחק הכל' }), style: 'destructive', onPress: async () => { try { await resetAllUserData() } catch { /* surfaced by reload */ } reloadApp() } },
            ],
          ),
        },
      ],
    )
  }
  // Record the account-deletion request → AuthedApp gates to the pending screen.
  const requestDeletion = async () => { await update({ accountDeletion: buildAccountDeletionRequest() }) }

  const exportCsv = async (kind) => {
    let header, rows
    if (kind === 'clients') {
      header = ['שם', 'טלפון', 'אימייל', 'סטטוס']
      rows = clients.map((c) => [c.name || '', c.phone || '', c.email || '', c.status_meta || c.status || ''])
    } else {
      const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]))
      const cliById = Object.fromEntries(clients.map((c) => [c.id, c.name]))
      header = ['תאריך', 'תיאור', 'סוג', 'סכום', 'לקוח', 'קטגוריה', 'אמצעי תשלום']
      rows = transactions.filter((t) => !t.deleted_at).map((t) => [fmtShortDate(t.date), t.desc || '', t.type === 'income' ? 'הכנסה' : 'הוצאה', t.amount, cliById[t.client_id] || t.recipient_name || '', catById[t.category_id] || '', payMethodLabel(t.payment_method) || ''])
    }
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
    try { await Share.share({ message: csv }) } catch { /* cancelled / unsupported */ }
  }

  const signOut = () => {
    Alert.alert(
      i18n.t('nav:signOut', { defaultValue: 'התנתקות' }),
      i18n.t('settings:danger.signOutConfirm', { defaultValue: 'להתנתק מהחשבון?' }),
      [
        { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: i18n.t('nav:signOut', { defaultValue: 'התנתקות' }), style: 'destructive', onPress: () => supabase.auth.signOut() },
      ],
    )
  }

  // Section bodies keyed by section id (mirrors web's renderBody switch). Grouping
  // is purely presentational — the same controls, split by web's section boundaries.
  // Captured once per render so every date/time example describes one moment.
  const now = new Date()
  const renderBody = (key) => {
    if (key === 'profile') {
      return (
        <>
          <Field label={T('profile.fullName', { defaultValue: 'שם מלא' })}>
            <TextInput style={styles.input} value={prefs.profile?.full_name || ''} onChangeText={(v) => update({ profile: { full_name: v } })} placeholder={T('profile.namePlaceholder', { defaultValue: 'השם שלך' })} placeholderTextColor={colors.textFaint} />
          </Field>
          <Field label={T('profile.genders.label', { defaultValue: 'פנייה' })}>
            <Pills accent="brand" options={GENDERS.map((g) => ({ k: g, label: T(`profile.genders.${g}`, { defaultValue: g }) }))} value={prefs.design?.gender || 'neutral'} onPick={setGender} />
          </Field>
          <Select label={T('profile.role', { defaultValue: 'תפקיד' })} value={role} onChange={(v) => update({ profile: { role: v } })}
            options={ROLES.map((r) => ({ value: r, label: roleLabel(r, prefs.design?.gender) || r }))} />
          {role === 'other' ? (
            <Field label={T('profile.roleOther', { defaultValue: 'תפקיד אחר' })}>
              <TextInput style={styles.input} value={prefs.profile?.role_other || ''} onChangeText={(v) => update({ profile: { role_other: v } })} placeholder={T('profile.roleOtherPlaceholder', { defaultValue: '' })} placeholderTextColor={colors.textFaint} />
            </Field>
          ) : null}
        </>
      )
    }
    if (key === 'design') {
      return (
        <>
          <Field label={T('design.language', { defaultValue: 'שפה' })}>
            <Pills options={LANGUAGE_OPTIONS.map((l) => ({ k: l.v, label: l.l }))} value={lang} onPick={setLanguage} />
            {lang === 'he' ? null : <Text style={styles.hint}>{T('design.rtlHint', { defaultValue: 'שינוי כיווניות מלא מתעדכן לאחר הפעלה מחדש.' })}</Text>}
          </Field>
          <Field label={T('design.theme', { defaultValue: 'מצב יום/לילה' })}>
            <Pills options={THEMES.map((m) => ({ k: m, label: T(`options.theme.${m}`, { defaultValue: m }) }))} value={prefs.design?.theme || getThemeMode()} onPick={setTheme} />
            <Text style={styles.hint}>{T('design.themeHint', { defaultValue: 'החלפת המצב מרעננת את האפליקציה.' })}</Text>
          </Field>
          {/* Text-size control is hidden until app-wide font scaling is built — RN has
              no global font-scale (no central Text primitive), so the pref currently
              does nothing. The prefs.design.text_size plumbing is kept for that future
              build; showing a control that silently no-ops is worse than omitting it. */}
          <Field label={T('design.background', { defaultValue: 'רקע' })}>
            <Pills options={BACKGROUNDS.map((b) => ({ k: b, label: T(`design.backgrounds.${b}`, { defaultValue: b }) }))} value={prefs.design?.background || 'nature'} onPick={(b) => setDesign({ background: b })} />
          </Field>
          <SwitchField label={T('design.hebrewCalendar', { defaultValue: 'לוח עברי' })} checked={!!prefs.design?.hebrew_calendar} onChange={(v) => setDesign({ hebrew_calendar: v })} />
          <SwitchField label={T('design.hebrewDateInput', { defaultValue: 'בחירת תאריך בלוח עברי' })} checked={!!prefs.design?.hebrew_date_input} onChange={(v) => setDesign({ hebrew_date_input: v })} />
          {(prefs.design?.hebrew_calendar || prefs.design?.hebrew_date_input) ? (
            <SwitchField label={T('design.hebrewCalendarDual', { defaultValue: 'הצגת תאריך לועזי לצד העברי' })} checked={!!prefs.design?.hebrew_calendar_dual} onChange={(v) => setDesign({ hebrew_calendar_dual: v })} />
          ) : null}
        </>
      )
    }
    if (key === 'home') {
      return widgetList.map((w, i) => (
        <View key={w.id} style={styles.widgetRow}>
          <View style={styles.widgetReorder}>
            <Pressable onPress={() => moveWidget(w.id, -1)} disabled={i === 0} hitSlop={6}><ChevronUp size={16} strokeWidth={1.8} color={i === 0 ? colors.textFaint : colors.textSub} /></Pressable>
            <Pressable onPress={() => moveWidget(w.id, 1)} disabled={i === widgetList.length - 1} hitSlop={6}><ChevronDown size={16} strokeWidth={1.8} color={i === widgetList.length - 1 ? colors.textFaint : colors.textSub} /></Pressable>
          </View>
          <Text style={styles.widgetName} numberOfLines={1}>{T(`widgets.names.${w.id}`, { defaultValue: w.id })}</Text>
          <Switch checked={w.enabled !== false} onChange={() => toggleWidget(w.id)} />
        </View>
      ))
    }
    if (key === 'payments') {
      return (
        <>
          <Field label={T('payments.currency', { defaultValue: 'מטבע' })}>
            <Pills options={CURRENCIES.map((c) => ({ k: c.k, label: T(`options.currency.${c.k}`, { defaultValue: c.l }) }))} value={prefs.format?.currency || 'ILS'} onPick={(v) => setFormat('currency', v)} />
          </Field>
          {/* The pills showed the pattern strings — "DD/MM/YY", "12h" — which
              is developer notation offered as a choice. They now show TODAY
              formatted each way, through the same functions the app formats
              with, so the example can't drift from the result. */}
          <Field label={T('payments.dateFormat', { defaultValue: 'פורמט תאריך' })}>
            <Pills options={DATE_FMTS.map((d) => ({ k: d.k, label: formatDateAs(d.k, now) }))} value={prefs.format?.date_format || 'DD/MM/YY'} onPick={(v) => setFormat('date_format', v)} />
            <Text style={styles.hint}>{T('payments.exampleToday', { defaultValue: '' })}</Text>
          </Field>
          <Field label={T('payments.timeFormat', { defaultValue: 'פורמט שעה' })}>
            <Pills options={TIME_FMTS.map((t) => ({ k: t.k, label: formatTimeAs(t.k, now) }))} value={prefs.format?.time_format || '24h'} onPick={(v) => setFormat('time_format', v)} />
          </Field>
          <Field label={T('payments.weekStart', { defaultValue: 'יום ראשון בשבוע' })}>
            <Pills options={WEEK_STARTS.map((w) => ({ k: w.k, label: T(`options.weekStart.${w.k}`, { defaultValue: w.l }) }))} value={prefs.format?.week_start || 'sunday'} onPick={(v) => setFormat('week_start', v)} />
          </Field>
        </>
      )
    }
    /* A price list is a setting in its own right, and it was the only thing
       inside the client-statuses section that wasn't a status. */
    if (key === 'meetingTypes') {
      return (
        <TaxonomyManager
          items={tax.meetingTypes.map((m) => ({ id: m.id, label: `${m.name}${m.default_price != null ? ` · ₪${m.default_price}` : ''}`, editName: m.name, editSecond: m.default_price != null ? String(m.default_price) : '' }))}
          placeholder={T('payments.typePlaceholder', { defaultValue: 'סוג פגישה…' })}
          secondPlaceholder="₪"
          onAdd={(name, price) => tax.addMeetingType(name, price ? Number(price) : null)}
          onUpdate={(id, name, price) => tax.updateMeetingType(id, name, price ? Number(price) : null)}
          onRemove={tax.removeMeetingType}
        />
      )
    }
    /* The client-status and lead editors that used to sit here now live on
       the screens that use them — StatusManager became ClientStatusesModal on
       web, and mobile's leads screen grew a LeadSourcesPanel beside the stage
       panel it already had. Settings links to both. */
    if (key === 'questions') {
      return (
        <Pressable style={styles.rowBtn} onPress={() => nav.navigate('Insights')}>
          <Sparkles size={16} strokeWidth={1.7} color={colors.textSub} />
          <Text style={styles.rowBtnText}>{T('questions.manage', { defaultValue: 'ניהול השאלות היומיות' })}</Text>
          <View style={{ flex: 1 }} />
          <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
        </Pressable>
      )
    }
    if (key === 'data') {
      return (
        <>
          <Text style={styles.intro}>{T('data.intro', { defaultValue: 'ייצוא הנתונים שלך.' })}</Text>
          <Pressable style={styles.rowBtn} onPress={() => exportCsv('clients')}>
            <Download size={16} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.rowBtnText}>{T('data.exportClients', { defaultValue: 'ייצוא לקוחות (CSV)' })}</Text>
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={() => exportCsv('transactions')}>
            <Download size={16} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.rowBtnText}>{T('data.exportTransactions', { defaultValue: 'ייצוא תנועות (CSV)' })}</Text>
          </Pressable>
        </>
      )
    }
    /* Its own section. Wiping the account and deleting it outright used to be
       the bottom of the export scroll, one flick below two harmless buttons.
       Reaching them is now a deliberate choice made at a header that says so. */
    if (key === 'reset') {
      return (
        <>
          <Text style={styles.intro}>{T('danger.intro', { defaultValue: '' })}</Text>
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>{T('danger.resetTitle', { defaultValue: 'איפוס חשבון' })}</Text>
            <Pressable style={styles.dangerBtn} onPress={resetData}>
              <Trash2 size={15} strokeWidth={1.7} color={colors.danger} />
              <Text style={styles.dangerBtnText}>{T('danger.resetAction', { defaultValue: 'מחיקת כל הנתונים והתחלה מאפס' })}</Text>
            </Pressable>
            <Text style={styles.hint}>{T('danger.resetHint', { defaultValue: '' })}</Text>

            <Text style={[styles.dangerTitle, { marginTop: 16 }]}>{T('danger.deleteTitle', { defaultValue: 'מחיקת חשבון' })}</Text>
            <Pressable style={styles.dangerBtn} onPress={() => setShowDeleteAccount(true)}>
              <Trash2 size={15} strokeWidth={1.7} color={colors.danger} />
              <Text style={styles.dangerBtnText}>{T('danger.deleteAction', { defaultValue: 'מחיקת החשבון לצמיתות' })}</Text>
            </Pressable>
            <Text style={styles.hint}>{T('danger.deleteHint', { defaultValue: '' })}</Text>
          </View>
        </>
      )
    }
    if (key === 'about') {
      return (
        <>
          <Text style={styles.intro}>{T('about.version', { version: appVersion, defaultValue: `גרסה ${appVersion}` })}</Text>
          <Pressable style={styles.rowBtn} onPress={() => openLegal('privacy')}>
            <Text style={styles.rowBtnText}>{T('about.privacy', { defaultValue: 'מדיניות פרטיות' })}</Text>
            <View style={{ flex: 1 }} />
            <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={() => openLegal('terms')}>
            <Text style={styles.rowBtnText}>{T('about.terms', { defaultValue: 'תנאי שימוש' })}</Text>
            <View style={{ flex: 1 }} />
            <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={() => openLegal('dpa')}>
            <Text style={styles.rowBtnText}>{T('about.dpa', { defaultValue: 'הסכם עיבוד נתונים' })}</Text>
            <View style={{ flex: 1 }} />
            <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
          </Pressable>
        </>
      )
    }
    return null
  }

  return (
    <Screen name="tasks">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHead title={i18n.t('settings:header.title', { defaultValue: 'הגדרות' })} />

        {SETTINGS_TREE.map((g) => {
          const items = g.items
          /* A group holding one section IS that section — opening it twice
             was a door leading to a door, the same complaint the old
             one-section "נתונים" and "אודות" groups earned. */
          const sole = soleSectionKeyOf(g)
          /* Links this build can actually resolve. There is no subscription
             or help screen here, so those rows simply aren't drawn. */
          const links = (g.links || []).filter((k) => LINK_TARGET[k])
          return (
            <Group
              key={g.key}
              Icon={GROUP_ICON[g.key] || Info}
              title={T(`groups.${g.key}.title`, { defaultValue: g.key })}
              sub={T(`groups.${g.key}.sub`, { defaultValue: '' })}
              open={!!openGroups[g.key]}
              onToggle={() => toggleGroup(g.key)}
            >
              {sole ? (
                <View style={styles.groupSoleBody}>{renderBody(sole)}</View>
              ) : (
                <>
                  {items.map((key) => {
                    const Icon = SECTION_ICON[key] || Info
                    return (
                      <Section
                        key={key}
                        Icon={Icon}
                        title={T(`sections.${key}.title`, { defaultValue: key })}
                        sub={T(`sections.${key}.sub`, { defaultValue: '' })}
                        open={!!open[key]}
                        onToggle={() => toggle(key)}
                      >
                        {renderBody(key)}
                      </Section>
                    )
                  })}
                  {links.map((key) => {
                    const LinkIcon = LINK_ICON[key] || Info
                    return (
                      <Card key={key} padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
                        <Pressable style={styles.secHead} onPress={() => nav.navigate(...LINK_TARGET[key])}>
                          <View style={styles.secIcon}><LinkIcon size={17} strokeWidth={1.7} color={colors.brand} /></View>
                          <View style={styles.secTitleWrap}>
                            <Text style={styles.secTitle}>{T(`links.${key}.title`, { defaultValue: key })}</Text>
                            <Text style={styles.secSub} numberOfLines={1}>{T(`links.${key}.sub`, { defaultValue: '' })}</Text>
                          </View>
                          {/* The file's existing "go forward" glyph — the
                              legal links and the questions row use the same
                              rotated chevron, so links read alike. */}
                          <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
                        </Pressable>
                      </Card>
                    )
                  })}
                </>
              )}
            </Group>
          )
        })}

        {/* Sign out */}
        <Pressable style={styles.signOut} onPress={signOut}>
          <LogOut size={17} strokeWidth={1.7} color={colors.danger} />
          <Text style={styles.signOutText}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
        </Pressable>
      </ScrollView>
      <DeleteAccountModal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} onConfirm={requestDeletion} />
    </Screen>
  )
}

function Field({ label, children }) {
  return <View style={styles.field}>{label ? <Text style={styles.label}>{label}</Text> : null}{children}</View>
}

// Chips + inline add (name [+ optional second field]) for a config taxonomy.
function TaxonomyManager({ title, items, placeholder, secondPlaceholder, onAdd, onUpdate, onRemove }) {
  const [name, setName] = useState('')
  const [second, setSecond] = useState('')
  const [editId, setEditId] = useState(null) // when set, the add-row edits this item
  const [busy, setBusy] = useState(false)
  const reset = () => { setName(''); setSecond(''); setEditId(null) }
  const submit = async () => {
    const v = name.trim(); if (!v || busy) return
    setBusy(true)
    try { if (editId && onUpdate) await onUpdate(editId, v, second.trim()); else await onAdd(v, second.trim()); reset() } finally { setBusy(false) }
  }
  // Tapping a chip's label loads it into the row for editing (only if onUpdate).
  const startEdit = (it) => { if (!onUpdate) return; setEditId(it.id); setName(it.editName ?? it.label); setSecond(it.editSecond ?? '') }
  return (
    <View style={styles.taxBlock}>
      {/* Optional: a manager that is the ONLY thing in its section already has
          the section header saying what it is, and a second heading under it
          repeating the words is just an empty line's worth of noise. */}
      {title ? <Text style={styles.taxTitle}>{title}</Text> : null}
      <View style={styles.chips}>
        {items.length ? items.map((it) => (
          <View key={it.id} style={[styles.chip, editId === it.id && styles.chipEditing]}>
            {it.color ? <View style={[styles.chipDot, { backgroundColor: it.color }]} /> : null}
            <Pressable onPress={() => startEdit(it)} disabled={!onUpdate}><Text style={styles.chipText}>{it.label}</Text></Pressable>
            <Pressable onPress={() => onRemove(it.id)} hitSlop={6}><X size={12} strokeWidth={2} color={colors.textFaint} /></Pressable>
          </View>
        )) : <Text style={styles.hint}>{i18n.t('settings:common.none', { defaultValue: '—' })}</Text>}
      </View>
      <View style={styles.addRow}>
        <TextInput style={[styles.input, styles.addInput]} value={name} onChangeText={setName} placeholder={placeholder} placeholderTextColor={colors.textFaint} onSubmitEditing={submit} />
        {secondPlaceholder ? <TextInput style={[styles.input, styles.addSecond]} value={second} onChangeText={setSecond} placeholder={secondPlaceholder} placeholderTextColor={colors.textFaint} keyboardType="numeric" /> : null}
        {editId ? <Pressable style={styles.addCancel} onPress={reset} hitSlop={6}><X size={16} strokeWidth={2} color={colors.textSub} /></Pressable> : null}
        <Pressable style={styles.addBtn} onPress={submit} disabled={busy || !name.trim()}>{editId ? <Check size={18} strokeWidth={2.2} color={colors.onBrand} /> : <Plus size={18} strokeWidth={2} color={colors.onBrand} />}</Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 14 },

  // Group (top level) — a glass card wrapping head + nested sections
  groupCard: {},
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 16 },
  groupHeadOpen: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  groupIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  groupTitleWrap: { flex: 1 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  groupSub: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  groupChildren: { gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14 },
  /* A one-section group renders that section's body straight into the
     children slot — no inner card, no second header, so no indent either. */
  groupSoleBody: { gap: 10 },

  // Section (nested)
  sectionOuter: {},
  section: {},
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  secIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  secTitleWrap: { flex: 1 },
  secTitle: { fontSize: 15, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  secSub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  secBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 14 },

  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  hint: { fontSize: 11, color: colors.textFaint, lineHeight: 16 },
  intro: { fontSize: 13, color: colors.textSub, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.cardFlat, borderWidth: 1, borderColor: colors.border, padding: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  switchTrackOn: { backgroundColor: colors.brand, borderColor: colors.brand, justifyContent: 'flex-end' },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.card },
  switchKnobOn: { backgroundColor: colors.onBrand },
  widgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  widgetReorder: { flexDirection: 'row', gap: 2 },
  widgetName: { flex: 1, fontSize: 14, color: colors.text },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.text, borderColor: colors.text },
  pillOnBrand: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  // Neutral "on" pill = colors.text fill (dark in light, cream in dark), so its
  // label must be the inverse (colors.bg) to stay legible in BOTH themes — web
  // flips espresso↔cream the same way. onBrand (white) would vanish on the cream
  // dark-mode fill.
  pillTextOnInv: { color: colors.bg, fontWeight: '600' },

  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowBtnText: { fontSize: 14, color: colors.text },

  // Config taxonomy managers
  taxBlock: { gap: 8 },
  taxTitle: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  chipEditing: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipIcon: { fontSize: 12 },
  chipText: { fontSize: 13, color: colors.text },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1 },
  addSecond: { width: 70 },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addCancel: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  metaPills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaPill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  metaPillOn: { backgroundColor: colors.text, borderColor: colors.text },
  metaPillText: { fontSize: 12, color: colors.textSub },

  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 4 },
  signOutText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  dangerZone: { marginTop: 8, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, gap: 8 },
  dangerTitle: { fontSize: 13, fontWeight: '700', color: colors.danger },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(181,99,78,0.4)', backgroundColor: 'rgba(181,99,78,0.06)' },
  dangerBtnText: { fontSize: 14, color: colors.danger, fontWeight: '500' },
})

Group.displayName = 'Group'
Section.displayName = 'Section'
Pills.displayName = 'Pills'
Field.displayName = 'Field'

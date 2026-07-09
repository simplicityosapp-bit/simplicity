import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Share, Alert, Platform, DevSettings, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useNavigation } from '@react-navigation/native'
import { User, Palette, Database, LogOut, ChevronDown, ChevronUp, Sparkles, Download, X, Plus, Wallet, Info, LayoutGrid, Trash2, Eye, Layers, Users, Leaf } from 'lucide-react-native'
import { LANGUAGE_OPTIONS } from '@simplicity/core/i18n'
import { fmtShortDate, payMethodLabel } from '@simplicity/core'
import i18n, { setGenderContext } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Select from '../components/Select'
import { colors, THEME_KEY, getThemeMode } from '../theme/theme'
import { usePreferences } from '../hooks/usePreferences'
import { applySavedLanguage } from '../lib/preferences'
import { useFinanceData } from '../hooks/useFinanceData'
import { useConfigTaxonomy } from '../hooks/useConfigTaxonomy'
import DeleteAccountModal from '../modals/DeleteAccountModal'
import { resetAllUserData, buildAccountDeletionRequest } from '../lib/account'

const GENDERS = ['female', 'male', 'neutral']
const ROLES = ['therapist', 'coach', 'consultant', 'trainer', 'other']
const TEXT_SIZES = ['small', 'normal', 'large']
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

// Two-level section tree — mirrors web's SECTION_GROUPS exactly: a group (collapsible)
// holds a set of sections (also collapsible). Each section key maps to a body in
// renderBody() below. Group + section icons match web's SECTION_GROUPS / SECTION_DEFS.
const SECTION_ICON = { profile: User, design: Palette, widgets: LayoutGrid, payments: Wallet, clients: Users, leads: Leaf, questions: Sparkles, data: Database, about: Info }
const GROUPS = [
  { key: 'personal', Icon: User, items: ['profile', 'design'] },
  { key: 'display', Icon: Eye, items: ['widgets', 'payments'] },
  { key: 'workflow', Icon: Layers, items: ['clients', 'leads', 'questions'] },
  { key: 'data', Icon: Database, items: ['data'] },
  { key: 'about', Icon: Info, items: ['about'] },
]

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

  const role = prefs.profile?.role || 'other'
  const setLanguage = (code) => { setLang(code); applySavedLanguage(code); update({ language: code }) }
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
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
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
    const csv = [header, ...rows].map((r) => r.map(q).join(',')).join('\n')
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
            options={ROLES.map((r) => ({ value: r, label: T(`profile.roles.${r}`, { defaultValue: r }) }))} />
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
          <Field label={T('design.textSize', { defaultValue: 'גודל טקסט' })}>
            <Pills options={TEXT_SIZES.map((s) => ({ k: s, label: T(`design.textSizes.${s}`, { defaultValue: s }) }))} value={prefs.design?.text_size || 'normal'} onPick={(s) => setDesign({ text_size: s })} />
          </Field>
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
    if (key === 'widgets') {
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
          <Field label={T('payments.dateFormat', { defaultValue: 'פורמט תאריך' })}>
            <Pills options={DATE_FMTS.map((d) => ({ k: d.k, label: d.l }))} value={prefs.format?.date_format || 'DD/MM/YY'} onPick={(v) => setFormat('date_format', v)} />
          </Field>
          <Field label={T('payments.timeFormat', { defaultValue: 'פורמט שעה' })}>
            <Pills options={TIME_FMTS.map((t) => ({ k: t.k, label: T(`options.timeFormat.${t.k}`, { defaultValue: t.l }) }))} value={prefs.format?.time_format || '24h'} onPick={(v) => setFormat('time_format', v)} />
          </Field>
          <Field label={T('payments.weekStart', { defaultValue: 'יום ראשון בשבוע' })}>
            <Pills options={WEEK_STARTS.map((w) => ({ k: w.k, label: T(`options.weekStart.${w.k}`, { defaultValue: w.l }) }))} value={prefs.format?.week_start || 'sunday'} onPick={(v) => setFormat('week_start', v)} />
          </Field>
        </>
      )
    }
    if (key === 'clients') {
      return (
        <>
          <StatusManager tax={tax} />
          <TaxonomyManager
            title={T('clients.meetingTypesHeading', { defaultValue: 'סוגי פגישה ומחירים' })}
            items={tax.meetingTypes.map((m) => ({ id: m.id, label: `${m.name}${m.default_price != null ? ` · ₪${m.default_price}` : ''}` }))}
            placeholder={T('payments.typePlaceholder', { defaultValue: 'סוג פגישה…' })}
            secondPlaceholder="₪"
            onAdd={(name, price) => tax.addMeetingType(name, price ? Number(price) : null)}
            onRemove={tax.removeMeetingType}
          />
        </>
      )
    }
    if (key === 'leads') {
      return (
        <>
          <TaxonomyManager
            title={T('leads.sources', { defaultValue: 'מקורות פנייה' })}
            items={tax.leadSources.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
            placeholder={T('leads.sourcePlaceholder', { defaultValue: 'מקור חדש…' })}
            onAdd={(name) => tax.addLeadSource(name)}
            onRemove={tax.removeLeadSource}
          />
          <LeadStatusManager tax={tax} />
        </>
      )
    }
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

          {/* Danger zone — reset data + delete account (mirrors web) */}
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

        {GROUPS.map((g) => (
          <Group
            key={g.key}
            Icon={g.Icon}
            title={T(`groups.${g.key}.title`, { defaultValue: g.key })}
            sub={T(`groups.${g.key}.sub`, { defaultValue: '' })}
            open={!!openGroups[g.key]}
            onToggle={() => toggleGroup(g.key)}
          >
            {g.items.map((key) => {
              const Icon = SECTION_ICON[key]
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
          </Group>
        ))}

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
function TaxonomyManager({ title, items, placeholder, secondPlaceholder, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [second, setSecond] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = name.trim(); if (!v || busy) return
    setBusy(true); try { await onAdd(v, second.trim()); setName(''); setSecond('') } finally { setBusy(false) }
  }
  return (
    <View style={styles.taxBlock}>
      <Text style={styles.taxTitle}>{title}</Text>
      <View style={styles.chips}>
        {items.length ? items.map((it) => (
          <View key={it.id} style={styles.chip}>
            {it.color ? <View style={[styles.chipDot, { backgroundColor: it.color }]} /> : null}
            <Text style={styles.chipText}>{it.label}</Text>
            <Pressable onPress={() => onRemove(it.id)} hitSlop={6}><X size={12} strokeWidth={2} color={colors.textFaint} /></Pressable>
          </View>
        )) : <Text style={styles.hint}>{i18n.t('settings:common.none', { defaultValue: '—' })}</Text>}
      </View>
      <View style={styles.addRow}>
        <TextInput style={[styles.input, styles.addInput]} value={name} onChangeText={setName} placeholder={placeholder} placeholderTextColor={colors.textFaint} onSubmitEditing={add} />
        {secondPlaceholder ? <TextInput style={[styles.input, styles.addSecond]} value={second} onChangeText={setSecond} placeholder={secondPlaceholder} placeholderTextColor={colors.textFaint} keyboardType="numeric" /> : null}
        <Pressable style={styles.addBtn} onPress={add} disabled={busy || !name.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
      </View>
    </View>
  )
}

// Client statuses — chips + add (name + a meta pill so it's grouped correctly).
const STATUS_METAS = ['active', 'wandering', 'past']
function StatusManager({ tax }) {
  const [name, setName] = useState('')
  const [meta, setMeta] = useState('active')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = name.trim(); if (!v || busy) return
    setBusy(true); try { await tax.addClientStatus(v, meta); setName('') } finally { setBusy(false) }
  }
  return (
    <View style={styles.taxBlock}>
      <Text style={styles.taxTitle}>{i18n.t('settings:clients.statusesTitle', { defaultValue: 'סטטוסי לקוחות' })}</Text>
      <View style={styles.chips}>
        {tax.clientStatuses.length ? tax.clientStatuses.map((s) => (
          <View key={s.id} style={styles.chip}>
            {s.icon ? <Text style={styles.chipIcon}>{s.icon}</Text> : null}
            <Text style={styles.chipText}>{s.display_name}</Text>
            {s.is_default ? null : <Pressable onPress={() => tax.removeClientStatus(s.id)} hitSlop={6}><X size={12} strokeWidth={2} color={colors.textFaint} /></Pressable>}
          </View>
        )) : <Text style={styles.hint}>{i18n.t('settings:common.none', { defaultValue: '—' })}</Text>}
      </View>
      <View style={styles.metaPills}>
        {STATUS_METAS.map((m) => {
          const on = meta === m
          return (
            <Pressable key={m} style={[styles.metaPill, on && styles.metaPillOn]} onPress={() => setMeta(m)}>
              <Text style={[styles.metaPillText, on && styles.pillTextOnInv]}>{i18n.t(`clients:status.${m === 'no_status' ? 'noStatus' : m}`, { defaultValue: m })}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.addRow}>
        <TextInput style={[styles.input, styles.addInput]} value={name} onChangeText={setName} placeholder={i18n.t('settings:clients.statusPlaceholder', { defaultValue: 'סטטוס חדש…' })} placeholderTextColor={colors.textFaint} onSubmitEditing={add} />
        <Pressable style={styles.addBtn} onPress={add} disabled={busy || !name.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
      </View>
    </View>
  )
}

// Lead sub-statuses — chips + add (name + a meta pill), mirrors web's leads section.
const LEAD_METAS = ['in_process', 'converted', 'not_relevant']
function LeadStatusManager({ tax }) {
  const [name, setName] = useState('')
  const [meta, setMeta] = useState('in_process')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = name.trim(); if (!v || busy) return
    setBusy(true); try { await tax.addLeadStatus(v, meta); setName('') } finally { setBusy(false) }
  }
  return (
    <View style={styles.taxBlock}>
      <Text style={styles.taxTitle}>{i18n.t('settings:leads.subStatuses', { defaultValue: 'תתי-סטטוסים' })}</Text>
      <View style={styles.chips}>
        {tax.leadStatuses.length ? tax.leadStatuses.map((s) => (
          <View key={s.id} style={styles.chip}>
            <Text style={styles.chipText}>{s.display_name}</Text>
            {s.is_default ? null : <Pressable onPress={() => tax.removeLeadStatus(s.id)} hitSlop={6}><X size={12} strokeWidth={2} color={colors.textFaint} /></Pressable>}
          </View>
        )) : <Text style={styles.hint}>{i18n.t('settings:common.none', { defaultValue: '—' })}</Text>}
      </View>
      <View style={styles.metaPills}>
        {LEAD_METAS.map((m) => {
          const on = meta === m
          return (
            <Pressable key={m} style={[styles.metaPill, on && styles.metaPillOn]} onPress={() => setMeta(m)}>
              <Text style={[styles.metaPillText, on && styles.pillTextOnInv]}>{i18n.t(`settings:leadMetas.${m}`, { defaultValue: m })}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.addRow}>
        <TextInput style={[styles.input, styles.addInput]} value={name} onChangeText={setName} placeholder={i18n.t('settings:clients.statusPlaceholder', { defaultValue: 'סטטוס חדש…' })} placeholderTextColor={colors.textFaint} onSubmitEditing={add} />
        <Pressable style={styles.addBtn} onPress={add} disabled={busy || !name.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
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
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipIcon: { fontSize: 12 },
  chipText: { fontSize: 13, color: colors.text },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1 },
  addSecond: { width: 70 },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
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

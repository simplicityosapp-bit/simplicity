import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Share, Alert } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { User, Palette, Database, SlidersHorizontal, LogOut, ChevronDown, Sparkles, Download, X, Plus } from 'lucide-react-native'
import { LANGUAGE_OPTIONS } from '@simplicity/core/i18n'
import { fmtShortDate, payMethodLabel } from '@simplicity/core'
import i18n, { setGenderContext } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Select from '../components/Select'
import { colors } from '../theme/theme'
import { usePreferences } from '../hooks/usePreferences'
import { applySavedLanguage } from '../lib/preferences'
import { useFinanceData } from '../hooks/useFinanceData'
import { useConfigTaxonomy } from '../hooks/useConfigTaxonomy'

const GENDERS = ['male', 'female', 'neutral']
const ROLES = ['therapist', 'coach', 'consultant', 'trainer', 'other']
const TEXT_SIZES = ['small', 'normal', 'large']
const BACKGROUNDS = ['nature', 'simple', 'empty']
const T = (k, o) => i18n.t(`settings:${k}`, o)

function Section({ Icon, title, sub, open, onToggle, children }) {
  return (
    <Card padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
      <Pressable style={styles.secHead} onPress={onToggle}>
        <Icon size={18} strokeWidth={1.7} color={colors.textSub} />
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

function Pills({ options, value, onPick }) {
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const on = value === o.k
        return (
          <Pressable key={o.k} style={[styles.pill, on && styles.pillOn]} onPress={() => onPick(o.k)}>
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Settings — profile · appearance · data · configuration · sign out. Persists to
// user prefs (usePreferences); the language switch applies immediately via
// i18next (an RTL he↔ltr flip needs an app restart). Some appearance controls
// persist the choice; applying background/text-size app-wide is a later pass.
export default function SettingsScreen() {
  const nav = useNavigation()
  const { prefs, update } = usePreferences()
  const { transactions, clients, categories } = useFinanceData()
  const tax = useConfigTaxonomy()
  const [open, setOpen] = useState('profile')
  const [lang, setLang] = useState(i18n.language)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))

  const role = prefs.role || 'therapist'
  const setLanguage = (code) => { setLang(code); applySavedLanguage(code); update({ language: code }) }
  // Form of address → i18next context (matches web's prefs.design.gender). Apply
  // immediately so this screen re-renders gendered; other screens pick it up on
  // their next render (gender is set-once, like web).
  const setGender = (g) => { setGenderContext(g); update({ design: { ...(prefs.design || {}), gender: g } }) }

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

  return (
    <Screen name="tasks">
      <ScreenHead title={i18n.t('settings:header.title', { defaultValue: 'הגדרות' })} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <Section Icon={User} title={T('sections.profile.title', { defaultValue: 'פרופיל' })} sub={T('sections.profile.sub', { defaultValue: '' })} open={open === 'profile'} onToggle={() => toggle('profile')}>
          <Field label={T('profile.fullName', { defaultValue: 'שם מלא' })}>
            <TextInput style={styles.input} value={prefs.full_name || ''} onChangeText={(v) => update({ full_name: v })} placeholder={T('profile.namePlaceholder', { defaultValue: 'השם שלך' })} placeholderTextColor={colors.textFaint} />
          </Field>
          <Select label={T('profile.role', { defaultValue: 'תפקיד' })} value={role} onChange={(v) => update({ role: v })}
            options={ROLES.map((r) => ({ value: r, label: T(`profile.roles.${r}`, { defaultValue: r }) }))} />
          {role === 'other' ? (
            <Field label={T('profile.roleOther', { defaultValue: 'תפקיד אחר' })}>
              <TextInput style={styles.input} value={prefs.role_other || ''} onChangeText={(v) => update({ role_other: v })} placeholder={T('profile.roleOtherPlaceholder', { defaultValue: '' })} placeholderTextColor={colors.textFaint} />
            </Field>
          ) : null}
          <Field label={T('profile.genders.label', { defaultValue: 'פנייה' })}>
            <Pills options={GENDERS.map((g) => ({ k: g, label: T(`profile.genders.${g}`, { defaultValue: g }) }))} value={prefs.design?.gender || 'neutral'} onPick={setGender} />
          </Field>
        </Section>

        {/* Appearance */}
        <Section Icon={Palette} title={T('sections.design.title', { defaultValue: 'מראה ושפה' })} sub={T('sections.design.sub', { defaultValue: '' })} open={open === 'design'} onToggle={() => toggle('design')}>
          <Field label={T('design.language', { defaultValue: 'שפה' })}>
            <Pills options={LANGUAGE_OPTIONS.map((l) => ({ k: l.v, label: l.l }))} value={lang} onPick={setLanguage} />
            {lang === 'he' ? null : <Text style={styles.hint}>{T('design.rtlHint', { defaultValue: 'שינוי כיווניות מלא מתעדכן לאחר הפעלה מחדש.' })}</Text>}
          </Field>
          <Field label={T('design.textSize', { defaultValue: 'גודל טקסט' })}>
            <Pills options={TEXT_SIZES.map((s) => ({ k: s, label: T(`design.textSizes.${s}`, { defaultValue: s }) }))} value={prefs.text_size || 'normal'} onPick={(s) => update({ text_size: s })} />
          </Field>
          <Field label={T('design.background', { defaultValue: 'רקע' })}>
            <Pills options={BACKGROUNDS.map((b) => ({ k: b, label: T(`design.backgrounds.${b}`, { defaultValue: b }) }))} value={prefs.design?.background || 'nature'} onPick={(b) => update({ design: { ...(prefs.design || {}), background: b } })} />
          </Field>
        </Section>

        {/* Data */}
        <Section Icon={Database} title={T('sections.data.title', { defaultValue: 'נתונים' })} sub={T('sections.data.sub', { defaultValue: '' })} open={open === 'data'} onToggle={() => toggle('data')}>
          <Text style={styles.intro}>{T('data.intro', { defaultValue: 'ייצוא הנתונים שלך.' })}</Text>
          <Pressable style={styles.rowBtn} onPress={() => exportCsv('clients')}>
            <Download size={16} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.rowBtnText}>{T('data.exportClients', { defaultValue: 'ייצוא לקוחות (CSV)' })}</Text>
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={() => exportCsv('transactions')}>
            <Download size={16} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.rowBtnText}>{T('data.exportTransactions', { defaultValue: 'ייצוא תנועות (CSV)' })}</Text>
          </Pressable>
        </Section>

        {/* Configuration */}
        <Section Icon={SlidersHorizontal} title={T('sections.clients.title', { defaultValue: 'קונפיגורציה' })} sub={T('sections.clients.sub', { defaultValue: '' })} open={open === 'config'} onToggle={() => toggle('config')}>
          <Pressable style={styles.rowBtn} onPress={() => nav.navigate('Questions')}>
            <Sparkles size={16} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.rowBtnText}>{i18n.t('settings:sections.questions.title', { defaultValue: 'שאלות יומיות' })}</Text>
            <View style={{ flex: 1 }} />
            <ChevronDown size={16} strokeWidth={1.6} color={colors.textFaint} style={{ transform: [{ rotate: '-90deg' }] }} />
          </Pressable>

          <StatusManager tax={tax} />
          <TaxonomyManager
            title={T('leads.sourcesTitle', { defaultValue: 'מקורות לידים' })}
            items={tax.leadSources.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
            placeholder={T('leads.sourcePlaceholder', { defaultValue: 'מקור חדש…' })}
            onAdd={(name) => tax.addLeadSource(name)}
            onRemove={tax.removeLeadSource}
          />
          <TaxonomyManager
            title={T('payments.meetingTypesTitle', { defaultValue: 'סוגי פגישה' })}
            items={tax.meetingTypes.map((m) => ({ id: m.id, label: `${m.name}${m.default_price != null ? ` · ₪${m.default_price}` : ''}` }))}
            placeholder={T('payments.typePlaceholder', { defaultValue: 'סוג פגישה…' })}
            secondPlaceholder="₪"
            onAdd={(name, price) => tax.addMeetingType(name, price ? Number(price) : null)}
            onRemove={tax.removeMeetingType}
          />
        </Section>

        {/* Sign out */}
        <Pressable style={styles.signOut} onPress={signOut}>
          <LogOut size={17} strokeWidth={1.7} color={colors.danger} />
          <Text style={styles.signOutText}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
        </Pressable>
      </ScrollView>
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
              <Text style={[styles.metaPillText, on && styles.pillTextOn]}>{i18n.t(`clients:status.${m === 'no_status' ? 'noStatus' : m}`, { defaultValue: m })}</Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  sectionOuter: {},
  section: {},
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  secTitleWrap: { flex: 1 },
  secTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  secSub: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  secBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 14 },

  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  hint: { fontSize: 11, color: colors.textFaint, lineHeight: 16 },
  intro: { fontSize: 13, color: colors.textSub, lineHeight: 18 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },

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
  metaPills: { flexDirection: 'row', gap: 6 },
  metaPill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  metaPillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  metaPillText: { fontSize: 12, color: colors.textSub },

  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 4 },
  signOutText: { fontSize: 15, fontWeight: '600', color: colors.danger },
})

Section.displayName = 'Section'
Pills.displayName = 'Pills'
Field.displayName = 'Field'

import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a group under a project (mirrors web AddGroupModal): name + color +
// billing (package price/sessions or per-session). Pass a `group` to edit it.
const SWATCHES = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const G = (k, o) => i18n.t(`modalsClient:addGroup.${k}`, o)
const blank = (group) => ({
  name: group?.name || '',
  color: group?.color || SWATCHES[0],
  billing_mode: group?.billing_mode || (group?.price_per_session != null ? 'per_session' : 'package'),
  package_price: group?.package_price != null ? String(group.package_price) : '',
  package_sessions: group?.package_sessions != null ? String(group.package_sessions) : '',
  price_per_session: group?.price_per_session != null ? String(group.price_per_session) : '',
})

export default function AddGroupModal({ open, onClose, onSave, onDelete, group = null, project }) {
  const isEdit = !!group
  const [form, setForm] = useState(() => blank(group))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(group)); setErr(''); setBusy(false) } }, [open, group])
  const close = () => { setErr(''); setBusy(false); onClose() }
  const isPer = form.billing_mode === 'per_session'

  const doRemove = async () => {
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(C('saveFailed', { error: e.message || C('tryAgain') })) }
  }
  const remove = () => {
    if (busy || !onDelete) return
    Alert.alert(
      i18n.t('modalsClient:deleteGroup.title', { defaultValue: 'מחיקת קבוצה' }),
      i18n.t('modalsClient:deleteGroup.titleNamed', { name: group?.name || '', defaultValue: 'למחוק את הקבוצה?' }),
      [
        { text: C('cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: i18n.t('modalsClient:deleteGroup.confirm', { defaultValue: 'מחק קבוצה' }), style: 'destructive', onPress: doRemove },
      ],
    )
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(C('nameRequired')); return }
    const price = parseFloat(form.package_price)
    const sess = parseInt(form.package_sessions, 10)
    const perSession = parseFloat(form.price_per_session)
    if (form.billing_mode === 'package') {
      if (!(price > 0)) { setErr(G('errPackagePrice', { defaultValue: 'יש למלא מחיר חבילה חיובי.' })); return }
      if (!(sess > 0)) { setErr(G('errSessions', { defaultValue: 'יש למלא מספר פגישות חיובי.' })); return }
    } else if (isPer && !(perSession > 0)) { setErr(G('errPerSession', { defaultValue: 'יש למלא מחיר לפגישה חיובי.' })); return }
    setBusy(true)
    setErr('')
    try {
      const payload = {
        name: form.name.trim(), color: form.color, billing_mode: form.billing_mode,
        package_price: form.billing_mode === 'package' ? price : null,
        package_sessions: form.billing_mode === 'package' ? sess : null,
        price_per_session: isPer ? perSession : null,
      }
      await onSave(isEdit ? payload : { ...payload, project_id: project?.id || null, status: 'active', recurring_day: null, recurring_time: null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={isEdit ? i18n.t('projects:detail.groups.editAria', { defaultValue: 'עריכת קבוצה' }) : G('title', { defaultValue: 'קבוצה חדשה' })}>
      <View style={styles.field}>
        <Text style={styles.label}>{G('groupName', { defaultValue: 'שם הקבוצה' })}</Text>
        <TextInput style={[styles.input, err && !form.name.trim() && styles.inputErr]} value={form.name} onChangeText={(v) => { set('name', v); if (err) setErr('') }} placeholder={G('groupNamePlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{C('color')}</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((c) => <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchOn]} onPress={() => set('color', c)} />)}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{G('pricing', { defaultValue: 'תמחור' })}</Text>
        <View style={styles.pills}>
          {[{ k: 'package', l: 'editClient.billingPackage' }, { k: 'per_session', l: 'editClient.billingPerSession' }, { k: 'none', l: 'common.none' }].map((m) => {
            const on = form.billing_mode === m.k
            return (
              <Pressable key={m.k} style={[styles.pill, on && styles.pillOn]} onPress={() => { set('billing_mode', m.k); if (err) setErr('') }}>
                <Text style={[styles.pillText, on && styles.pillTextOn]} numberOfLines={1}>{i18n.t(`modalsClient:${m.l}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {isPer ? (
        <View style={styles.field}>
          <Text style={styles.label}>{G('pricePerSession', { defaultValue: 'מחיר לפגישה ₪' })}</Text>
          <TextInput style={styles.input} value={form.price_per_session} onChangeText={(v) => set('price_per_session', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
        </View>
      ) : form.billing_mode === 'none' ? (
        <Text style={styles.hint}>{G('noneHint', { defaultValue: 'בלי מחיר קבוע מראש. אפשר לתמחר כל חבר בנפרד דרך כרטיס הלקוח.' })}</Text>
      ) : (
        <View style={styles.row2}>
          <View style={styles.flex}>
            <Text style={styles.label}>{G('packagePrice', { defaultValue: 'מחיר חבילה ₪' })}</Text>
            <TextInput style={styles.input} value={form.package_price} onChangeText={(v) => set('package_price', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.label}>{G('sessionCount', { defaultValue: 'מספר פגישות' })}</Text>
            <TextInput style={styles.input} value={form.package_sessions} onChangeText={(v) => set('package_sessions', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
        </View>
      )}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable> : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}><Text style={styles.saveText}>{busy ? C('saving') : C('save')}</Text></Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})

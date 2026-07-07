import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a client. Now mirrors web AddClientModal's full field set (name +
// status/sub-status + phone/email + project/group + meeting type + billing +
// fixed weekly meeting + more details) so a client can be set up at creation
// time — previously only name/status/phone/price were reachable here.
const STATUSES = ['active', 'wandering', 'past']
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const T = (k, o) => i18n.t(`modalsClient:editClient.${k}`, o)
const blank = (client) => ({
  name: client?.name || '',
  status: client?.status_meta || client?.status || 'active',
  status_id: client?.status_id || '',
  phone: client?.phone || '',
  email: client?.email || '',
  price: client?.price_per_session != null ? String(client.price_per_session) : '',
  price_overridden: client?.price_overridden ?? false,
  meeting_type_id: client?.meeting_type_id || '',
  billing_mode: client?.billing_mode || 'package',
  sessions: client?.sessions != null ? String(client.sessions) : '',
  project_id: client?.project_id || '',
  group_id: client?.group_id || '',
  recurring_day: client?.recurring_day != null ? String(client.recurring_day) : '',
  recurring_time: client?.recurring_time || '',
  address: client?.address || '',
  birth_date: client?.birth_date || '',
})

export default function AddClientModal({ open, onClose, onSave, onDelete, client = null }) {
  const isEdit = !!client
  const { projects = [], groups = [], clientStatuses = [], meetingTypes = [] } = useFormOptions()
  const [form, setForm] = useState(() => blank(client))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(client)); setErr(''); setBusy(false) } }, [open, client])
  const close = () => { setErr(''); setBusy(false); onClose() }

  // Picking a meeting type fills its default price (unless the price was overridden).
  const pickMeetingType = (id) => {
    const type = meetingTypes.find((mt) => mt.id === id)
    setForm((f) => ({ ...f, meeting_type_id: id, price_overridden: false, price: type && type.default_price != null ? String(type.default_price) : f.price }))
  }
  const setPrice = (v) => setForm((f) => ({ ...f, price: v, price_overridden: true }))
  const subStatuses = clientStatuses.filter((s) => s.meta_category === form.status)
  const projectGroups = groups.filter((g) => g.project_id === form.project_id)
  const isPerSession = form.billing_mode === 'per_session'

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(C('saveFailed', { error: e.message || C('tryAgain') })) }
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(C('nameRequired')); return }
    setBusy(true)
    setErr('')
    const price = Number(form.price) || 0
    const common = {
      name: form.name.trim(),
      status: form.status, status_meta: form.status, status_id: form.status_id || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      project_id: form.project_id || null, group_id: form.group_id || null,
      sessions: Number(form.sessions) || 0,
      price_per_session: price,
      billing_mode: form.billing_mode,
      meeting_type_id: form.meeting_type_id || null,
      price_overridden: !!form.price_overridden,
      recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
      recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
      address: form.address.trim() || null,
      birth_date: form.birth_date || null,
    }
    try {
      const payload = isEdit ? common : {
        ...common,
        total_override: null, has_custom_price: false, left_mid_process: false,
        notes: null, notes_updated_at: null,
      }
      await onSave(payload)
      close()
    } catch (e) {
      setBusy(false)
      setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  const none = C('none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'modalsClient:editClient.title' : 'modalsClient:addClient.titleLabel')}>
      <View style={styles.field}>
        <Text style={styles.label}>{C('name')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => { set('name', v); if (err) setErr('') }}
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('clients:statusLabel', { defaultValue: 'סטטוס' })}</Text>
        <View style={styles.pills}>
          {STATUSES.map((s) => {
            const on = form.status === s
            return (
              <Pressable key={s} style={[styles.pill, on && styles.pillOn]} onPress={() => setForm((f) => ({ ...f, status: s, status_id: '' }))}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`clients:status.${s}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      {subStatuses.length ? (
        <Select label={C('subStatusOptional')} value={form.status_id} onChange={(v) => set('status_id', v)} placeholder={none}
          options={[{ value: '', label: none }, ...subStatuses.map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name || ''}` }))]} />
      ) : null}

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{C('phone')}</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={C('phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{C('email')}</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} placeholder={C('emailPlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="email-address" autoCapitalize="none" />
        </View>
      </View>

      {projects.length ? (
        <Select label={C('project')} value={form.project_id} onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))} placeholder={none}
          options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
      ) : null}
      {projectGroups.length ? (
        <Select label={C('groupOptional')} value={form.group_id} onChange={(v) => set('group_id', v)} placeholder={none}
          options={[{ value: '', label: none }, ...projectGroups.map((g) => ({ value: g.id, label: g.name || '' }))]} />
      ) : null}

      {meetingTypes.length ? (
        <Select label={T('meetingType')} value={form.meeting_type_id} onChange={pickMeetingType} placeholder={none}
          options={[{ value: '', label: none }, ...meetingTypes.map((mt) => ({ value: mt.id, label: `${mt.name}${mt.default_price != null ? ` · ₪${mt.default_price}` : ''}` }))]} />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{T('billingMode')}</Text>
        <View style={styles.pills}>
          {[{ k: 'package', l: 'billingPackage' }, { k: 'per_session', l: 'billingPerSession' }].map((b) => {
            const on = form.billing_mode === b.k
            return (
              <Pressable key={b.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('billing_mode', b.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{T(b.l)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      <View style={styles.row2}>
        {!isPerSession ? (
          <View style={styles.flex}>
            <Text style={styles.label}>{T('scheduled')}</Text>
            <TextInput style={styles.input} value={form.sessions} onChangeText={(v) => set('sessions', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Text style={styles.label}>{T('pricePerSession')}</Text>
          <TextInput style={styles.input} value={form.price} onChangeText={setPrice} placeholder="0" placeholderTextColor={colors.textFaint} keyboardType="numeric" />
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{T('fixedDay')}</Text>
          <Select value={form.recurring_day} onChange={(v) => set('recurring_day', v)} placeholder={none}
            options={[{ value: '', label: none }, ...DAYS.map((d) => ({ value: String(d), label: C(`day${d}`) }))]} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{T('fixedTime')}</Text>
          <TextInput style={styles.input} value={form.recurring_time} onChangeText={(v) => set('recurring_time', v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{C('address')}</Text>
          <TextInput style={styles.input} value={form.address} onChangeText={(v) => set('address', v)} placeholder={C('addressPlaceholder')} placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{C('birthDate')}</Text>
          <TextInput style={styles.input} value={form.birth_date} onChangeText={(v) => set('birth_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? C('saving') : C('save')}</Text>
        </Pressable>
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
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})

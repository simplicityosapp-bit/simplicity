import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { MapPin, ChevronDown } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Create a client — the field set + ORDER mirror the web AddClientModal's shared
// ClientFormFields exactly: name · status · sub-status · billing mode (+ per-
// session note) · sessions/price · meeting type · phone/project · email · a
// "more details" accordion (address + birth date, collapsed) · group · fixed
// weekly meeting + a clear link. Create-only (edits go through EditClientModal).
const STATUSES = ['active', 'wandering', 'past', 'no_status']
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const F = (k, o) => i18n.t(`clients:form.${k}`, o)
const S = (k) => i18n.t(`clients:status.${k}`)
const blank = () => ({
  name: '', status: 'active', status_id: '',
  billing_mode: 'package', sessions: '', price: '', price_overridden: false,
  meeting_type_id: '', phone: '', email: '', project_id: '', group_id: '',
  address: '', birth_date: '', recurring_day: '', recurring_time: '',
})

export default function AddClientModal({ open, onClose, onSave }) {
  const { projects = [], groups = [], clientStatuses = [], meetingTypes = [] } = useFormOptions()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (err) setErr('') }
  useEffect(() => { if (open) { setForm(blank()); setMoreOpen(false); setErr(''); setBusy(false) } }, [open])
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

  const submit = async () => {
    if (!form.name.trim()) { setErr(C('nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        status: form.status, status_meta: form.status, status_id: form.status_id || null,
        project_id: form.project_id || null, group_id: form.group_id || null,
        // Per-session billing has no prepaid package → sessions 0 (matches web).
        sessions: isPerSession ? 0 : (Number(form.sessions) || 0),
        price_per_session: Number(form.price) || 0,
        billing_mode: form.billing_mode || 'package',
        meeting_type_id: form.meeting_type_id || null,
        price_overridden: !!form.price_overridden,
        total_override: null, has_custom_price: false, left_mid_process: false,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        birth_date: form.birth_date || null,
        notes: null, notes_updated_at: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  const none = F('none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsClient:addClient.titleLabel')}>
      {/* Name */}
      <View style={styles.field}>
        <Text style={styles.label}>{F('name')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => set('name', v)}
          placeholder={F('namePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>

      {/* Status */}
      <View style={styles.field}>
        <Text style={styles.label}>{F('status')}</Text>
        <View style={styles.pills}>
          {STATUSES.map((s) => {
            const on = form.status === s
            return (
              <Pressable key={s} style={[styles.pill, on && styles.pillOn]} onPress={() => setForm((f) => ({ ...f, status: s, status_id: '' }))}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{s === 'no_status' ? none : S(s)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      {subStatuses.length ? (
        <Select label={F('subStatus')} value={form.status_id} onChange={(v) => set('status_id', v)} placeholder={none}
          options={[{ value: '', label: none }, ...subStatuses.map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name || ''}` }))]} />
      ) : null}

      {/* Billing mode + per-session note */}
      <View style={styles.field}>
        <Text style={styles.label}>{F('billingMode')}</Text>
        <View style={styles.pills}>
          {[{ k: 'package', l: 'package' }, { k: 'per_session', l: 'perSession' }].map((b) => {
            const on = form.billing_mode === b.k
            return (
              <Pressable key={b.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('billing_mode', b.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{F(b.l)}</Text>
              </Pressable>
            )
          })}
        </View>
        {isPerSession ? <Text style={styles.note}>{F('perSessionNote')}</Text> : null}
      </View>
      {/* Sessions (package only) + price */}
      <View style={styles.row2}>
        {!isPerSession ? (
          <View style={styles.flex}>
            <Text style={styles.label}>{F('sessionsCount')}</Text>
            <TextInput style={styles.input} value={form.sessions} onChangeText={(v) => set('sessions', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Text style={styles.label}>{F('pricePerSession')}</Text>
          <TextInput style={styles.input} value={form.price} onChangeText={setPrice} placeholder="0" placeholderTextColor={colors.textFaint} keyboardType="numeric" />
        </View>
      </View>

      {/* Meeting type */}
      {meetingTypes.length ? (
        <Select label={F('meetingType')} value={form.meeting_type_id} onChange={pickMeetingType} placeholder={none}
          options={[{ value: '', label: none }, ...meetingTypes.map((mt) => ({ value: mt.id, label: `${mt.name}${mt.default_price != null ? ` · ₪${mt.default_price}` : ''}` }))]} />
      ) : null}

      {/* Phone + project */}
      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{F('phone')}</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder="050-0000000" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
        </View>
        <View style={styles.flex}>
          {projects.length ? (
            <Select label={F('project')} value={form.project_id} onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))} placeholder={none}
              options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
          ) : <View />}
        </View>
      </View>

      {/* Email */}
      <View style={styles.field}>
        <Text style={styles.label}>{F('email')}</Text>
        <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} placeholder="name@example.com" placeholderTextColor={colors.textFaint} keyboardType="email-address" autoCapitalize="none" />
      </View>

      {/* More details — address + birth date, collapsed by default (mirrors web) */}
      <View style={styles.acc}>
        <Pressable style={styles.accHead} onPress={() => setMoreOpen((o) => !o)}>
          <MapPin size={17} strokeWidth={1.7} color={colors.textSub} />
          <Text style={styles.accTitle}>{F('moreDetails')}</Text>
          <ChevronDown size={16} strokeWidth={1.8} color={colors.textSub} style={{ transform: [{ rotate: moreOpen ? '180deg' : '0deg' }] }} />
        </Pressable>
        {moreOpen ? (
          <View style={styles.accBody}>
            <View style={styles.field}>
              <Text style={styles.label}>{F('address')}</Text>
              <TextInput style={styles.input} value={form.address} onChangeText={(v) => set('address', v)} placeholder={F('addressPlaceholder')} placeholderTextColor={colors.textFaint} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{F('birthDate')}</Text>
              <TextInput style={styles.input} value={form.birth_date} onChangeText={(v) => set('birth_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
            </View>
          </View>
        ) : null}
      </View>

      {/* Group (when the chosen project has groups) */}
      {projectGroups.length ? (
        <Select label={F('group')} value={form.group_id} onChange={(v) => set('group_id', v)} placeholder={F('noGroup')}
          options={[{ value: '', label: F('noGroup') }, ...projectGroups.map((g) => ({ value: g.id, label: g.name || '' }))]} />
      ) : null}

      {/* Fixed weekly meeting */}
      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{F('recurringDay')}</Text>
          <Select value={form.recurring_day} onChange={(v) => set('recurring_day', v)} placeholder={none}
            options={[{ value: '', label: none }, ...DAYS.map((d) => ({ value: String(d), label: F(`days.${d}`) }))]} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{F('recurringTime')}</Text>
          <TextInput style={styles.input} value={form.recurring_time} onChangeText={(v) => set('recurring_time', v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} />
        </View>
      </View>
      {(form.recurring_day !== '' || form.recurring_time !== '') ? (
        <Pressable onPress={() => setForm((f) => ({ ...f, recurring_day: '', recurring_time: '' }))}>
          <Text style={styles.clearLink}>{F('clearRecurring')}</Text>
        </Pressable>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
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
  note: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexGrow: 1, minWidth: 68, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  acc: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.cardFlat, overflow: 'hidden' },
  accHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  accTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  accBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  clearLink: { fontSize: 13, color: colors.brand, alignSelf: 'flex-start' },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})

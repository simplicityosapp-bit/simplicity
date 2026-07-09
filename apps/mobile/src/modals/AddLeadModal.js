import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a lead (mirrors web AddLeadModal's core: name + phone + source +
// follow-up date; new leads land in the "בתהליך" column). Pass a `lead` to edit.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const METAS = [
  { k: 'in_process', l: 'metaInProcess' },
  { k: 'converted', l: 'metaConverted' },
  { k: 'not_relevant', l: 'metaNotRelevant' },
]
const blank = (lead) => ({
  name: lead?.name || '',
  phone: lead?.phone || '',
  source_id: lead?.source_id || '',
  project_id: lead?.project_id || '',
  group_id: lead?.group_id || '',
  status_id: lead?.status_id || '',
  status_meta: lead?.status_meta || 'in_process',
  inquiry_date: lead?.inquiry_date ? String(lead.inquiry_date).slice(0, 10) : todayStr(),
  follow_up_date: lead?.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : '',
  notes: lead?.notes || '',
})

export default function AddLeadModal({ open, onClose, onSave, onDelete, onConvert, lead = null }) {
  const isEdit = !!lead
  const { leadSources, leadStatuses = [], projects = [], groups = [] } = useFormOptions()
  const [form, setForm] = useState(() => blank(lead))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  // Changing the kanban stage clears the sub-status (it belongs to a meta).
  const setMeta = (k) => setForm((f) => ({ ...f, status_meta: k, status_id: '' }))
  const projectGroups = groups.filter((g) => g.project_id === form.project_id)
  const subStatuses = leadStatuses.filter((s) => s.meta_category === form.status_meta)
  useEffect(() => { if (open) { setForm(blank(lead)); setErr(''); setBusy(false) } }, [open, lead])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(i18n.t('modalsClient:addLead.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      const now = new Date().toISOString()
      const common = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        source_id: form.source_id || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        status_id: form.status_id || null,
        status_meta: form.status_meta,
        inquiry_date: form.inquiry_date || null,
        follow_up_date: form.follow_up_date || null,
        notes: form.notes.trim() || null,
      }
      let payload
      if (isEdit) {
        const wasConverted = lead.status_meta === 'converted'
        const nowConverted = form.status_meta === 'converted'
        payload = {
          ...common,
          last_status_changed_at: form.status_meta !== lead.status_meta ? now : (lead.last_status_changed_at || null),
          converted_at: nowConverted && !wasConverted ? now : (nowConverted ? (lead.converted_at || null) : null),
        }
      } else {
        payload = { ...common, status: 'new', last_status_changed_at: now, converted_to_client_id: null, converted_at: null }
      }
      await onSave(payload)
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') }))
    }
  }

  const none = i18n.t('modalsClient:common.none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'modalsClient:editLead.title' : 'modalsClient:addLead.title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.name')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => { set('name', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsClient:addLead.namePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.phone')}</Text>
        <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={i18n.t('modalsClient:common.phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
      </View>

      <Select
        label={i18n.t('modalsClient:common.source')}
        value={form.source_id}
        onChange={(v) => set('source_id', v)}
        placeholder={none}
        options={[{ value: '', label: none }, ...leadSources.map((s) => ({ value: s.id, label: s.name || '' }))]}
      />
      {projects.length ? (
        <Select
          label={i18n.t('modalsClient:common.projectOptional')}
          value={form.project_id}
          onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))}
          placeholder={none}
          options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
        />
      ) : null}
      {projectGroups.length ? (
        <Select
          label={i18n.t('modalsClient:common.groupOptional')}
          value={form.group_id}
          onChange={(v) => set('group_id', v)}
          placeholder={none}
          options={[{ value: '', label: none }, ...projectGroups.map((g) => ({ value: g.id, label: g.name || '' }))]}
        />
      ) : null}

      {isEdit ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsClient:editLead.stage', { defaultValue: 'שלב' })}</Text>
          <View style={styles.pills}>
            {METAS.map((m) => {
              const on = form.status_meta === m.k
              return (
                <Pressable key={m.k} style={[styles.pill, on && styles.pillOn]} onPress={() => setMeta(m.k)}>
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsClient:editLead.${m.l}`)}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}
      {subStatuses.length ? (
        <Select
          label={i18n.t('modalsClient:common.subStatusOptional')}
          value={form.status_id}
          onChange={(v) => set('status_id', v)}
          placeholder={none}
          options={[{ value: '', label: none }, ...subStatuses.map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name || ''}` }))]}
        />
      ) : null}

      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsClient:common.inquiryDate')}</Text>
          <TextInput style={styles.input} value={form.inquiry_date} onChangeText={(v) => set('inquiry_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsClient:common.followUp')}</Text>
          <TextInput style={styles.input} value={form.follow_up_date} onChangeText={(v) => set('follow_up_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.notes')}</Text>
        <TextInput style={[styles.input, styles.textarea]} value={form.notes} onChangeText={(v) => set('notes', v)} placeholder={i18n.t('modalsClient:common.leadNotesPlaceholder')} placeholderTextColor={colors.textFaint} multiline />
      </View>

      {isEdit && onConvert && lead?.status_meta !== 'converted' ? (
        <Pressable style={styles.convert} onPress={() => onConvert(lead)}>
          <Text style={styles.convertText}>{i18n.t('modalsClient:convertLead.convert', { defaultValue: 'המר ללקוח' })}</Text>
        </Pressable>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsClient:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsClient:common.saving') : i18n.t('modalsClient:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  convert: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,168,136,0.5)', backgroundColor: 'rgba(139,168,136,0.12)', alignItems: 'center' },
  convertText: { fontSize: 14, fontWeight: '600', color: colors.positive },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})

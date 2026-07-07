import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Convert a lead → client (mirrors web ConvertLeadModal). The lead's name/phone
// seed the form; pick a project/group and an optional "converted" sub-status. On
// save: (1) create the client, (2) create the group membership if a group was
// picked (best-effort), (3) flip the lead to 'converted' + link it to the new
// client. The parent wires onCreateClient / onUpdateLead / onAddGroupMember.
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const T = (k, o) => i18n.t(`modalsClient:convertLead.${k}`, o)

export default function ConvertLeadModal({ open, onClose, lead, onCreateClient, onUpdateLead, onAddGroupMember }) {
  const { projects = [], groups = [], clientStatuses = [] } = useFormOptions()
  const [form, setForm] = useState(() => ({ name: lead?.name || '', phone: lead?.phone || '', project_id: lead?.project_id || '', group_id: lead?.group_id || '', status_id: '' }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm({ name: lead?.name || '', phone: lead?.phone || '', project_id: lead?.project_id || '', group_id: lead?.group_id || '', status_id: '' }); setErr(''); setBusy(false) } }, [open, lead])

  const projectGroups = form.project_id ? groups.filter((g) => g.project_id === form.project_id && !g.deleted_at) : []
  const convertedSubStatuses = clientStatuses.filter((s) => s.meta_category === 'converted')
  const defaultConverted = convertedSubStatuses.find((s) => s.is_default)

  const submit = async () => {
    if (!lead) return
    if (!form.name.trim()) { setErr(T('nameRequired')); return }
    setBusy(true)
    setErr('')
    const now = new Date().toISOString()
    try {
      const newClient = await onCreateClient({
        name: form.name.trim(),
        status: 'active', status_meta: 'active', status_id: null,
        project_id: form.project_id || null, group_id: form.group_id || null,
        sessions: 0, price_per_session: 0, total_override: null, has_custom_price: false,
        recurring_day: null, recurring_time: null, left_mid_process: false,
        phone: form.phone.trim() || null,
        notes: lead.notes || null, notes_updated_at: lead.notes ? now : null,
      })
      if (form.group_id && onAddGroupMember) {
        await onAddGroupMember({
          group_id: form.group_id, client_id: newClient.id, joined_at: now, left_at: null,
          total_override: null, has_custom_price: false, package_sessions_override: null, left_mid_process: false,
        }).catch(() => {}) // best-effort — never block the conversion
      }
      const subStatusId = form.status_id || defaultConverted?.id || null
      await onUpdateLead(lead.id, {
        status_meta: 'converted', status_id: subStatusId,
        converted_at: now, converted_to_client_id: newClient.id, last_status_changed_at: now,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(T('convertFailed', { error: e.message || C('tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={T('title')}>
      {lead ? (
        <>
          <View style={styles.subRow}>
            <View style={styles.subDot} />
            <Text style={styles.subName}>{lead.name}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{T('clientName')}</Text>
            <TextInput
              style={[styles.input, err && !form.name.trim() && styles.inputErr]}
              value={form.name}
              onChangeText={(v) => { set('name', v); if (err) setErr('') }}
              placeholderTextColor={colors.textFaint}
            />
          </View>

          <View style={styles.row2}>
            <View style={styles.flex}>
              <Text style={styles.label}>{C('phone')}</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={C('phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
            </View>
          </View>

          {projects.length ? (
            <Select label={C('projectOptional')} value={form.project_id} onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))} placeholder={C('none')}
              options={[{ value: '', label: C('none') }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
          ) : null}
          {projectGroups.length ? (
            <Select label={C('groupOptional')} value={form.group_id} onChange={(v) => set('group_id', v)} placeholder={C('none')}
              options={[{ value: '', label: C('none') }, ...projectGroups.map((g) => ({ value: g.id, label: g.name || '' }))]} />
          ) : null}
          {convertedSubStatuses.length ? (
            <Select label={T('convertedSubStatusOptional')} value={form.status_id} onChange={(v) => set('status_id', v)}
              placeholder={defaultConverted ? T('convertedDefault', { name: defaultConverted.display_name }) : C('none')}
              options={[{ value: '', label: defaultConverted ? T('convertedDefault', { name: defaultConverted.display_name }) : C('none') }, ...convertedSubStatuses.map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name || ''}` }))]} />
          ) : null}

          <Text style={styles.hint}>{T('footHint')}</Text>

          {err ? <Text style={styles.error}>{err}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={busy}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
            <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
              <Text style={styles.saveText}>{busy ? T('converting') : T('convert')}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.positive },
  subName: { fontSize: 14, fontWeight: '600', color: colors.text },
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})

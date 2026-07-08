import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a task (mirrors web AddTaskModal: title + priority + project/client
// selects + due date/time). Pass a `task` to edit it (prefills + shows delete).
const PRIORITIES = [
  { k: 'high', l: 'priorityHigh' },
  { k: 'medium', l: 'priorityMedium' },
  { k: 'low', l: 'priorityLow' },
]
const pad = (x) => String(x).padStart(2, '0')
const dueParts = (iso) => {
  if (!iso) return { due_date: '', due_time: '' }
  const d = new Date(iso)
  if (Number.isNaN(+d)) return { due_date: '', due_time: '' }
  return { due_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, due_time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
const blank = (task) => ({
  title: task?.title || '',
  priority: task?.priority || 'medium',
  project_id: task?.project_id || '',
  client_id: task?.client_id || '',
  status_id: task?.status_id || '',
  category_id: task?.category_id || '',
  ...dueParts(task?.due_at),
})

export default function AddTaskModal({ open, onClose, onSave, onDelete, task = null }) {
  const isEdit = !!task
  const { projects, clients, taskStatuses = [], taskCategories = [] } = useFormOptions()
  const [form, setForm] = useState(() => blank(task))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(task)); setErr(''); setBusy(false) } }, [open, task])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.title.trim()) { setErr(i18n.t('modalsTask:task.titleRequired')); return }
    // A date alone is enough — default the time to 09:00 so it lands on the day.
    // Guard an invalid typed date (raw TextInput) BEFORE setBusy so toISOString()
    // can't throw a RangeError caught as a generic "save failed" — mirrors
    // AddReminderModal (which validates before entering the busy state).
    let due_at = null
    if (form.due_date) {
      const when = new Date(`${form.due_date}T${form.due_time || '09:00'}`)
      if (Number.isNaN(when.getTime())) { setErr(i18n.t('modalsTask:reminder.invalidDateTime')); return }
      due_at = when.toISOString()
    }
    setBusy(true)
    setErr('')
    // A chosen custom status drives the binary status via its meta ('done' → done,
    // else todo) so counters stay correct; with none, keep the create default /
    // leave an edit's status untouched. Mirrors web AddTaskModal.
    const chosen = taskStatuses.find((s) => s.id === form.status_id)
    const metaStatus = chosen ? (chosen.meta_category === 'done' ? 'done' : 'todo') : null
    try {
      await onSave({
        title: form.title.trim(),
        priority: form.priority,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        status_id: form.status_id || null,
        category_id: form.category_id || null,
        due_at,
        ...(metaStatus ? { status: metaStatus } : (isEdit ? {} : { status: 'todo', completed_at: null })),
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  const noneClient = i18n.t('modalsTask:common.none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'modalsTask:task.titleEdit' : 'modalsTask:task.titleNew')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:task.whatToDo')}</Text>
        <TextInput
          style={[styles.input, err && !form.title.trim() && styles.inputErr]}
          value={form.title}
          onChangeText={(v) => { set('title', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsTask:task.titlePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:task.priority')}</Text>
        <View style={styles.pills}>
          {PRIORITIES.map((p) => {
            const on = form.priority === p.k
            return (
              <Pressable key={p.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('priority', p.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:task.${p.l}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{i18n.t('modalsTask:task.dueDate')}</Text>
          <TextInput style={styles.input} value={form.due_date} onChangeText={(v) => set('due_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{i18n.t('modalsTask:task.dueTime')}</Text>
          <TextInput style={[styles.input, !form.due_date && styles.inputOff]} value={form.due_time} onChangeText={(v) => set('due_time', v)} placeholder="09:00" placeholderTextColor={colors.textFaint} editable={!!form.due_date} />
        </View>
      </View>

      <Select
        label={i18n.t('modalsTask:task.project')}
        value={form.project_id}
        onChange={(v) => set('project_id', v)}
        placeholder={noneClient}
        options={[{ value: '', label: noneClient }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
      />
      <Select
        label={i18n.t('modalsTask:task.client')}
        value={form.client_id}
        onChange={(v) => set('client_id', v)}
        placeholder={noneClient}
        options={[{ value: '', label: noneClient }, ...clients.map((c) => ({ value: c.id, label: c.name || '' }))]}
      />
      {taskStatuses.length ? (
        <Select
          label={i18n.t('modalsTask:task.status')}
          value={form.status_id}
          onChange={(v) => set('status_id', v)}
          placeholder={noneClient}
          options={[{ value: '', label: noneClient }, ...taskStatuses.map((s) => ({ value: s.id, label: s.display_name || '' }))]}
        />
      ) : null}
      {taskCategories.length ? (
        <Select
          label={i18n.t('modalsTask:task.category')}
          value={form.category_id}
          onChange={(v) => set('category_id', v)}
          placeholder={noneClient}
          options={[{ value: '', label: noneClient }, ...taskCategories.map((c) => ({ value: c.id, label: c.name || '' }))]}
        />
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : i18n.t('modalsTask:common.save')}</Text>
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
  inputOff: { opacity: 0.5 },
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

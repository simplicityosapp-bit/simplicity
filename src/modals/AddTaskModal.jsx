import { useState } from 'react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

const PRIORITIES = [
  { k: 'high', l: 'priorityHigh' },
  { k: 'medium', l: 'priorityMedium' },
  { k: 'low', l: 'priorityLow' },
]
const pad = (x) => String(x).padStart(2, '0')
/* Split a stored due_at ISO into the form's date + time inputs (local time). */
const dueParts = (iso) => {
  if (!iso) return { due_date: '', due_time: '' }
  const d = new Date(iso)
  if (Number.isNaN(+d)) return { due_date: '', due_time: '' }
  return {
    due_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    due_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
const blank = () => ({ title: '', priority: 'medium', project_id: '', client_id: '', status_id: '', category_id: '', due_date: '', due_time: '' })
const fromTask = (t) => (t
  ? { title: t.title || '', priority: t.priority || 'medium', project_id: t.project_id || '', client_id: t.client_id || '', status_id: t.status_id || '', category_id: t.category_id || '', ...dueParts(t.due_at) }
  : blank())

/* onSave is async (Supabase insert/update). Pass `task` to edit an existing one. */
export default function AddTaskModal({ open, onClose, onSave, projects = [], clients = [], statuses = [], categories = [], task = null }) {
  const isEdit = !!task
  const { t } = useT('modalsTask')
  const [form, setForm] = useState(() => fromTask(task))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromTask(task)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr(t('task.titleRequired')); return }
    setBusy(true)
    setErr('')
    try {
      /* A chosen custom status drives the binary status via its meta
         ('done' meta → done, else todo) so existing counters stay correct;
         the API's reconcileCompletion then syncs completed_at. With no
         custom status we keep the create default / leave an edit's status. */
      const chosen = statuses.find((s) => s.id === form.status_id)
      const metaStatus = chosen ? (chosen.meta_category === 'done' ? 'done' : 'todo') : null
      /* A date alone is enough — default the time to 09:00 so it lands on the
         day. No date → clear the due_at (also lets an edit remove it). */
      const due_at = form.due_date
        ? new Date(`${form.due_date}T${form.due_time || '09:00'}`).toISOString()
        : null
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
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const titleMissing = !!err && !form.title.trim()

  return (
    <Modal open={open} onClose={close} title={isEdit ? t('task.titleEdit') : t('task.titleNew')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('task.whatToDo')}</Box>
        <Input
          className={`m-input${titleMissing ? ' err' : ''}`}
          value={form.title}
          onChange={(e) => { set('title', e.target.value); if (err) setErr('') }}
          placeholder={t('task.titlePlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('task.priority')}</Box>
        <Box className="m-pills">
          {PRIORITIES.map((p) => (
            <Btn key={p.k} type="button" className={`m-pill${form.priority === p.k ? ' on' : ''}`} onClick={() => set('priority', p.k)}>{t(`task.${p.l}`)}</Btn>
          ))}
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('task.project')}</Box>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('task.client')}</Box>
          <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Box>
      </Box>

      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('task.dueDate')}</Box>
          <DateField value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('task.dueTime')}</Box>
          <Input
            type="time"
            className="m-input"
            value={form.due_time}
            onChange={(e) => set('due_time', e.target.value)}
            disabled={!form.due_date}
          />
        </Box>
      </Box>

      {(statuses.length > 0 || categories.length > 0) && (
        <Box className="m-row2">
          {statuses.length > 0 && (
            <Box className="m-field">
              <Box as="label" className="m-label">{t('task.status')}</Box>
              <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
                <option value="">{t('common.none')}</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </Box>
          )}
          {categories.length > 0 && (
            <Box className="m-field">
              <Box as="label" className="m-label">{t('task.category')}</Box>
              <select className="m-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">{t('common.none')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Box>
          )}
        </Box>
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}

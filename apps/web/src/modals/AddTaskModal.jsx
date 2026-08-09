import { useState } from 'react'
import { Trash2, SlidersHorizontal } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { useDiscardGuard, isDirty, useScrollToError } from './useDiscardGuard'
import DateField from '../components/DateField'
import SelectMenu from '../components/SelectMenu'
import FormSection from '../components/FormSection'
import { useT } from '../i18n/useT'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'

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
/* priority stays null until the user actually picks one; the effective value
   is derived at render from prefs.tasks.default_priority (set in
   TaskTaxonomyModal). Deriving rather than seeding state means a late-arriving
   preference is picked up without an effect that writes back into the form. */
const blank = () => ({ title: '', description: '', priority: null, project_id: '', client_id: '', status_id: '', category_id: '', due_date: '', due_time: '' })
/* `initialDue` seeds the due date/time of a NEW task (the calendar's day grid
   passes the slot the user tapped). It is deliberately separate from `task`:
   passing a stub task to carry a date would flip the modal into edit mode. */
const fromTask = (t, initialDue = null) => (t
  ? { title: t.title || '', description: t.description || '', priority: t.priority || null, project_id: t.project_id || '', client_id: t.client_id || '', status_id: t.status_id || '', category_id: t.category_id || '', ...dueParts(t.due_at) }
  : { ...blank(), ...dueParts(initialDue) })

/* onSave is async (Supabase insert/update). Pass `task` to edit an existing one.
   `onDelete(id)` is optional — supplied only where the caller owns a delete
   (the tasks screen); without it the modal shows no delete action, exactly as
   before. Deleting is a soft-delete → Trash, so the confirm says so. */
export default function AddTaskModal({ open, onClose, onSave, onDelete, projects = [], clients = [], statuses = [], categories = [], task = null, initialDue = null }) {
  const isEdit = !!task
  const { t } = useT('modalsTask')
  const { prefs } = useUserPreferences()
  const [form, setForm] = useState(() => fromTask(task, initialDue))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /* Opens with the due field showing whenever there's a date to show — an
     edited task that carries one, or a new task seeded from a tapped slot. */
  const openWithDue = !!(task?.due_at || initialDue)
  const [showDue, setShowDue] = useState(openWithDue)
  /* The lid opens on mount only when something inside already carries a value
     — an edited task bound to a project, a description already written — so a
     value is never hidden behind a closed lid. Same rule the lead and
     transaction forms use. */
  const detailsPrefilled = !!(task && (task.project_id || task.client_id || task.status_id || task.category_id || task.description))
  const [detailsOpen, setDetailsOpen] = useState(detailsPrefilled)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromTask(task, initialDue)); setShowDue(openWithDue); setDetailsOpen(detailsPrefilled); setErr(''); setBusy(false); onClose() }
  /* Escape, the overlay and the X used to bin a written-out task without a
     word. Compared against the state the form OPENED with — which for an edit
     is the task itself and for a new one may already carry a tapped calendar
     slot, so neither counts as the user's own typing. */
  const guard = useDiscardGuard(isDirty(form, fromTask(task, initialDue)), close)
  /* A rejected save should put the field it rejected back on screen. */
  useScrollToError(err)
  /* Nothing picked yet → fall back to the configured default. */
  const priority = form.priority ?? (prefs?.tasks?.default_priority || 'medium')

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
        /* null rather than '' for an empty box, so "no details" reads the same
           in the database as it does on every task written before the column
           existed. */
        description: form.description.trim() || null,
        priority,
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

  /* Option lists for the styled pickers. This form used four native <select>s
     while the lead and transaction forms opened the app's own menu — the same
     split the lead modal's own comment complains about. Same shapes they build. */
  const noneOpt = { value: '', label: t('common.none') }
  const projectOptions = [noneOpt, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const clientOptions = [noneOpt, ...clients.map((c) => ({ value: c.id, label: c.name }))]
  const statusOptions = [noneOpt, ...statuses.map((s) => ({ value: s.id, label: s.display_name }))]
  const categoryOptions = [noneOpt, ...categories.map((c) => ({ value: c.id, label: c.name }))]

  return (
    <>
    <Modal open={open} onClose={guard.requestClose} onSubmit={submit} title={isEdit ? t('task.titleEdit') : t('task.titleNew')}>
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
            <Btn key={p.k} type="button" className={`m-pill${priority === p.k ? ' on' : ''}`} onClick={() => set('priority', p.k)}>{t(`task.${p.l}`)}</Btn>
          ))}
        </Box>
      </Box>
      {/* The due date is optional, so it stays behind a toggle instead of
          taking two permanent rows. Removing collapses AND clears it — a
          hidden-but-set date would silently keep a due_at the user can't see. */}
      {showDue ? (
        <>
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
          <Btn
            type="button"
            className="m-clear-link"
            onClick={() => { setShowDue(false); setForm((f) => ({ ...f, due_date: '', due_time: '' })) }}
          >
            {t('task.removeDue')}
          </Btn>
        </>
      ) : (
        <Btn type="button" className="m-clear-link" onClick={() => setShowDue(true)}>
          {t('task.addDue')}
        </Btn>
      )}

      {/* This form used to lay all six fields out flat while every other add
          form showed three or four and folded the rest. A task is "what needs
          doing", how urgent, and by when; where it belongs and what it is
          about go behind the same lid the lead and transaction forms use. */}
      <FormSection
        id="task-details"
        icon={<SlidersHorizontal size={16} strokeWidth={1.7} />}
        title={t('task.moreDetails')}
        open={detailsOpen}
        onToggle={() => setDetailsOpen((o) => !o)}
      >
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('task.project')}</Box>
            <SelectMenu value={form.project_id} onChange={(v) => set('project_id', v)} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('task.project')} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('task.client')}</Box>
            {/* Searchable: the roster grows without bound, and this is the one
                picker here that can run to hundreds of rows. */}
            <SelectMenu
              value={form.client_id}
              onChange={(v) => set('client_id', v)}
              options={clientOptions}
              placeholder={t('common.none')}
              ariaLabel={t('task.client')}
              searchable={clients.length > 8}
              searchPlaceholder={t('task.client')}
            />
          </Box>
        </Box>

        {(statuses.length > 0 || categories.length > 0) && (
          <Box className="m-row2">
            {statuses.length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('task.status')}</Box>
                <SelectMenu value={form.status_id} onChange={(v) => set('status_id', v)} options={statusOptions} placeholder={t('common.none')} ariaLabel={t('task.status')} />
              </Box>
            )}
            {categories.length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('task.category')}</Box>
                <SelectMenu value={form.category_id} onChange={(v) => set('category_id', v)} options={categoryOptions} placeholder={t('common.none')} ariaLabel={t('task.category')} />
              </Box>
            )}
          </Box>
        )}

        {/* Last field, where the reminder form puts its own — a task has had
            nowhere to say what "להתקשר לדנה" is actually about, while a reminder
            has carried a details box since it was built. */}
        <Box className="m-field">
          <Box as="label" className="m-label">{t('task.details')}</Box>
          <Textarea
            className="m-textarea"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('task.detailsPlaceholder')}
          />
        </Box>
      </FormSection>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        {onDelete && task?.id && (
          <Btn type="button" className="m-btn-delete-inline" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> {t('task.delete')}
          </Btn>
        )}
        <Btn type="button" className="m-btn-cancel" onClick={guard.requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>

    {/* Sibling of the sheet, for the same reason the delete confirm below is. */}
    {guard.confirm}

    {/* Sibling of the sheet above, NOT a child of it. Every .m-sheet shares
        z-index 510, so paint order is DOM order — and a Modal nested inside
        another Modal's children has its portal appended to document.body
        BEFORE its parent's, leaving the confirm invisible underneath. As a
        sibling it mounts last and lands on top (this also keeps Modal's
        "last .m-sheet.open wins" Escape handling honest).
        Names the task about to go, and closes the editor only once the delete
        is confirmed — cancelling leaves the form exactly as it was. */}
    <ConfirmModal
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      title={t('task.deleteTitle')}
      message={t('task.deleteMessage', { title: task?.title || '' })}
      confirmLabel={t('task.deleteConfirm')}
      danger
      onConfirm={async () => { await onDelete(task.id); onClose() }}
    />
    </>
  )
}

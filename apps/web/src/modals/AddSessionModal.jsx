import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import DateField from '../components/DateField'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { showToast } from '../lib/toast'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'

/* Local YYYY-MM-DD — UTC toISOString would roll over to "tomorrow" on an
   Israeli evening, defaulting a new session's date to the wrong day. */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ date: todayStr(), summary: '', notes: '' })
const fromSession = (s) => (s
  ? { date: s.date ? new Date(s.date).toISOString().slice(0, 10) : todayStr(), summary: s.summary || '', notes: s.notes || '' }
  : blank())

/* Log a past session. The caller composes the full row (client_id or group_id,
   subject_type, num). This modal collects when + summary + notes. Subject is
   either a client (drawer flow) or a group (group flow).

   `onDelete(id)` is optional and only shows in EDIT mode — a documented
   meeting used to be the one record in the app you could write but never take
   back, so a mistyped or duplicated session was stuck on the client's card
   (and in their session count) for good. Same shape as AddTaskModal's delete:
   a soft delete, recoverable from the trash for 30 days. */
export default function AddSessionModal({ open, onClose, onSave, onDelete, client, group, nextNum, session = null }) {
  const subject = group || client
  const subjectColor = group ? (group.color || 'var(--stone)') : 'var(--sage)'
  const isEdit = !!session
  const { t } = useT('modalsTask')
  const [form, setForm] = useState(() => fromSession(session))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromSession(session)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.date) { setErr(t('session.dateRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        date: new Date(`${form.date}T12:00:00`).toISOString(),
        summary: form.summary.trim() || null,
        notes: form.notes.trim() || null,
      })
      showToast(t('session.saved'))
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <>
    <Modal open={open} onClose={close} title={isEdit ? t('session.titleEdit') : t('session.titleNew')}>
      {subject && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: subjectColor }} />
          {subject.name}{nextNum ? ` · ${t('session.meetingNum', { num: nextNum })}` : ''}
        </Txt>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('session.date')}</Box>
        <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('session.summary')}</Box>
        <Textarea className="m-textarea" value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder={t('session.summaryPlaceholder')} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('session.notes')}</Box>
        <Input className="m-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('session.notesPlaceholder')} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        {onDelete && session?.id && (
          <Btn type="button" className="m-btn-delete-inline" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> {t('session.delete')}
          </Btn>
        )}
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>

    {/* Sibling of the sheet, NOT a child — every .m-sheet shares z-index 510,
        so paint order is DOM order and a nested Modal's portal lands UNDER its
        parent's. Same reason AddTaskModal keeps its confirm out here. */}
    <ConfirmModal
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      title={t('session.deleteTitle')}
      message={t('session.deleteMessage')}
      confirmLabel={t('session.deleteConfirm')}
      danger
      onConfirm={async () => { await onDelete(session.id); onClose() }}
    />
    </>
  )
}

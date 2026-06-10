import { useState } from 'react'
import { Check, X, CalendarDays, Clock, Pencil, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { formatWhen, fmtTime } from '../lib/dates'

/* datetime-local helpers — show/parse the browser's local wall-clock value
   (a Date with an argument is allowed by the purity lint; argless new Date()
   is not, but we never need "now" here). */
const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (d) =>
  d instanceof Date && !Number.isNaN(d.getTime())
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    : ''

/* Lightweight detail+action modal opened by tapping an event in any
   calendar view. Lives outside the view components so they can stay
   pure renderers. Actions wire to the parent's handlers — the parent
   decides whether confirming a meeting also touches linked transactions.
   Google-synced events can be CLAIMED here: editing or deleting one owns
   it (owned=true), so the change survives future syncs (migration 0023). */
export default function EventDetailsModal({ open, onClose, event, onConfirmMeeting, onSkipMeeting, onCompleteReminder, onRemoveReminder, onUpdateEvent, onDeleteEvent }) {
  /* Two-step delete confirm (resets per event — parent keys the modal on
     event.id). No undo path here, so the second tap is the safety net. */
  const [confirmDel, setConfirmDel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', start: '', end: '' })
  const [editErr, setEditErr] = useState('')
  if (!event) return <Modal open={open} onClose={onClose} title="פרטי אירוע" />

  const isMeeting = event.kind === 'meeting'
  const isCalendar = event.kind === 'calendar'
  const isOwned = !!event.raw?.owned
  const Icon = (isMeeting || isCalendar) ? CalendarDays : Clock
  const title = event.title || 'אירוע'

  const handle = (fn) => async () => {
    try { await fn(event) } finally { onClose() }
  }

  const startEdit = () => {
    setForm({ title: event.title || '', start: toLocalInput(event.when), end: toLocalInput(event.end) })
    setEditErr('')
    setEditing(true)
  }
  const saveEdit = async () => {
    if (!form.start) { setEditErr('יש לבחור שעת התחלה.'); return }
    const patch = {
      title: form.title.trim() || '(ללא כותרת)',
      start_time: new Date(form.start).toISOString(),
      end_time: form.end ? new Date(form.end).toISOString() : null,
    }
    try { await onUpdateEvent?.(event, patch) } finally { onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title="פרטי אירוע">
      <div className="evt-detail-head">
        <span className={`evt-detail-icon ${event.kind}`}>
          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <div className="evt-detail-text">
          <p className="evt-detail-title">{title}</p>
          <p className="evt-detail-when">
            {formatWhen(event.when)}
            {event.allDay ? ' · כל היום' : (event.end ? `–${fmtTime(event.end)}` : '')}
          </p>
        </div>
      </div>

      {isMeeting && event.status === 'pending' && (
        <div className="evt-detail-row">
          <p className="evt-detail-question">האם הפגישה התקיימה?</p>
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onConfirmMeeting)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> כן
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={handle(onSkipMeeting)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> לא
            </button>
          </div>
        </div>
      )}

      {isMeeting && event.status === 'confirmed' && (
        <p className="evt-detail-status sage">הפגישה אושרה.</p>
      )}

      {isCalendar && !editing && (
        <>
          <p className="evt-detail-status">
            {(() => {
              const links = [
                event.clientName && `לקוח: ${event.clientName}`,
                event.projectName && `פרויקט: ${event.projectName}`,
                event.leadName && `ליד: ${event.leadName}`,
                event.groupName && `קבוצה: ${event.groupName}`,
              ].filter(Boolean)
              return links.length ? `${links.join(' · ')} · ` : ''
            })()}
            {isOwned
              ? 'אירוע שלך (נערך מתוך סימפליסיטי).'
              : 'אירוע מ-Google Calendar — עריכה או מחיקה כאן יהפכו אותו לשלך, ולא יידרס בסנכרון.'}
          </p>
          <div className="evt-detail-row">
            <div className="evt-detail-actions">
              <button type="button" className="evt-detail-btn approve" onClick={startEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden="true" /> עריכה
              </button>
              <button
                type="button"
                className="evt-detail-btn skip"
                onClick={confirmDel ? handle(onDeleteEvent) : () => setConfirmDel(true)}
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? 'בטוח? מחק' : 'מחיקה'}
              </button>
            </div>
          </div>
        </>
      )}

      {isCalendar && editing && (
        <div className="evt-detail-row">
          <div className="m-field">
            <label className="m-label">כותרת</label>
            <input className="m-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="כותרת האירוע" />
          </div>
          <div className="m-row2">
            <div className="m-field">
              <label className="m-label">התחלה</label>
              <input type="datetime-local" className="m-input" value={form.start} onChange={(e) => { setForm((f) => ({ ...f, start: e.target.value })); if (editErr) setEditErr('') }} />
            </div>
            <div className="m-field">
              <label className="m-label">סיום</label>
              <input type="datetime-local" className="m-input" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </div>
          </div>
          {editErr && <p className="m-error">{editErr}</p>}
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={saveEdit}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> שמירה
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={() => setEditing(false)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> ביטול
            </button>
          </div>
        </div>
      )}

      {!isMeeting && !isCalendar && (
        <div className="evt-detail-row">
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onCompleteReminder)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> סמן כבוצע
            </button>
            <button
              type="button"
              className="evt-detail-btn skip"
              onClick={confirmDel ? handle(onRemoveReminder) : () => setConfirmDel(true)}
            >
              <X size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? 'בטוח? מחק' : 'מחק'}
            </button>
          </div>
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}

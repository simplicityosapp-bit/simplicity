import { useState } from 'react'
import { Check, X, CalendarDays, Clock, Pencil, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { formatWhen, fmtTime } from '../lib/dates'
import { isr } from '../lib/finance'
import { useT } from '../i18n/useT'

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
export default function EventDetailsModal({ open, onClose, event, billClient, onConfirmMeeting, onSkipMeeting, onBillSession, onCompleteReminder, onRemoveReminder, onUpdateEvent, onDeleteEvent, onCancelBooking, onFollowupDone }) {
  const { t } = useT('modalsTask')
  /* Two-step delete confirm (resets per event — parent keys the modal on
     event.id). No undo path here, so the second tap is the safety net. */
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmCancelBk, setConfirmCancelBk] = useState(false) // two-step "cancel booking"
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', start: '', end: '' })
  const [editErr, setEditErr] = useState('')
  /* After confirming a per-session client's meeting happened, offer a one-off
     charge — logging it as a held session (which is what bills a per-session
     client). Only this step keeps the modal open; everything else closes. */
  const [billStep, setBillStep] = useState(false)
  if (!event) return <Modal open={open} onClose={onClose} title={t('event.title')} />

  const confirmHappened = async () => {
    try { await onConfirmMeeting?.(event) } catch { /* parent surfaces errors */ }
    if (billClient) setBillStep(true)
    else onClose()
  }
  const doBill = async () => { try { await onBillSession?.(event) } finally { onClose() } }

  const isMeeting = event.kind === 'meeting'
  const isCalendar = event.kind === 'calendar'
  const isFollowup = event.kind === 'leadFollowup'
  const isOwned = !!event.raw?.owned
  const Icon = (isMeeting || isCalendar) ? CalendarDays : Clock
  const title = event.title || t('event.fallbackTitle')

  const handle = (fn) => async () => {
    try { await fn(event) } finally { onClose() }
  }

  const startEdit = () => {
    setForm({ title: event.title || '', start: toLocalInput(event.when), end: toLocalInput(event.end) })
    setEditErr('')
    setEditing(true)
  }
  const saveEdit = async () => {
    if (!form.start) { setEditErr(t('event.startRequired')); return }
    const patch = {
      title: form.title.trim() || t('event.noTitle'),
      start_time: new Date(form.start).toISOString(),
      end_time: form.end ? new Date(form.end).toISOString() : null,
    }
    try { await onUpdateEvent?.(event, patch) } finally { onClose() }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('event.title')}>
      <div className="evt-detail-head">
        <span className={`evt-detail-icon ${event.kind}`}>
          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <div className="evt-detail-text">
          <p className="evt-detail-title">{title}</p>
          <p className="evt-detail-when">
            {formatWhen(event.when)}
            {event.allDay ? ` · ${t('event.allDay')}` : (event.end ? `–${fmtTime(event.end)}` : '')}
          </p>
        </div>
      </div>

      {isMeeting && event.status === 'pending' && !billStep && (
        <div className="evt-detail-row">
          <p className="evt-detail-question">{t('event.meetingHappened')}</p>
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={confirmHappened}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.yes')}
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={handle(onSkipMeeting)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('event.no')}
            </button>
          </div>
        </div>
      )}

      {/* One-off charge prompt — only for a per-session client, after the
          meeting is confirmed. "Yes" logs a held session (the per-session
          bill); "No" just keeps the confirmation. */}
      {isMeeting && billStep && billClient && (
        <div className="evt-detail-row">
          <p className="evt-detail-question">
            {billClient.price_per_session > 0
              ? t('event.billOneOff', { name: billClient.name, amount: isr(billClient.price_per_session) })
              : t('event.billOneOffNoPrice', { name: billClient.name })}
          </p>
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={doBill}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.billYes')}
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={onClose}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('event.billNo')}
            </button>
          </div>
        </div>
      )}

      {isMeeting && event.status === 'confirmed' && !billStep && (
        <p className="evt-detail-status sage">{t('event.meetingConfirmed')}</p>
      )}

      {isCalendar && !editing && event.booking && (
        <div className="evt-detail-booking">
          <p className="evt-detail-booking-head">{t('event.bookingHeading')}</p>
          <p className="evt-detail-booking-row">{t('event.bookingName', { name: event.booking.name })}</p>
          {event.booking.meetingTypeName && (
            <p className="evt-detail-booking-row">{t('event.bookingType', { type: event.booking.meetingTypeName })}</p>
          )}
          <p className="evt-detail-booking-row">{t('event.bookingFromPage', { page: event.booking.pageName })}</p>
          {event.booking.phone && (
            <p className="evt-detail-booking-row"><a href={`tel:${event.booking.phone}`} dir="ltr">{t('event.bookingPhone')}: {event.booking.phone}</a></p>
          )}
          {event.booking.email && (
            <p className="evt-detail-booking-row"><a href={`mailto:${event.booking.email}`} dir="ltr">{t('event.bookingEmail')}: {event.booking.email}</a></p>
          )}
          {event.booking.note && (
            <p className="evt-detail-booking-row">{t('event.bookingNote', { note: event.booking.note })}</p>
          )}
          {onCancelBooking && event.booking.id && (
            <button
              type="button"
              className="evt-detail-btn skip evt-detail-cancel-booking"
              onClick={confirmCancelBk ? handle(onCancelBooking) : () => setConfirmCancelBk(true)}
            >
              <X size={15} strokeWidth={2} aria-hidden="true" /> {confirmCancelBk ? 'לבטל את התור?' : 'ביטול תור'}
            </button>
          )}
        </div>
      )}

      {isCalendar && !editing && (
        <>
          <p className="evt-detail-status">
            {(() => {
              const links = [
                event.clientName && t('event.linkClient', { name: event.clientName }),
                event.projectName && t('event.linkProject', { name: event.projectName }),
                event.leadName && t('event.linkLead', { name: event.leadName }),
                event.groupName && t('event.linkGroup', { name: event.groupName }),
              ].filter(Boolean)
              return links.length ? `${links.join(' · ')} · ` : ''
            })()}
            {isOwned
              ? t('event.ownedEvent')
              : t('event.googleEvent')}
          </p>
          <div className="evt-detail-row">
            <div className="evt-detail-actions">
              <button type="button" className="evt-detail-btn approve" onClick={startEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden="true" /> {t('event.edit')}
              </button>
              <button
                type="button"
                className="evt-detail-btn skip"
                onClick={confirmDel ? handle(onDeleteEvent) : () => setConfirmDel(true)}
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? t('event.deleteConfirm') : t('event.delete')}
              </button>
            </div>
          </div>
        </>
      )}

      {isCalendar && editing && (
        <div className="evt-detail-row">
          <div className="m-field">
            <label className="m-label">{t('event.eventTitle')}</label>
            <input className="m-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('event.eventTitlePlaceholder')} />
          </div>
          <div className="m-row2">
            <div className="m-field">
              <label className="m-label">{t('event.start')}</label>
              <input type="datetime-local" className="m-input" value={form.start} onChange={(e) => { setForm((f) => ({ ...f, start: e.target.value })); if (editErr) setEditErr('') }} />
            </div>
            <div className="m-field">
              <label className="m-label">{t('event.end')}</label>
              <input type="datetime-local" className="m-input" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </div>
          </div>
          {editErr && <p className="m-error">{editErr}</p>}
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={saveEdit}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('common.save')}
            </button>
            <button type="button" className="evt-detail-btn skip" onClick={() => setEditing(false)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {isFollowup && (
        <div className="evt-detail-row">
          <p className="evt-detail-status">{t('event.followupStatus', { title: event.title })}</p>
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onFollowupDone)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.followupDone')}
            </button>
          </div>
        </div>
      )}

      {!isMeeting && !isCalendar && !isFollowup && (
        <div className="evt-detail-row">
          <div className="evt-detail-actions">
            <button type="button" className="evt-detail-btn approve" onClick={handle(onCompleteReminder)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.markDone')}
            </button>
            <button
              type="button"
              className="evt-detail-btn skip"
              onClick={confirmDel ? handle(onRemoveReminder) : () => setConfirmDel(true)}
            >
              <X size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? t('event.deleteConfirm') : t('taxonomy.deleteConfirm')}
            </button>
          </div>
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Modal>
  )
}

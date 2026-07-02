import { useState } from 'react'
import { Check, X, CalendarDays, Clock, Pencil, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { formatWhen, fmtTime } from '@simplicity/core'
import { isr } from '../lib/finance'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Lnk } from '../components/ui'

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
      <Box className="evt-detail-head">
        <Txt className={`evt-detail-icon ${event.kind}`}>
          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
        </Txt>
        <Box className="evt-detail-text">
          <Txt as="p" className="evt-detail-title">{title}</Txt>
          <Txt as="p" className="evt-detail-when">
            {formatWhen(event.when)}
            {event.allDay ? ` · ${t('event.allDay')}` : (event.end ? `–${fmtTime(event.end)}` : '')}
          </Txt>
        </Box>
      </Box>

      {isMeeting && event.status === 'pending' && !billStep && (
        <Box className="evt-detail-row">
          <Txt as="p" className="evt-detail-question">{t('event.meetingHappened')}</Txt>
          <Box className="evt-detail-actions">
            <Btn type="button" className="evt-detail-btn approve" onClick={confirmHappened}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.yes')}
            </Btn>
            <Btn type="button" className="evt-detail-btn skip" onClick={handle(onSkipMeeting)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('event.no')}
            </Btn>
          </Box>
        </Box>
      )}

      {/* One-off charge prompt — only for a per-session client, after the
          meeting is confirmed. "Yes" logs a held session (the per-session
          bill); "No" just keeps the confirmation. */}
      {isMeeting && billStep && billClient && (
        <Box className="evt-detail-row">
          <Txt as="p" className="evt-detail-question">
            {billClient.price_per_session > 0
              ? t('event.billOneOff', { name: billClient.name, amount: isr(billClient.price_per_session) })
              : t('event.billOneOffNoPrice', { name: billClient.name })}
          </Txt>
          <Box className="evt-detail-actions">
            <Btn type="button" className="evt-detail-btn approve" onClick={doBill}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.billYes')}
            </Btn>
            <Btn type="button" className="evt-detail-btn skip" onClick={onClose}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('event.billNo')}
            </Btn>
          </Box>
        </Box>
      )}

      {isMeeting && event.status === 'confirmed' && !billStep && (
        <Txt as="p" className="evt-detail-status sage">{t('event.meetingConfirmed')}</Txt>
      )}

      {isCalendar && !editing && event.booking && (
        <Box className="evt-detail-booking">
          <Txt as="p" className="evt-detail-booking-head">{t('event.bookingHeading')}</Txt>
          <Txt as="p" className="evt-detail-booking-row">{t('event.bookingName', { name: event.booking.name })}</Txt>
          {event.booking.meetingTypeName && (
            <Txt as="p" className="evt-detail-booking-row">{t('event.bookingType', { type: event.booking.meetingTypeName })}</Txt>
          )}
          <Txt as="p" className="evt-detail-booking-row">{t('event.bookingFromPage', { page: event.booking.pageName })}</Txt>
          {event.booking.phone && (
            <Txt as="p" className="evt-detail-booking-row"><Lnk href={`tel:${event.booking.phone}`} dir="ltr">{t('event.bookingPhone')}: {event.booking.phone}</Lnk></Txt>
          )}
          {event.booking.email && (
            <Txt as="p" className="evt-detail-booking-row"><Lnk href={`mailto:${event.booking.email}`} dir="ltr">{t('event.bookingEmail')}: {event.booking.email}</Lnk></Txt>
          )}
          {event.booking.note && (
            <Txt as="p" className="evt-detail-booking-row">{t('event.bookingNote', { note: event.booking.note })}</Txt>
          )}
          {onCancelBooking && event.booking.id && (
            <Btn
              type="button"
              className="evt-detail-btn skip evt-detail-cancel-booking"
              onClick={confirmCancelBk ? handle(onCancelBooking) : () => setConfirmCancelBk(true)}
            >
              <X size={15} strokeWidth={2} aria-hidden="true" /> {confirmCancelBk ? t('event.cancelBookingConfirm') : t('event.cancelBooking')}
            </Btn>
          )}
        </Box>
      )}

      {isCalendar && !editing && (
        <>
          <Txt as="p" className="evt-detail-status">
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
          </Txt>
          <Box className="evt-detail-row">
            <Box className="evt-detail-actions">
              <Btn type="button" className="evt-detail-btn approve" onClick={startEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden="true" /> {t('event.edit')}
              </Btn>
              <Btn
                type="button"
                className="evt-detail-btn skip"
                onClick={confirmDel ? handle(onDeleteEvent) : () => setConfirmDel(true)}
              >
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? t('event.deleteConfirm') : t('event.delete')}
              </Btn>
            </Box>
          </Box>
        </>
      )}

      {isCalendar && editing && (
        <Box className="evt-detail-row">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('event.eventTitle')}</Box>
            <Input className="m-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('event.eventTitlePlaceholder')} />
          </Box>
          <Box className="m-row2">
            <Box className="m-field">
              <Box as="label" className="m-label">{t('event.start')}</Box>
              <Input type="datetime-local" className="m-input" value={form.start} onChange={(e) => { setForm((f) => ({ ...f, start: e.target.value })); if (editErr) setEditErr('') }} />
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('event.end')}</Box>
              <Input type="datetime-local" className="m-input" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
            </Box>
          </Box>
          {editErr && <Txt as="p" className="m-error">{editErr}</Txt>}
          <Box className="evt-detail-actions">
            <Btn type="button" className="evt-detail-btn approve" onClick={saveEdit}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('common.save')}
            </Btn>
            <Btn type="button" className="evt-detail-btn skip" onClick={() => setEditing(false)}>
              <X size={15} strokeWidth={2} aria-hidden="true" /> {t('common.cancel')}
            </Btn>
          </Box>
        </Box>
      )}

      {isFollowup && (
        <Box className="evt-detail-row">
          <Txt as="p" className="evt-detail-status">{t('event.followupStatus', { title: event.title })}</Txt>
          <Box className="evt-detail-actions">
            <Btn type="button" className="evt-detail-btn approve" onClick={handle(onFollowupDone)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.followupDone')}
            </Btn>
          </Box>
        </Box>
      )}

      {!isMeeting && !isCalendar && !isFollowup && (
        <Box className="evt-detail-row">
          <Box className="evt-detail-actions">
            <Btn type="button" className="evt-detail-btn approve" onClick={handle(onCompleteReminder)}>
              <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('event.markDone')}
            </Btn>
            <Btn
              type="button"
              className="evt-detail-btn skip"
              onClick={confirmDel ? handle(onRemoveReminder) : () => setConfirmDel(true)}
            >
              <X size={15} strokeWidth={2} aria-hidden="true" /> {confirmDel ? t('event.deleteConfirm') : t('taxonomy.deleteConfirm')}
            </Btn>
          </Box>
        </Box>
      )}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.close')}</Btn>
      </Box>
    </Modal>
  )
}

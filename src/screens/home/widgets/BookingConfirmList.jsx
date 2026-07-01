import { useMemo, useState } from 'react'
import { Check, X, Phone, Mail, Clock } from 'lucide-react'
import { useBookings } from '../../../hooks/useBookings'
import { useMeetingTypes } from '../../../hooks/useMeetingTypes'
import { formatWhen } from '../../../lib/dates'
import { useT } from '../../../i18n/useT'
import './BookingConfirmList.css'
import { Box, Txt, Btn, Lnk } from '../../../components/ui'

/* Pending-booking review list — rendered inside the home "דרושה תשומת לב"
   popup. Per booking: who + when + meeting type + contact, with approve /
   reject. Approve creates a lead + an owned calendar event for the slot;
   reject frees the slot. */
export default function BookingConfirmList() {
  const { t } = useT('home')
  const { bookings, confirm, reject } = useBookings()
  const { types } = useMeetingTypes()
  const [busyId, setBusyId] = useState(null) // row being confirmed/rejected — guards double-click

  const run = async (id, fn) => {
    if (busyId) return
    setBusyId(id)
    try { await fn() } catch { /* surfaced via toast in the hook */ } finally { setBusyId(null) }
  }

  const pending = useMemo(
    () => (bookings || []).filter((b) => b.status === 'pending').sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [bookings],
  )
  const typeName = (id) => (types || []).find((t) => t.id === id)?.name || null

  if (!pending.length) return <Txt as="p" className="h-card-empty">{t('widgets.bookingConfirm.empty')}</Txt>

  return (
    <Box className="bk-confirm-list">
      {pending.map((b) => (
        <Box key={b.id} className="bk-confirm-row">
          <Box className="bk-confirm-main">
            <Txt as="p" className="bk-confirm-name">{b.name}</Txt>
            <Txt as="p" className="bk-confirm-meta">
              <Clock size={13} strokeWidth={1.7} aria-hidden="true" /> {formatWhen(b.starts_at)}
              {typeName(b.meeting_type_id) ? ` · ${typeName(b.meeting_type_id)}` : ''}
            </Txt>
            {(b.phone || b.email) && (
              <Txt as="p" className="bk-confirm-contact">
                {b.phone ? <Lnk href={`tel:${b.phone}`}><Phone size={12} strokeWidth={1.7} /> {b.phone}</Lnk> : null}
                {b.email ? <Lnk href={`mailto:${b.email}`}><Mail size={12} strokeWidth={1.7} /> {b.email}</Lnk> : null}
              </Txt>
            )}
            {b.note ? <Txt as="p" className="bk-confirm-note">{b.note}</Txt> : null}
          </Box>
          <Box className="bk-confirm-actions">
            <Btn type="button" className="bk-confirm-btn approve" onClick={() => run(b.id, () => confirm(b))} disabled={busyId === b.id} aria-label={t('widgets.bookingConfirm.approve')}>
              <Check size={16} strokeWidth={2} />
            </Btn>
            <Btn type="button" className="bk-confirm-btn reject" onClick={() => run(b.id, () => reject(b.id))} disabled={busyId === b.id} aria-label={t('widgets.bookingConfirm.reject')}>
              <X size={16} strokeWidth={2} />
            </Btn>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

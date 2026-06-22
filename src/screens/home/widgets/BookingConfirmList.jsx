import { useMemo, useState } from 'react'
import { Check, X, Phone, Mail, Clock } from 'lucide-react'
import { useBookings } from '../../../hooks/useBookings'
import { useMeetingTypes } from '../../../hooks/useMeetingTypes'
import './BookingConfirmList.css'

/* Pending-booking review list — rendered inside the home "דרושה תשומת לב"
   popup. Per booking: who + when + meeting type + contact, with approve /
   reject. Approve creates a lead + an owned calendar event for the slot;
   reject frees the slot. */
const fmtWhen = (iso) =>
  new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

export default function BookingConfirmList() {
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

  if (!pending.length) return <p className="h-card-empty">אין תורים ממתינים לאישור.</p>

  return (
    <div className="bk-confirm-list">
      {pending.map((b) => (
        <div key={b.id} className="bk-confirm-row">
          <div className="bk-confirm-main">
            <p className="bk-confirm-name">{b.name}</p>
            <p className="bk-confirm-meta">
              <Clock size={13} strokeWidth={1.7} aria-hidden="true" /> {fmtWhen(b.starts_at)}
              {typeName(b.meeting_type_id) ? ` · ${typeName(b.meeting_type_id)}` : ''}
            </p>
            {(b.phone || b.email) && (
              <p className="bk-confirm-contact">
                {b.phone ? <a href={`tel:${b.phone}`}><Phone size={12} strokeWidth={1.7} /> {b.phone}</a> : null}
                {b.email ? <a href={`mailto:${b.email}`}><Mail size={12} strokeWidth={1.7} /> {b.email}</a> : null}
              </p>
            )}
            {b.note ? <p className="bk-confirm-note">{b.note}</p> : null}
          </div>
          <div className="bk-confirm-actions">
            <button type="button" className="bk-confirm-btn approve" onClick={() => run(b.id, () => confirm(b))} disabled={busyId === b.id} aria-label="אישור">
              <Check size={16} strokeWidth={2} />
            </button>
            <button type="button" className="bk-confirm-btn reject" onClick={() => run(b.id, () => reject(b.id))} disabled={busyId === b.id} aria-label="דחייה">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

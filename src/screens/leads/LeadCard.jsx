import { Clock, Check, CalendarDays, ArrowLeft } from 'lucide-react'
import { statusMetaOfLead } from '../../lib/leads'
import { fmtShortDate } from '../../lib/dates'

export default function LeadCard({ lead, onEdit, onConvert, sources = [], statuses = [] }) {
  const meta = statusMetaOfLead(lead)
  const source = lead.source_id ? sources.find((s) => s.id === lead.source_id) : null
  const sub = lead.status_id ? statuses.find((s) => s.id === lead.status_id) : null
  const today = new Date().toISOString().slice(0, 10)
  const overdue = lead.follow_up_date && lead.follow_up_date <= today && meta === 'in_process'
  const isConverted = meta === 'converted' && lead.converted_to_client_id

  return (
    <div
      className="lead-card"
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(lead)}
      draggable={!!onEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/lead-id', lead.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <p className="lead-card-name" title={lead.name}>{lead.name}</p>

      {sub && (
        <div className="lead-sub">
          <span className="lead-sub-dot" style={{ background: sub.color || 'var(--stone)' }} />
          <span>{sub.display_name}</span>
        </div>
      )}

      <div className="lead-src">
        <span className="lead-src-dot" style={{ background: source?.color || 'rgba(42,37,32,.2)' }} />
        <span className={source ? '' : 'lead-src-none'}>{source ? source.name : 'ללא מקור'}</span>
      </div>

      {lead.inquiry_date && (
        <div className="lead-line">
          <CalendarDays size={12} strokeWidth={1.6} aria-hidden="true" />
          <span>פנייה {fmtShortDate(lead.inquiry_date)}</span>
        </div>
      )}

      {lead.follow_up_date && (
        <div className={`lead-line lead-fu${overdue ? ' overdue' : ''}`}>
          <Clock size={12} strokeWidth={1.6} aria-hidden="true" />
          <span>{fmtShortDate(lead.follow_up_date)}</span>
        </div>
      )}

      {isConverted && (
        <div className="lead-converted">
          <Check size={12} strokeWidth={2} aria-hidden="true" /> הומר ללקוח
        </div>
      )}

      {!isConverted && onConvert && (
        <button
          type="button"
          className="lead-convert-btn"
          onClick={(e) => { e.stopPropagation(); onConvert(lead) }}
        >
          <ArrowLeft size={11} strokeWidth={1.8} aria-hidden="true" /> המר ללקוח
        </button>
      )}
    </div>
  )
}

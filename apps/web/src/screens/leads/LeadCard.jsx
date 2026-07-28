import { memo } from 'react'
import { Clock, Check, CalendarDays, ArrowLeft, Trash2 } from 'lucide-react'
import { statusMetaOfLead, isConvertedLead, fmtShortDate } from '@simplicity/core'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

function LeadCard({ lead, onEdit, onConvert, onDelete, sources = [], statuses = [], dragProps = null, dragging = false }) {
  const { t } = useT('leads')
  const waMsg = useWhatsAppMessage()
  const meta = statusMetaOfLead(lead)
  const source = lead.source_id ? sources.find((s) => s.id === lead.source_id) : null
  const sub = lead.status_id ? statuses.find((s) => s.id === lead.status_id) : null
  // Local date (mirror LeadsScreen.dueFollowups) — UTC toISOString would flip the
  // overdue highlight near midnight and disagree with the follow-ups banner/list.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const overdue = lead.follow_up_date && String(lead.follow_up_date).slice(0, 10) <= today && meta === 'in_process'
  /* The SAME test the stats use (core isConvertedLead), not a private one.
     The card used to require converted_to_client_id, so a lead dragged into
     the converted column showed no badge while the column header counted it —
     the card and the numbers disagreed about the same lead.
     A dragged lead has no client record, so the convert action stays available
     for it; that is a real remaining step, not a contradiction of the badge. */
  const isConverted = isConvertedLead(lead)
  const needsClientRecord = isConverted && !lead.converted_to_client_id

  return (
    <Box
      className={`lead-card${dragging ? ' dragging' : ''}`}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(lead)}
      onKeyDown={onEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(lead) } } : undefined}
      {...(dragProps || {})}
    >
      {/* Deleting sits back in the corner of the card, on the card itself —
          a press on a <button> starts no drag (usePointerDnd ignores those),
          and stopPropagation keeps it from opening the editor behind it. */}
      {onDelete && (
        <Btn
          type="button"
          className="lead-del-btn"
          aria-label={t('card.deleteAria', { name: lead.name })}
          title={t('card.deleteTitle')}
          onClick={(e) => { e.stopPropagation(); onDelete(lead) }}
        >
          <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
        </Btn>
      )}

      <Txt as="p" className="lead-card-name" title={lead.name}>{lead.name}</Txt>

      {sub && (
        <Box className="lead-sub">
          <Txt className="lead-sub-dot" style={{ background: sub.color || 'var(--stone)' }} />
          <Txt>{sub.display_name}</Txt>
        </Box>
      )}

      <Box className="lead-src">
        <Txt className="lead-src-dot" style={{ background: source?.color || 'rgba(42,37,32,.2)' }} />
        <Txt className={source ? '' : 'lead-src-none'}>{source ? source.name : t('card.noSource')}</Txt>
      </Box>

      {lead.inquiry_date && (
        <Box className="lead-line">
          <CalendarDays size={12} strokeWidth={1.6} aria-hidden="true" />
          <Txt>{t('card.inquiry', { date: fmtShortDate(lead.inquiry_date) })}</Txt>
        </Box>
      )}

      {lead.follow_up_date && (
        <Box className={`lead-line lead-fu${overdue ? ' overdue' : ''}`}>
          <Clock size={12} strokeWidth={1.6} aria-hidden="true" />
          <Txt>{fmtShortDate(lead.follow_up_date)}</Txt>
        </Box>
      )}

      <Box className="lead-card-foot">
        {isConverted && (
          <Box className="lead-converted">
            <Check size={12} strokeWidth={2} aria-hidden="true" /> {t('card.converted')}
          </Box>
        )}
        {/* Offered while the lead is not converted, and also for a converted
            lead that has no client record yet (the drag path marks the column
            but cannot create a client). */}
        {(!isConverted || needsClientRecord) && onConvert && (
          <Btn
            type="button"
            className="lead-convert-btn"
            onClick={(e) => { e.stopPropagation(); onConvert(lead) }}
          >
            <ArrowLeft size={11} strokeWidth={1.8} aria-hidden="true" />
            {needsClientRecord ? t('card.createClient') : t('card.convert')}
          </Btn>
        )}
        {/* Direct WhatsApp on EVERY lead. With no phone, wa.me opens WhatsApp's
           own contact picker. Stops propagation so it won't open edit/drag. */}
        <WhatsAppButton
          phone={lead.phone || ''}
          message={waMsg('lead', { name: lead.name })}
          triggerClassName="lead-wa-btn"
        />
      </Box>
    </Box>
  )
}

export default memo(LeadCard)

import { useMemo } from 'react'
import { Inbox, Check, X } from 'lucide-react'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   PENDING LEADS — public-page submissions awaiting manual approval.
   Renders nothing when empty. Approve → into the official list;
   reject → soft-delete (undoable via the global undo toast).
   ════════════════════════════════════════════════════════════════ */

/* leads column → the value on the lead row, for the builtin fields. */
const COLUMN_VALUE = (lead, col) => {
  if (col === 'notes') return lead.notes
  return lead[col]
}

export default function PendingLeadsSection({ pending = [], pages = [], onApprove, onReject }) {
  const { t } = useT('leads')
  const waMsg = useWhatsAppMessage()
  const pageById = useMemo(() => {
    const m = {}
    ;(pages || []).forEach((p) => { m[p.id] = p })
    return m
  }, [pages])

  if (!pending.length) return null

  /* Build display rows: [{ label, value }] for each lead, resolving free-field
     keys to their page label where possible, builtins to a fixed label. */
  const BUILTIN_LABEL = { name: t('pending.fName'), phone: t('pending.fPhone'), email: t('pending.fEmail'), notes: t('pending.fNotes') }

  const rowsFor = (lead) => {
    const page = lead.page_id ? pageById[lead.page_id] : null
    const fieldLabel = {}
    if (Array.isArray(page?.fields)) page.fields.forEach((f) => { fieldLabel[f.key] = f.label })

    const out = []
    // Builtin columns that carry a value.
    ;['name', 'phone', 'email', 'notes'].forEach((col) => {
      const v = COLUMN_VALUE(lead, col)
      if (v) out.push({ label: BUILTIN_LABEL[col], value: v })
    })
    // Free fields from the JSONB data blob.
    Object.entries(lead.data || {}).forEach(([k, v]) => {
      if (v) out.push({ label: fieldLabel[k] || k, value: String(v) })
    })
    return out
  }

  return (
    <Box as="section" className="l-pending" aria-label={t('pending.aria')}>
      <Box className="l-pending-head">
        <Inbox size={16} strokeWidth={1.7} aria-hidden="true" />
        <Txt className="l-pending-title">{t('pending.title')}</Txt>
        <Txt className="l-pending-count mono">{pending.length}</Txt>
      </Box>
      <Box className="l-pending-list">
        {pending.map((lead) => {
          const page = lead.page_id ? pageById[lead.page_id] : null
          return (
            <Box className="l-pending-card" key={lead.id}>
              <Box className="l-pending-info">
                {page?.title ? <Txt as="p" className="l-pending-source">{t('pending.from', { page: page.title })}</Txt> : null}
                <dl className="l-pending-fields">
                  {rowsFor(lead).map((r) => (
                    <Box className="l-pending-field" key={`${lead.id}-${r.label}`}>
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </Box>
                  ))}
                </dl>
              </Box>
              <Box className="l-pending-actions">
                <WhatsAppButton
                  phone={lead.phone || ''}
                  message={waMsg('lead', { name: lead.name })}
                  triggerClassName="l-pending-wa"
                />
                <Btn type="button" className="l-pending-approve" onClick={() => onApprove(lead.id)}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('pending.approve')}
                </Btn>
                <Btn type="button" className="l-pending-reject" onClick={() => onReject(lead.id)} aria-label={t('pending.reject')}>
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

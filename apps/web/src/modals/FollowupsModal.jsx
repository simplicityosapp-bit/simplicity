import { Check } from 'lucide-react'
import Modal from './Modal'
import WhatsAppButton from '../components/WhatsAppButton'
import { useWhatsAppMessage } from '../hooks/useWhatsAppMessage'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* "פולואו-אפים פתוחים" — the leads whose follow-up is due (date ≤ today,
   still in_process). Opened from the banner on the leads screen. Each row
   opens the lead, or marks the follow-up done (clears the date). */
const ddmm = (d) => {
  const p = String(d || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : ''
}

export default function FollowupsModal({ open, onClose, leads = [], onOpenLead, onMarkDone }) {
  const { t } = useT('modalsTask')
  const waMsg = useWhatsAppMessage()
  return (
    <Modal open={open} onClose={onClose} title={t('followups.title')}>
      {leads.length === 0 ? (
        <Txt as="p" className="m-hint">{t('followups.empty')}</Txt>
      ) : (
        <Box className="fu-list">
          {leads.map((l) => (
            <Box key={l.id} className="fu-row">
              <Btn type="button" className="fu-open" onClick={() => onOpenLead?.(l)}>
                <Txt className="fu-name">{l.name}</Txt>
                <Txt className="fu-date mono">{ddmm(l.follow_up_date)}</Txt>
              </Btn>
              <WhatsAppButton phone={l.phone} message={waMsg('lead', { name: l.name })} />
              <Btn type="button" className="fu-done" onClick={() => onMarkDone?.(l)} aria-label={t('followups.doneAria')} title={t('followups.doneTitle')}>
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </Box>
          ))}
        </Box>
      )}
      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</Btn>
      </Box>
    </Modal>
  )
}

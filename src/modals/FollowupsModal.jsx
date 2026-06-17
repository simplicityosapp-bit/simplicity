import { Check } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'

/* "פולואו-אפים פתוחים" — the leads whose follow-up is due (date ≤ today,
   still in_process). Opened from the banner on the leads screen. Each row
   opens the lead, or marks the follow-up done (clears the date). */
const ddmm = (d) => {
  const p = String(d || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : ''
}

export default function FollowupsModal({ open, onClose, leads = [], onOpenLead, onMarkDone }) {
  const { t } = useT('modalsTask')
  return (
    <Modal open={open} onClose={onClose} title={t('followups.title')}>
      {leads.length === 0 ? (
        <p className="m-hint">{t('followups.empty')}</p>
      ) : (
        <div className="fu-list">
          {leads.map((l) => (
            <div key={l.id} className="fu-row">
              <button type="button" className="fu-open" onClick={() => onOpenLead?.(l)}>
                <span className="fu-name">{l.name}</span>
                <span className="fu-date mono">{ddmm(l.follow_up_date)}</span>
              </button>
              <button type="button" className="fu-done" onClick={() => onMarkDone?.(l)} aria-label={t('followups.doneAria')} title={t('followups.doneTitle')}>
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="m-actions">
        <button type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Modal>
  )
}

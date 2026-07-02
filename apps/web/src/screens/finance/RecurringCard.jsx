import { Pencil, Trash2, Pause, Play } from 'lucide-react'
import { isr, describeCadence } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* One row in the "תבניות חוזרות" section: the template's identity
   (desc + amount + cadence), an Active toggle (pause/play), and
   secondary edit/delete actions. Soft visual difference for paused
   templates so the user can see at a glance which series isn't
   generating right now. */
export default function RecurringCard({ template, onEdit, onDelete, onToggleActive }) {
  const { t } = useT('finance')
  const isIncome = template.type === 'income'
  const sign = isIncome ? '+' : '−'
  const amount = `${sign}${isr(Math.abs(template.amount || 0))}`
  const cadence = describeCadence(template)
  const paused = !template.active

  return (
    <Box className={`rec-card${paused ? ' paused' : ''}`}>
      <Box className="rec-card-main">
        <Txt as="p" className="rec-card-desc">{template.desc || (isIncome ? t('recurring.income') : t('recurring.expense'))}</Txt>
        <Txt as="p" className="rec-card-meta">{cadence}{paused ? ` · ${t('recurring.paused')}` : ''}</Txt>
      </Box>
      <Txt as="p" className={`rec-card-amount mono${isIncome ? ' income' : ' expense'}`}>{amount}</Txt>
      <Box className="rec-card-actions">
        <Btn
          type="button"
          className="rec-card-btn"
          onClick={() => onToggleActive(template)}
          aria-label={paused ? t('recurring.resume') : t('recurring.pause')}
          title={paused ? t('recurring.resume') : t('recurring.pause')}
        >
          {paused
            ? <Play size={14} strokeWidth={1.6} aria-hidden="true" />
            : <Pause size={14} strokeWidth={1.6} aria-hidden="true" />}
        </Btn>
        <Btn
          type="button"
          className="rec-card-btn"
          onClick={() => onEdit(template)}
          aria-label={t('recurring.edit')}
          title={t('recurring.edit')}
        >
          <Pencil size={14} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Btn
          type="button"
          className="rec-card-btn rec-card-btn-danger"
          onClick={() => onDelete(template)}
          aria-label={t('recurring.delete')}
          title={t('recurring.delete')}
        >
          <Trash2 size={14} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
      </Box>
    </Box>
  )
}

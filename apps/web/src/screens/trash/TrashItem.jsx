import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { fmtTimeAgo, fmtShortDate } from '../../lib/dates'
import { isr } from '../../lib/finance'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* Primary-label resolver per entity type — mirrors the "Primary label
   per entity" table in data-model.md so a generic list can render any
   soft-deleted row without per-screen knowledge. */
function primaryLabel(entityType, row, t) {
  switch (entityType) {
    case 'clients':
    case 'projects':
    case 'groups':
    case 'leads':
    case 'leadSources':
    case 'categories':
    case 'goalCategories':
      return row.name || '—'
    case 'leadStatuses':
      return row.display_name || '—'
    case 'tasks':
      return row.title || '—'
    case 'reminders':
      return row.title || '—'
    case 'goals':
      return row.label || (row.target_value != null ? t('item.goalFallback', { value: row.target_value }) : '—')
    case 'goalEntries': {
      const v = row.value ?? '—'
      return row.date ? `${v} · ${fmtShortDate(row.date)}` : `${v}`
    }
    case 'userQuestions':
      return row.custom_text || row.template_key || '—'
    case 'dailyAnswers': {
      const v = row.value_num ?? row.value_text ?? '—'
      return row.date ? `${fmtShortDate(row.date)} · ${v}` : `${v}`
    }
    case 'transactions': {
      if (row.desc) return row.desc
      const sign = row.type === 'expense' ? '−' : '+'
      return `${sign}${isr(Math.abs(row.amount || 0))}`
    }
    case 'recurring': {
      if (row.desc) return row.desc
      const sign = row.type === 'expense' ? '−' : '+'
      return `${sign}${isr(Math.abs(row.amount || 0))}`
    }
    case 'sessions': {
      const num = row.num != null ? t('item.sessionNum', { num: row.num }) : t('item.session')
      return row.date ? `${num} · ${fmtShortDate(row.date)}` : num
    }
    default:
      return row.name || row.title || '—'
  }
}

export default function TrashItem({ entityType, row, onRestore }) {
  const { t } = useT('trash')
  const [busy, setBusy] = useState(false)
  const label = primaryLabel(entityType, row, t)

  const handleRestore = async () => {
    if (busy) return
    setBusy(true)
    try { await onRestore() } catch { setBusy(false) }
  }

  return (
    <Box className="trash-item">
      <Box className="trash-item-main">
        <Txt as="p" className="trash-item-label">{label}</Txt>
        <Txt as="p" className="trash-item-meta">{t('item.deletedAgo', { ago: fmtTimeAgo(row.deleted_at) })}</Txt>
      </Box>
      <Btn
        type="button"
        className="trash-item-restore"
        onClick={handleRestore}
        disabled={busy}
        aria-label={t('item.restoreLabel', { label })}
      >
        <RotateCcw size={14} strokeWidth={1.6} aria-hidden="true" />
        <Txt>{busy ? t('item.restoring') : t('item.restore')}</Txt>
      </Btn>
    </Box>
  )
}

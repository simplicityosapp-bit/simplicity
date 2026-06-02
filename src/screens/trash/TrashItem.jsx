import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { fmtTimeAgo, fmtShortDate } from '../../lib/dates'
import { isr } from '../../lib/finance'

/* Primary-label resolver per entity type — mirrors the "Primary label
   per entity" table in data-model.md so a generic list can render any
   soft-deleted row without per-screen knowledge. */
function primaryLabel(entityType, row) {
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
      return row.label || (row.target_value != null ? `יעד ${row.target_value}` : '—')
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
      const num = row.num != null ? `פגישה ${row.num}` : 'פגישה'
      return row.date ? `${num} · ${fmtShortDate(row.date)}` : num
    }
    default:
      return row.name || row.title || '—'
  }
}

export default function TrashItem({ entityType, row, onRestore }) {
  const [busy, setBusy] = useState(false)
  const label = primaryLabel(entityType, row)

  const handleRestore = async () => {
    if (busy) return
    setBusy(true)
    try { await onRestore() } catch { setBusy(false) }
  }

  return (
    <div className="trash-item">
      <div className="trash-item-main">
        <p className="trash-item-label">{label}</p>
        <p className="trash-item-meta">נמחק {fmtTimeAgo(row.deleted_at)}</p>
      </div>
      <button
        type="button"
        className="trash-item-restore"
        onClick={handleRestore}
        disabled={busy}
        aria-label={`שחזר ${label}`}
      >
        <RotateCcw size={14} strokeWidth={1.6} aria-hidden="true" />
        <span>{busy ? 'משחזר…' : 'שחזור'}</span>
      </button>
    </div>
  )
}

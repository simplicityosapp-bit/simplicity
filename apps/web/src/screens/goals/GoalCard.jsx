import { memo, useState } from 'react'
import { Star, Plus, X, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { formatGoalValue, timeFrameLabel } from '../../lib/goals'
import { fmtShortDate } from '@simplicity/core'
import ConfirmModal from '../../modals/ConfirmModal'
import MoonDualBars from '../../components/MoonDualBars'
import { Box, Txt, Btn } from '../../components/ui'
import { useT } from '../../i18n/useT'

function GoalCard({ scored, index, entries = [], onAddEntry, onDeleteEntry, onEdit, onDelete }) {
  const { t } = useT('goals')
  const { goal, cat, actual, target, pure: rawPure, paced: rawPaced } = scored
  const pure = Number.isFinite(rawPure) ? rawPure : 0
  const paced = Number.isFinite(rawPaced) ? rawPaced : pure
  const importance = goal.importance || 3
  const isManual = cat.measurement_type === 'manual'
  const [showHistory, setShowHistory] = useState(false)
  const [confirmEntry, setConfirmEntry] = useState(null) // entry awaiting delete confirm

  const catEntries = isManual
    ? entries.filter((e) => e.category_id === cat.id).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
    : []

  return (
    <Box className="g-card anim" style={{ animationDelay: `${index * 0.05}s` }}>
      <Box className="g-card-head">
        <Box className="g-card-titleblock">
          <Txt as="p" className="g-card-title">{goal.label || cat.name}</Txt>
          <Txt as="p" className="g-card-cat">
            <Txt className="g-card-cat-dot" style={{ background: cat.color || 'var(--stone)' }} />
            {cat.name} · {timeFrameLabel(goal)}
          </Txt>
        </Box>
        <Btn className="g-card-edit" onClick={() => onEdit?.(goal)} aria-label={t('card.editAria')}>
          <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        <Btn className="g-card-del" onClick={() => onDelete?.(goal)} aria-label={t('card.deleteAria')}>
          <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        <Txt as="p" className={`g-card-pct${pure >= 100 ? ' over' : ''}`}>
          {Math.min(pure, 100)}%{pure > 100 ? '+' : ''}
        </Txt>
      </Box>

      {/* Per-goal: pace + goal-% side by side (was a lone goal-% bar). */}
      <MoonDualBars pace={Math.min(100, paced)} goal={pure} />


      <Box className="g-card-meta">
        <Txt className="g-card-target mono">
          {formatGoalValue(actual, cat)} / {formatGoalValue(target, cat)}
        </Txt>
        <Txt className="g-card-stars" aria-label={t('card.importanceAria', { importance })}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={12}
              strokeWidth={1.5}
              className={i <= importance ? 'on' : ''}
              fill={i <= importance ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          ))}
        </Txt>
      </Box>

      {isManual && (
        <Box className="g-entry-bar">
          <Btn className="g-entry-add" onClick={() => onAddEntry?.(cat)}>
            <Plus size={14} strokeWidth={1.9} aria-hidden="true" /> {t('card.addEntry')}
          </Btn>
          {catEntries.length > 0 && (
            <Btn className={`g-entry-toggle${showHistory ? ' open' : ''}`} onClick={() => setShowHistory((o) => !o)} aria-expanded={showHistory}>
              {t('card.history')} <Txt className="g-entry-count">{catEntries.length}</Txt>
              <ChevronDown size={14} strokeWidth={1.6} className="g-entry-chev" aria-hidden="true" />
            </Btn>
          )}
        </Box>
      )}

      {isManual && showHistory && catEntries.length > 0 && (
        <Box className="g-entries">
          {catEntries.map((e) => (
            <Box key={e.id} className="g-entry-row">
              <Txt className="g-entry-val mono">{formatGoalValue(e.value, cat)}</Txt>
              <Txt className="g-entry-date">{fmtShortDate(e.date)}</Txt>
              {e.note && <Txt className="g-entry-note">· {e.note}</Txt>}
              <Btn className="g-entry-del" onClick={() => setConfirmEntry(e)} aria-label={t('card.deleteEntryAria')}>
                <X size={13} strokeWidth={1.8} aria-hidden="true" />
              </Btn>
            </Box>
          ))}
        </Box>
      )}

      <ConfirmModal
        open={!!confirmEntry}
        onClose={() => setConfirmEntry(null)}
        title={t('card.deleteEntryTitle')}
        danger
        confirmLabel={t('card.deleteEntryConfirm')}
        message={confirmEntry ? t('card.deleteEntryMessage', { value: formatGoalValue(confirmEntry.value, cat), date: fmtShortDate(confirmEntry.date) }) : ''}
        onConfirm={() => { if (confirmEntry) return onDeleteEntry?.(confirmEntry.id) }}
      />
    </Box>
  )
}

export default memo(GoalCard)

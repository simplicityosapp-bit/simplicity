import { memo, useState } from 'react'
import { Star, Plus, X, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { formatGoalValue, timeFrameLabel } from '../../lib/goals'
import { fmtShortDate } from '../../lib/dates'
import ConfirmModal from '../../modals/ConfirmModal'
import MoonDualBars from '../../components/MoonDualBars'

function GoalCard({ scored, index, entries = [], onAddEntry, onDeleteEntry, onEdit, onDelete }) {
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
    <div className="g-card anim" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="g-card-head">
        <div className="g-card-titleblock">
          <p className="g-card-title">{goal.label || cat.name}</p>
          <p className="g-card-cat">
            <span className="g-card-cat-dot" style={{ background: cat.color || 'var(--stone)' }} />
            {cat.name} · {timeFrameLabel(goal)}
          </p>
        </div>
        <button type="button" className="g-card-edit" onClick={() => onEdit?.(goal)} aria-label="עריכת יעד">
          <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button type="button" className="g-card-del" onClick={() => onDelete?.(goal)} aria-label="מחיקת יעד">
          <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <p className={`g-card-pct${pure >= 100 ? ' over' : ''}`}>
          {Math.min(pure, 100)}%{pure > 100 ? '+' : ''}
        </p>
      </div>

      {/* Per-goal: pace + goal-% side by side (was a lone goal-% bar). */}
      <MoonDualBars pace={Math.min(100, paced)} goal={pure} />


      <div className="g-card-meta">
        <span className="g-card-target mono">
          {formatGoalValue(actual, cat)} / {formatGoalValue(target, cat)}
        </span>
        <span className="g-card-stars" aria-label={`חשיבות ${importance} מתוך 5`}>
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
        </span>
      </div>

      {isManual && (
        <div className="g-entry-bar">
          <button type="button" className="g-entry-add" onClick={() => onAddEntry?.(cat)}>
            <Plus size={14} strokeWidth={1.9} aria-hidden="true" /> הזנה
          </button>
          {catEntries.length > 0 && (
            <button type="button" className={`g-entry-toggle${showHistory ? ' open' : ''}`} onClick={() => setShowHistory((o) => !o)} aria-expanded={showHistory}>
              היסטוריה <span className="g-entry-count">{catEntries.length}</span>
              <ChevronDown size={14} strokeWidth={1.6} className="g-entry-chev" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {isManual && showHistory && (
        <div className="g-entries">
          {catEntries.map((e) => (
            <div key={e.id} className="g-entry-row">
              <span className="g-entry-val mono">{formatGoalValue(e.value, cat)}</span>
              <span className="g-entry-date">{fmtShortDate(e.date)}</span>
              {e.note && <span className="g-entry-note">· {e.note}</span>}
              <button type="button" className="g-entry-del" onClick={() => setConfirmEntry(e)} aria-label="מחק הזנה">
                <X size={13} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmEntry}
        onClose={() => setConfirmEntry(null)}
        title="מחיקת הזנה"
        danger
        confirmLabel="מחק"
        message={confirmEntry ? `למחוק את ההזנה (${formatGoalValue(confirmEntry.value, cat)} · ${fmtShortDate(confirmEntry.date)})?` : ''}
        onConfirm={() => { if (confirmEntry) return onDeleteEntry?.(confirmEntry.id) }}
      />
    </div>
  )
}

export default memo(GoalCard)

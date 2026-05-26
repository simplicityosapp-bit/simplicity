import { useState } from 'react'
import { Star, Plus, X, ChevronDown, Pencil } from 'lucide-react'
import { formatGoalValue, timeFrameLabel } from '../../lib/goals'
import { fmtShortDate } from '../../lib/dates'

export default function GoalCard({ scored, index, entries = [], onAddEntry, onDeleteEntry, onEdit }) {
  const { goal, cat, actual, target, pure } = scored
  const capped = Math.max(0, Math.min(pure, 100))
  const importance = goal.importance || 3
  const isManual = cat.measurement_type === 'manual'
  const [showHistory, setShowHistory] = useState(false)

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
        <p className={`g-card-pct${pure >= 100 ? ' over' : ''}`}>
          {Math.min(pure, 100)}%{pure > 100 ? '+' : ''}
        </p>
      </div>

      <div className="g-progress">
        <div className={`g-progress-fill${pure >= 100 ? ' over' : ''}`} style={{ width: `${capped}%` }} />
      </div>

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
              <button type="button" className="g-entry-del" onClick={() => onDeleteEntry?.(e.id)} aria-label="מחק הזנה">
                <X size={13} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

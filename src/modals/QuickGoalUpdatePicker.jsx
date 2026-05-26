import Modal from './Modal'

/* Pick a manual goal category to quickly log an entry for. Only categories
   that have at least one live goal are shown — otherwise there's nothing to
   update. The empty state is a soft nudge toward the goals screen. */
export default function QuickGoalUpdatePicker({ open, onClose, categories = [], goals = [], onPick }) {
  const goalCatIds = new Set(goals.filter((g) => !g.deleted_at).map((g) => g.category_id))
  const choices = categories.filter(
    (c) => c.measurement_type === 'manual' && goalCatIds.has(c.id),
  )

  return (
    <Modal open={open} onClose={onClose} title="עדכון יעד">
      {choices.length === 0 ? (
        <p className="m-sub" style={{ color: 'var(--stone)' }}>אין יעדים ידניים פעילים לעדכון.</p>
      ) : (
        <div className="g-welcome-actions">
          {choices.map((c) => (
            <button key={c.id} type="button" className="g-preset" onClick={() => { onPick(c); onClose() }}>
              <span className="g-preset-ic">{c.icon || '⭐'}</span>
              <span className="g-preset-name">{c.name}</span>
              <span className="g-preset-hint">להזין התקדמות</span>
            </button>
          ))}
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}

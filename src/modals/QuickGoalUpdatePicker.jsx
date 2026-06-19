import Modal from './Modal'
import { useT } from '../i18n/useT'

/* Pick a manual goal category to quickly log an entry for. Only categories
   that have at least one live goal are shown — otherwise there's nothing to
   update. The empty state is a soft nudge toward the goals screen. */
export default function QuickGoalUpdatePicker({ open, onClose, categories = [], goals = [], onPick }) {
  const { t } = useT('modalsData')
  const goalCatIds = new Set(goals.filter((g) => !g.deleted_at).map((g) => g.category_id))
  const choices = categories.filter(
    (c) => c.measurement_type === 'manual' && goalCatIds.has(c.id),
  )

  return (
    <Modal open={open} onClose={onClose} title={t('quickUpdate.title')}>
      {choices.length === 0 ? (
        <p className="m-sub" style={{ color: 'var(--stone)' }}>{t('quickUpdate.empty')}</p>
      ) : (
        <div className="g-welcome-actions">
          {choices.map((c) => {
            /* Surface the goal name(s) under this category — "category · goal"
               (e.g. "אישי · ריצה"). Entries are still logged per-category, but
               the user thinks in goals, so the goal label is what they recognize.
               Goals without an explicit label fall back to just the category. */
            const goalNames = goals
              .filter((g) => !g.deleted_at && g.category_id === c.id && g.label)
              .map((g) => g.label)
            const name = goalNames.length ? `${c.name} · ${goalNames.join(', ')}` : c.name
            return (
              <button key={c.id} type="button" className="g-preset" onClick={() => { onPick(c); onClose() }}>
                <span className="g-preset-ic">{c.icon || '⭐'}</span>
                <span className="g-preset-name">{name}</span>
                <span className="g-preset-hint">{t('quickUpdate.logProgress')}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('quickUpdate.close')}</button>
      </div>
    </Modal>
  )
}

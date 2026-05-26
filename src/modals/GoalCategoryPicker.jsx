import { Plus } from 'lucide-react'
import Modal from './Modal'
import { CATEGORY_PRESETS } from '../lib/goalPresets'

/* Pick a category to add: available presets (not already added) + custom.
   onAddPreset(preset) inserts directly; onAddCustom opens the custom modal. */
export default function GoalCategoryPicker({ open, onClose, categories = [], onAddPreset, onAddCustom }) {
  const taken = new Set(categories.map((c) => c.data_source).filter(Boolean))
  const available = CATEGORY_PRESETS.filter((p) => !taken.has(p.data_source))

  return (
    <Modal open={open} onClose={onClose} title="הוספת קטגוריה">
      <div className="g-welcome-actions">
        {available.map((p) => (
          <button key={p.key} type="button" className="g-preset" onClick={() => { onAddPreset(p); onClose() }}>
            <span className="g-preset-ic">{p.icon}</span>
            <span className="g-preset-name">{p.name}</span>
            <span className="g-preset-hint">{p.hint}</span>
          </button>
        ))}
        <button type="button" className="g-preset custom" onClick={() => { onClose(); onAddCustom() }}>
          <span className="g-preset-ic"><Plus size={18} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="g-preset-name">קטגוריה משלי</span>
          <span className="g-preset-hint">שם, אייקון וצבע</span>
        </button>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'

const COLORS = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const ICONS = ['💰', '🤝', '🌱', '✨', '🎨', '🏃', '📚', '🧘', '✍️', '💡', '⭐']

/* Edit a category's name / icon / color (cosmetic, safe for both auto and
   manual). Measurement type / data source aren't editable — they're fixed by
   the preset. Delete removes the category (and its goals, handled by caller).
   The parent passes key={category.id} so this remounts per category. */
export default function EditGoalCategoryModal({ open, onClose, category, onSave, onDelete }) {
  const { tryAgain } = useAddress()
  const [form, setForm] = useState(() => ({
    name: category?.name || '',
    icon: category?.icon || ICONS[0],
    color: category?.color || COLORS[0],
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!category) return <Modal open={open} onClose={onClose} title="עריכת מדד" />

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש למלא שם.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(category.id, { name: form.name.trim(), icon: form.icon, color: form.color })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  const icons = category.icon && !ICONS.includes(category.icon) ? [category.icon, ...ICONS] : ICONS

  return (
    <Modal open={open} onClose={onClose} title="עריכת מדד">
      <div className="m-field">
        <label className="m-label">שם המדד</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder="שם המדד"
        />
      </div>
      <div className="m-field">
        <label className="m-label">אייקון</label>
        <div className="m-pills">
          {icons.map((ic) => (
            <button key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">צבע</label>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`m-color${form.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => set('color', c)} />
          ))}
        </div>
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
      <button type="button" className="m-btn-delete" onClick={() => onDelete(category)}>
        <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> מחיקת המדד
      </button>
    </Modal>
  )
}

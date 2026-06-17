import { useState } from 'react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'

const ICONS = ['🎨', '🏃', '📚', '🧘', '✍️', '🌱', '💡', '⭐']
const blank = () => ({ name: '', icon: ICONS[0], color: COLORS[0] })

/* Custom (manual) goal category — name + icon + color. Auto categories (income
   etc.) are added as one-tap presets, not here. graph_type defaults to 'delta'. */
export default function AddGoalCategoryModal({ open, onClose, onSave }) {
  const { tryAgain } = useAddress()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש למלא שם.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        key: null,
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        measurement_type: 'manual',
        data_source: null,
        graph_type: 'delta',
        builtin: false,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  return (
    <Modal open={open} onClose={close} title="מדד חדש">
      <div className="m-field">
        <label className="m-label">שם המדד</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder="לדוגמה: יצירת תוכן"
        />
      </div>
      <div className="m-field">
        <label className="m-label">אייקון</label>
        <div className="m-pills">
          {ICONS.map((ic) => (
            <button key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">צבע</label>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`m-color${form.color === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}

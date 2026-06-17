import { useState } from 'react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'

/* Edit a project — name + color. */
export default function EditProjectModal({ open, onClose, onSave, project }) {
  const { tryAgain } = useAddress()
  const [form, setForm] = useState(() => ({
    name: project?.name || '',
    color: project?.color || COLORS[0],
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!project) return <Modal open={open} onClose={onClose} title="עריכת פרויקט" />

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש למלא שם.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(project.id, { name: form.name.trim(), color: form.color })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="עריכת פרויקט">
      <div className="m-field">
        <label className="m-label">שם הפרויקט</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (err) setErr('') }}
        />
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
              onClick={() => setForm((f) => ({ ...f, color: c }))}
            />
          ))}
        </div>
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}

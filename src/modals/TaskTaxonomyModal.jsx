import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from './Modal'

const COLORS = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
/* Statuses roll up to one of two fixed meta buckets so the binary
   open/done counters across the app keep working. */
const META = [
  { key: 'open', label: 'פתוחות' },
  { key: 'done', label: 'הושלמו' },
]

/* Manage custom task statuses (grouped by open/done meta) and custom task
   categories. CRUD ties to useTaskStatuses / useTaskCategories via the
   parent; deletes carry undo, so there's no extra confirm here. */
export default function TaskTaxonomyModal({
  open, onClose,
  statuses = [], categories = [],
  onAddStatus, onRemoveStatus,
  onAddCategory, onRemoveCategory,
}) {
  const [sName, setSName] = useState('')
  const [sMeta, setSMeta] = useState('open')
  const [sColor, setSColor] = useState(COLORS[0])
  const [cName, setCName] = useState('')
  const [cColor, setCColor] = useState(COLORS[3])
  const [busy, setBusy] = useState(false)

  const addStatus = async () => {
    const name = sName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await onAddStatus({ display_name: name, meta_category: sMeta, color: sColor, icon: null, is_default: false })
      setSName('')
    } finally { setBusy(false) }
  }

  const addCategory = async () => {
    const name = cName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await onAddCategory({ name, color: cColor })
      setCName('')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="סטטוסים וקטגוריות">
      {/* ── Statuses ───────────────────────────────────────────── */}
      <p className="m-section-title">סטטוסים</p>
      <p className="m-hint">כל סטטוס משויך ל"פתוחות" או "הושלמו" — כך הספירות בבית נשארות נכונות.</p>
      {META.map((m) => {
        const list = statuses.filter((s) => s.meta_category === m.key)
        return (
          <div key={m.key} className="m-field">
            <label className="m-label">{m.label}</label>
            {list.length === 0 ? (
              <p className="m-hint">—</p>
            ) : (
              <div className="m-tax-chips">
                {list.map((s) => (
                  <span key={s.id} className="m-tax-chip">
                    <span className="m-tax-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <span>{s.display_name}</span>
                    <button type="button" className="m-tax-x" onClick={() => onRemoveStatus(s.id)} aria-label={`מחיקת ${s.display_name}`} title="מחיקה">
                      <X size={11} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <div className="m-field">
        <label className="m-label">סטטוס חדש</label>
        <div className="m-pills">
          {META.map((m) => (
            <button key={m.key} type="button" className={`m-pill${sMeta === m.key ? ' on' : ''}`} onClick={() => setSMeta(m.key)}>{m.label}</button>
          ))}
        </div>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`m-color${sColor === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setSColor(c)} />
          ))}
        </div>
        <div className="m-tax-add">
          <input
            className="m-input"
            value={sName}
            onChange={(e) => setSName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }}
            placeholder="לדוגמה: בתהליך"
          />
          <button type="button" className="m-tax-add-btn" onClick={addStatus} disabled={!sName.trim() || busy} aria-label="הוספת סטטוס">
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Categories ─────────────────────────────────────────── */}
      <p className="m-section-title">קטגוריות</p>
      {categories.length === 0 ? (
        <p className="m-hint">—</p>
      ) : (
        <div className="m-tax-chips">
          {categories.map((c) => (
            <span key={c.id} className="m-tax-chip">
              <span className="m-tax-dot" style={{ background: c.color || 'var(--stone)' }} />
              <span>{c.name}</span>
              <button type="button" className="m-tax-x" onClick={() => onRemoveCategory(c.id)} aria-label={`מחיקת ${c.name}`} title="מחיקה">
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="m-field">
        <label className="m-label">קטגוריה חדשה</label>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`m-color${cColor === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setCColor(c)} />
          ))}
        </div>
        <div className="m-tax-add">
          <input
            className="m-input"
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
            placeholder="לדוגמה: שיווק"
          />
          <button type="button" className="m-tax-add-btn" onClick={addCategory} disabled={!cName.trim() || busy} aria-label="הוספת קטגוריה">
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="m-actions">
        <button type="button" className="m-btn-save" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import ConfirmModal from '../../modals/ConfirmModal'

/* Inline categories manager — ported from the prototype's
   f-cat-list / f-cat-inp / f-cat-colors block. Chip list of
   existing categories + add form (name + colour picker). Click
   the X on a chip to soft-delete it (parent handles the call). */
export default function CategoriesSection({ categories, onAdd, onDelete }) {
  const [name, setName] = useState('')
  const [colorIdx, setColorIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null) // category awaiting delete confirm
  const live = categories.filter((c) => !c.deleted_at)

  const submit = async () => {
    const v = name.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await onAdd({ name: v, color: CATEGORY_COLORS[colorIdx] })
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cat-section">
      <div className="cat-section-head">
        <span className="cat-section-title">
          <Tag size={15} strokeWidth={1.5} aria-hidden="true" />
          קטגוריות הוצאות
          {live.length > 0 && <span className="cat-section-count mono">{live.length}</span>}
        </span>
      </div>

      {live.length === 0 ? (
        <p className="cat-section-empty">אין קטגוריות עדיין. הוסף/י קטגוריה כדי לתייג הוצאות (מנויים, ייעוץ, וכו׳).</p>
      ) : (
        <div className="cat-chips">
          {live.map((c) => (
            <span key={c.id} className="cat-chip">
              <span className="cat-chip-dot" style={{ background: c.color || 'var(--stone)' }} />
              <span className="cat-chip-name">{c.name}</span>
              <button
                type="button"
                className="cat-chip-x"
                onClick={() => setConfirm(c)}
                aria-label={`מחק ${c.name}`}
                title="מחיקה"
              >
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="cat-add-row">
        <input
          className="cat-add-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="שם קטגוריה"
        />
        <div className="cat-color-picker" role="radiogroup" aria-label="צבע קטגוריה">
          {CATEGORY_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`cat-color-dot${i === colorIdx ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColorIdx(i)}
              role="radio"
              aria-checked={i === colorIdx}
              aria-label={`צבע ${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="cat-add-btn"
          onClick={submit}
          disabled={!name.trim() || busy}
        >
          הוסף
        </button>
      </div>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="מחיקת קטגוריה"
        danger
        confirmLabel="מחק"
        message={confirm ? `למחוק את "${confirm.name}"? הוצאות שמשויכות אליה יישארו ללא קטגוריה.` : ''}
        onConfirm={() => { if (confirm) return onDelete(confirm) }}
      />
    </section>
  )
}

import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { useT } from '../../i18n/useT'
import ConfirmModal from '../../modals/ConfirmModal'

/* Inline categories manager — ported from the prototype's
   f-cat-list / f-cat-inp / f-cat-colors block. Chip list of
   existing categories + add form (name + colour picker). Click
   the X on a chip to soft-delete it (parent handles the call). */
export default function CategoriesSection({ categories, onAdd, onDelete }) {
  const { t } = useT('finance')
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
          {t('categories.title')}
          {live.length > 0 && <span className="cat-section-count mono">{live.length}</span>}
        </span>
      </div>

      {live.length === 0 ? (
        <p className="cat-section-empty">{t('categories.empty')}</p>
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
                aria-label={t('categories.deleteChipAria', { name: c.name })}
                title={t('categories.deleteAria')}
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
          placeholder={t('categories.namePlaceholder')}
        />
        <div className="cat-color-picker" role="radiogroup" aria-label={t('categories.colorGroupAria')}>
          {CATEGORY_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`cat-color-dot${i === colorIdx ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColorIdx(i)}
              role="radio"
              aria-checked={i === colorIdx}
              aria-label={t('categories.colorAria', { number: i + 1 })}
            />
          ))}
        </div>
        <button
          type="button"
          className="cat-add-btn"
          onClick={submit}
          disabled={!name.trim() || busy}
        >
          {t('categories.add')}
        </button>
      </div>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('categories.deleteTitle')}
        danger
        confirmLabel={t('categories.deleteConfirm')}
        message={confirm ? t('categories.deleteMessage', { name: confirm.name }) : ''}
        onConfirm={() => { if (confirm) return onDelete(confirm) }}
      />
    </section>
  )
}

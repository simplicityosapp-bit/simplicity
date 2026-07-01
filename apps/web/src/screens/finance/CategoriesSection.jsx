import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { useT } from '../../i18n/useT'
import ConfirmModal from '../../modals/ConfirmModal'
import { Box, Txt, Btn, Input } from '../../components/ui'

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
    <Box as="section" className="cat-section">
      <Box className="cat-section-head">
        <Txt className="cat-section-title">
          <Tag size={15} strokeWidth={1.5} aria-hidden="true" />
          {t('categories.title')}
          {live.length > 0 && <Txt className="cat-section-count mono">{live.length}</Txt>}
        </Txt>
      </Box>

      {live.length === 0 ? (
        <Txt as="p" className="cat-section-empty">{t('categories.empty')}</Txt>
      ) : (
        <Box className="cat-chips">
          {live.map((c) => (
            <Txt key={c.id} className="cat-chip">
              <Txt className="cat-chip-dot" style={{ background: c.color || 'var(--stone)' }} />
              <Txt className="cat-chip-name">{c.name}</Txt>
              <Btn
                type="button"
                className="cat-chip-x"
                onClick={() => setConfirm(c)}
                aria-label={t('categories.deleteChipAria', { name: c.name })}
                title={t('categories.deleteAria')}
              >
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </Txt>
          ))}
        </Box>
      )}

      <Box className="cat-add-row">
        <Input
          className="cat-add-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={t('categories.namePlaceholder')}
        />
        <Box className="cat-color-picker" role="radiogroup" aria-label={t('categories.colorGroupAria')}>
          {CATEGORY_COLORS.map((c, i) => (
            <Btn
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
        </Box>
        <Btn
          type="button"
          className="cat-add-btn"
          onClick={submit}
          disabled={!name.trim() || busy}
        >
          {t('categories.add')}
        </Btn>
      </Box>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('categories.deleteTitle')}
        danger
        confirmLabel={t('categories.deleteConfirm')}
        message={confirm ? t('categories.deleteMessage', { name: confirm.name }) : ''}
        onConfirm={() => { if (confirm) return onDelete(confirm) }}
      />
    </Box>
  )
}

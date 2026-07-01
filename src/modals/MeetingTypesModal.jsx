import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useMeetingTypes } from '../hooks/useMeetingTypes'
import { useT } from '../i18n/useT'
import './MeetingTypesModal.css'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   MeetingTypesManager — the add / rename / re-price / delete list for
   a user's meeting types. Reused inside MeetingTypesModal (opened from
   the client form) AND inline in Settings. Owns its own data via
   useMeetingTypes; calls onChanged after a price edit so a parent that
   holds clients can refetch (live price propagation already wrote to
   the DB inside the hook). */
export function MeetingTypesManager({ onChanged }) {
  const { t } = useT('modalsClient')
  const { types, loading, error, addType, updateType, removeType } = useMeetingTypes()
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [addErr, setAddErr] = useState(null)

  const submitNew = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await addType({ name, default_price: newPrice === '' ? null : Math.max(0, Number(newPrice) || 0) })
      setNewName(''); setNewPrice(''); setAddErr(null)
    } catch (e) {
      setAddErr(e?.message || t('meetingTypes.addFailed'))
    }
  }

  const saveRow = async (type, patch) => {
    try { await updateType(type.id, patch, onChanged) } catch { /* hook surfaces error */ }
  }

  return (
    <Box className="mt-mng">
      {loading ? (
        <Txt as="p" className="set-sub-empty">{t('common.loading')}</Txt>
      ) : error ? (
        <Txt as="p" className="set-sub-empty" style={{ color: 'var(--clay)' }}>{error}</Txt>
      ) : types.length === 0 ? (
        <Txt as="p" className="set-sub-empty">{t('meetingTypes.empty')}</Txt>
      ) : (
        types.map((type) => (
          <MeetingTypeRow key={type.id} type={type} onSave={saveRow} onDelete={() => removeType(type.id)} />
        ))
      )}

      <Box className="mt-add">
        <Input
          className="m-input mt-add-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('meetingTypes.namePlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') submitNew() }}
        />
        <Input
          type="number"
          min="0"
          className="m-input mt-add-price"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          placeholder={t('meetingTypes.pricePlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') submitNew() }}
        />
        <Btn type="button" className="set-q-add" onClick={submitNew} disabled={!newName.trim()} aria-label={t('meetingTypes.add')}>
          <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
        </Btn>
      </Box>
      <Txt as="p" className="m-hint">{t('meetingTypes.priceHint')}</Txt>
      {addErr && <Txt as="p" className="set-sub-empty" style={{ color: 'var(--clay)' }}>{addErr}</Txt>}
    </Box>
  )
}

/* One editable row — name + default price, both saved on blur (only when
   the value actually changed, so we never fire a needless update/propagation). */
function MeetingTypeRow({ type, onSave, onDelete }) {
  const { t } = useT('modalsClient')
  const [name, setName] = useState(type.name)
  const [price, setPrice] = useState(type.default_price != null ? String(type.default_price) : '')

  const commitName = () => {
    const v = name.trim()
    if (!v || v === type.name) { setName(type.name); return }
    onSave(type, { name: v })
  }
  const commitPrice = () => {
    const next = price === '' ? null : Math.max(0, Number(price) || 0)
    const cur = type.default_price != null ? Number(type.default_price) : null
    if (next === cur) return
    onSave(type, { default_price: next })
  }

  return (
    <Box className="mt-row">
      <Input
        className="m-input mt-row-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        aria-label={t('meetingTypes.nameAria')}
      />
      <Input
        type="number"
        min="0"
        className="m-input mt-row-price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={commitPrice}
        placeholder={t('meetingTypes.noPrice')}
        aria-label={t('meetingTypes.priceAria')}
      />
      <Btn type="button" className="set-q-del" onClick={onDelete} aria-label={t('meetingTypes.deleteAria')}>
        <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
      </Btn>
    </Box>
  )
}

/* Modal wrapper — opened from the client form's "manage types" link. The
   parent passes onClose; it should refetch its own meeting-types list there
   so a freshly-added type appears in the client's select. */
export default function MeetingTypesModal({ open, onClose, onChanged }) {
  const { t } = useT('modalsClient')
  return (
    <Modal open={open} onClose={onClose} title={t('meetingTypes.title')}>
      <MeetingTypesManager onChanged={onChanged} />
      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('common.done')}</Btn>
      </Box>
    </Modal>
  )
}

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Statuses roll up to one of two fixed meta buckets so the binary
   open/done counters across the app keep working. */
const META = [
  { key: 'open', label: 'metaOpen' },
  { key: 'done', label: 'metaDone' },
]

/* Manage custom task statuses (grouped by open/done meta) and custom task
   categories. CRUD ties to useTaskStatuses / useTaskCategories via the
   parent. Deleting a status/category un-tags every task using it, so it
   asks to confirm first (undo is still offered after). */
export default function TaskTaxonomyModal({
  open, onClose,
  statuses = [], categories = [],
  onAddStatus, onRemoveStatus,
  onAddCategory, onRemoveCategory,
}) {
  const { t } = useT('modalsTask')
  const [sName, setSName] = useState('')
  const [sMeta, setSMeta] = useState('open')
  const [sColor, setSColor] = useState(COLORS[0])
  const [cName, setCName] = useState('')
  const [cColor, setCColor] = useState(COLORS[3])
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null) // { kind: 'status'|'category', id, name }

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
    <Modal open={open} onClose={onClose} title={t('taxonomy.title')}>
      {/* ── Statuses ───────────────────────────────────────────── */}
      {/* The "add" form sits first; the existing pills are listed BELOW it. */}
      <Txt as="p" className="m-section-title">{t('taxonomy.statuses')}</Txt>
      <Txt as="p" className="m-hint">{t('taxonomy.statusesHint')}</Txt>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('taxonomy.newStatus')}</Box>
        <Box className="m-pills">
          {META.map((m) => (
            <Btn key={m.key} type="button" className={`m-pill${sMeta === m.key ? ' on' : ''}`} onClick={() => setSMeta(m.key)}>{t(`taxonomy.${m.label}`)}</Btn>
          ))}
        </Box>
        <Box className="m-colors">
          {COLORS.map((c) => (
            <Btn key={c} type="button" className={`m-color${sColor === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setSColor(c)} />
          ))}
        </Box>
        <Box className="m-tax-add">
          <Input
            className="m-input"
            value={sName}
            onChange={(e) => setSName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }}
            placeholder={t('taxonomy.statusPlaceholder')}
          />
          <Btn type="button" className="m-tax-add-btn" onClick={addStatus} disabled={!sName.trim() || busy} aria-label={t('taxonomy.addStatusAria')}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>
      </Box>
      {META.map((m) => {
        const list = statuses.filter((s) => s.meta_category === m.key)
        return (
          <Box key={m.key} className="m-field">
            <Box as="label" className="m-label">{t(`taxonomy.${m.label}`)}</Box>
            {list.length === 0 ? (
              <Txt as="p" className="m-hint">—</Txt>
            ) : (
              <Box className="m-tax-chips">
                {list.map((s) => (
                  <Txt key={s.id} className="m-tax-chip">
                    <Txt className="m-tax-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <Txt>{s.display_name}</Txt>
                    <Btn type="button" className="m-tax-x" onClick={() => setConfirm({ kind: 'status', id: s.id, name: s.display_name })} aria-label={t('taxonomy.deleteAria', { name: s.display_name })} title={t('taxonomy.deleteHint')}>
                      <X size={11} strokeWidth={2} aria-hidden="true" />
                    </Btn>
                  </Txt>
                ))}
              </Box>
            )}
          </Box>
        )
      })}

      {/* ── Categories ─────────────────────────────────────────── */}
      {/* The "add" form sits first; the existing pills are listed BELOW it. */}
      <Txt as="p" className="m-section-title">{t('taxonomy.categories')}</Txt>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('taxonomy.newCategory')}</Box>
        <Box className="m-colors">
          {COLORS.map((c) => (
            <Btn key={c} type="button" className={`m-color${cColor === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setCColor(c)} />
          ))}
        </Box>
        <Box className="m-tax-add">
          <Input
            className="m-input"
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
            placeholder={t('taxonomy.categoryPlaceholder')}
          />
          <Btn type="button" className="m-tax-add-btn" onClick={addCategory} disabled={!cName.trim() || busy} aria-label={t('taxonomy.addCategoryAria')}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>
      </Box>
      {categories.length === 0 ? (
        <Txt as="p" className="m-hint">—</Txt>
      ) : (
        <Box className="m-tax-chips">
          {categories.map((c) => (
            <Txt key={c.id} className="m-tax-chip">
              <Txt className="m-tax-dot" style={{ background: c.color || 'var(--stone)' }} />
              <Txt>{c.name}</Txt>
              <Btn type="button" className="m-tax-x" onClick={() => setConfirm({ kind: 'category', id: c.id, name: c.name })} aria-label={t('taxonomy.deleteAria', { name: c.name })} title={t('taxonomy.deleteHint')}>
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </Txt>
          ))}
        </Box>
      )}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</Btn>
      </Box>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('taxonomy.deleteTitle')}
        danger
        confirmLabel={t('taxonomy.deleteConfirm')}
        message={confirm ? (confirm.kind === 'status' ? t('taxonomy.deleteMessageStatus', { name: confirm.name }) : t('taxonomy.deleteMessageCategory', { name: confirm.name })) : ''}
        onConfirm={() => { if (confirm) return (confirm.kind === 'status' ? onRemoveStatus : onRemoveCategory)(confirm.id) }}
      />
    </Modal>
  )
}

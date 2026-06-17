import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { useT } from '../i18n/useT'

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
      <p className="m-section-title">{t('taxonomy.statuses')}</p>
      <p className="m-hint">{t('taxonomy.statusesHint')}</p>
      {META.map((m) => {
        const list = statuses.filter((s) => s.meta_category === m.key)
        return (
          <div key={m.key} className="m-field">
            <label className="m-label">{t(`taxonomy.${m.label}`)}</label>
            {list.length === 0 ? (
              <p className="m-hint">—</p>
            ) : (
              <div className="m-tax-chips">
                {list.map((s) => (
                  <span key={s.id} className="m-tax-chip">
                    <span className="m-tax-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <span>{s.display_name}</span>
                    <button type="button" className="m-tax-x" onClick={() => setConfirm({ kind: 'status', id: s.id, name: s.display_name })} aria-label={t('taxonomy.deleteAria', { name: s.display_name })} title={t('taxonomy.deleteHint')}>
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
        <label className="m-label">{t('taxonomy.newStatus')}</label>
        <div className="m-pills">
          {META.map((m) => (
            <button key={m.key} type="button" className={`m-pill${sMeta === m.key ? ' on' : ''}`} onClick={() => setSMeta(m.key)}>{t(`taxonomy.${m.label}`)}</button>
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
            placeholder={t('taxonomy.statusPlaceholder')}
          />
          <button type="button" className="m-tax-add-btn" onClick={addStatus} disabled={!sName.trim() || busy} aria-label={t('taxonomy.addStatusAria')}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Categories ─────────────────────────────────────────── */}
      <p className="m-section-title">{t('taxonomy.categories')}</p>
      {categories.length === 0 ? (
        <p className="m-hint">—</p>
      ) : (
        <div className="m-tax-chips">
          {categories.map((c) => (
            <span key={c.id} className="m-tax-chip">
              <span className="m-tax-dot" style={{ background: c.color || 'var(--stone)' }} />
              <span>{c.name}</span>
              <button type="button" className="m-tax-x" onClick={() => setConfirm({ kind: 'category', id: c.id, name: c.name })} aria-label={t('taxonomy.deleteAria', { name: c.name })} title={t('taxonomy.deleteHint')}>
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="m-field">
        <label className="m-label">{t('taxonomy.newCategory')}</label>
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
            placeholder={t('taxonomy.categoryPlaceholder')}
          />
          <button type="button" className="m-tax-add-btn" onClick={addCategory} disabled={!cName.trim() || busy} aria-label={t('taxonomy.addCategoryAria')}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="m-actions">
        <button type="button" className="m-btn-save" onClick={onClose}>{t('common.close')}</button>
      </div>

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

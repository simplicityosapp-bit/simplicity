import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { CATEGORY_COLORS } from '../lib/api/categories'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Dedicated editor for lead sources (name + colour). CRUD ties to
   useLeadSources via the parent. Deleting a source asks to confirm first;
   the hook still queues an undo afterwards. */
export default function LeadSourcesModal({ open, onClose, sources = [], onAdd, onRemove }) {
  const { t } = useT('leads')
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [confirm, setConfirm] = useState(null) // { id, name }

  const add = async () => {
    const v = name.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await onAdd({ name: v, color })
      setName('')
      setErr(null)
    } catch (e) {
      setErr(e?.message || t('sourcesModal.addFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('sourcesModal.title')}>
      <Txt as="p" className="m-hint">{t('sourcesModal.hint')}</Txt>

      {sources.length === 0 ? (
        <Txt as="p" className="m-hint">{t('sourcesModal.empty')}</Txt>
      ) : (
        <Box className="m-tax-chips">
          {sources.map((s) => (
            <Txt key={s.id} className="m-tax-chip">
              <Txt className="m-tax-dot" style={{ background: s.color || 'var(--stone)' }} />
              <Txt>{s.name}</Txt>
              <Btn
                type="button"
                className="m-tax-x"
                onClick={() => setConfirm({ id: s.id, name: s.name })}
                aria-label={t('sourcesModal.deleteAria', { name: s.name })}
                title={t('sourcesModal.deleteHint')}
              >
                <X size={11} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </Txt>
          ))}
        </Box>
      )}

      <Box className="m-field">
        <Box as="label" className="m-label">{t('sourcesModal.newSource')}</Box>
        <Box className="m-colors">
          {CATEGORY_COLORS.map((c) => (
            <Btn
              key={c}
              type="button"
              className={`m-color${color === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => setColor(c)}
            />
          ))}
        </Box>
        <Box className="m-tax-add">
          <Input
            className="m-input"
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('sourcesModal.placeholder')}
          />
          <Btn
            type="button"
            className="m-tax-add-btn"
            onClick={add}
            disabled={!name.trim() || busy}
            aria-label={t('sourcesModal.addAria')}
          >
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>
        {err && <Txt as="p" className="m-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
      </Box>

      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('sourcesModal.close')}</Btn>
      </Box>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('sourcesModal.deleteTitle')}
        danger
        confirmLabel={t('sourcesModal.deleteConfirm')}
        message={confirm ? t('sourcesModal.deleteMessage', { name: confirm.name }) : ''}
        onConfirm={() => { if (confirm) return onRemove(confirm.id) }}
      />
    </Modal>
  )
}

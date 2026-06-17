import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import './QuoteSourceModal.css'

/* Quote source picker + personal pool manager (beta request 03/06/2026).
   Source ('system' | 'personal') persists under prefs.quoteSource; the
   personal list lives in the user_quotes table (migration 0013). The
   personal list is editable from here regardless of the active source,
   so the user can prepare quotes before switching over. */
const SOURCES = [
  { k: 'system', tk: 'sourceSystem' },
  { k: 'personal', tk: 'sourcePersonal' },
]

export default function QuoteSourceModal({
  open, onClose,
  source, onChangeSource,
  userQuotes = [], onAdd, onRemove,
}) {
  const { t } = useT('modalsSystem')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const clean = text.trim()
    if (!clean) { setErr(t('quoteSource.writeFirst')); return }
    setBusy(true)
    setErr('')
    try {
      await onAdd({ text: clean, author: null })
      setText('')
    } catch (e) {
      setErr(t('quoteSource.saveFailed', { error: e.message || t('quoteSource.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('quoteSource.title')}>
      <div className="m-field">
        <label className="m-label">{t('quoteSource.pickLabel')}</label>
        <div className="m-pills">
          {SOURCES.map((s) => (
            <button
              key={s.k}
              type="button"
              className={`m-pill${source === s.k ? ' on' : ''}`}
              onClick={() => onChangeSource(s.k)}
            >
              {t(`quoteSource.${s.tk}`)}
            </button>
          ))}
        </div>
        {source === 'personal' && userQuotes.length === 0 && (
          <p className="qsm-hint">{t('quoteSource.emptyPersonal')}</p>
        )}
      </div>

      <div className="m-field">
        <label className="m-label">{t('quoteSource.addLabel')}</label>
        <div className="qsm-add">
          <input
            className="m-input"
            value={text}
            onChange={(e) => { setText(e.target.value); if (err) setErr('') }}
            placeholder={t('quoteSource.addPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          <button type="button" className="qsm-add-btn" onClick={submit} disabled={busy} aria-label={t('quoteSource.addAria')}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {userQuotes.length > 0 && (
        <div className="m-field">
          <label className="m-label">{t('quoteSource.myQuotes', { count: userQuotes.length })}</label>
          <div className="qsm-list">
            {userQuotes.map((q) => (
              <div key={q.id} className="qsm-row">
                <p className="qsm-row-text">{q.text}</p>
                <button type="button" className="qsm-row-del" onClick={() => onRemove(q.id)} aria-label={t('quoteSource.removeAria')}>
                  <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="m-error">{err}</p>}
    </Modal>
  )
}

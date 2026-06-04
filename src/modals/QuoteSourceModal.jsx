import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import Modal from './Modal'
import './QuoteSourceModal.css'

/* Quote source picker + personal pool manager (beta request 03/06/2026).
   Source ('system' | 'personal') persists under prefs.quoteSource; the
   personal list lives in the user_quotes table (migration 0013). The
   personal list is editable from here regardless of the active source,
   so the user can prepare quotes before switching over. */
const SOURCES = [
  { k: 'system', l: 'של המערכת' },
  { k: 'personal', l: 'שלי' },
]

export default function QuoteSourceModal({
  open, onClose,
  source, onChangeSource,
  userQuotes = [], onAdd, onRemove,
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const clean = text.trim()
    if (!clean) { setErr('כתבו ציטוט קודם.'); return }
    setBusy(true)
    setErr('')
    try {
      await onAdd({ text: clean, author: null })
      setText('')
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסו שוב'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ציטוטים">
      <div className="m-field">
        <label className="m-label">מאיפה לבחור את הציטוט היומי?</label>
        <div className="m-pills">
          {SOURCES.map((s) => (
            <button
              key={s.k}
              type="button"
              className={`m-pill${source === s.k ? ' on' : ''}`}
              onClick={() => onChangeSource(s.k)}
            >
              {s.l}
            </button>
          ))}
        </div>
        {source === 'personal' && userQuotes.length === 0 && (
          <p className="qsm-hint">אין עדיין ציטוטים אישיים — עד שתוסיפו, יוצג ציטוט מהמאגר.</p>
        )}
      </div>

      <div className="m-field">
        <label className="m-label">הוספת ציטוט אישי</label>
        <div className="qsm-add">
          <input
            className="m-input"
            value={text}
            onChange={(e) => { setText(e.target.value); if (err) setErr('') }}
            placeholder="כתבו משפט שמדבר אליכם…"
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          <button type="button" className="qsm-add-btn" onClick={submit} disabled={busy} aria-label="הוספת ציטוט">
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {userQuotes.length > 0 && (
        <div className="m-field">
          <label className="m-label">הציטוטים שלי ({userQuotes.length})</label>
          <div className="qsm-list">
            {userQuotes.map((q) => (
              <div key={q.id} className="qsm-row">
                <p className="qsm-row-text">{q.text}</p>
                <button type="button" className="qsm-row-del" onClick={() => onRemove(q.id)} aria-label="מחיקת ציטוט">
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

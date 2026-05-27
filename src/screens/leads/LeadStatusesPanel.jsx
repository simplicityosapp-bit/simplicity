import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { LEAD_META } from '../../lib/leads'

/* Inline sub-status manager for the leads screen — mirrors what
   Settings already shows, in a more compact chip layout so the user
   can manage taxonomy without leaving the leads context. CRUD ties
   straight to useLeadStatuses via the parent. */
export default function LeadStatusesPanel({ statuses, onAdd, onRemove }) {
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState({})
  const setDraft = (k, v) => setDrafts((d) => ({ ...d, [k]: v }))
  const setBusyFor = (k, v) => setBusy((b) => ({ ...b, [k]: v }))

  const submit = async (meta) => {
    const v = (drafts[meta] || '').trim()
    if (!v || busy[meta]) return
    setBusyFor(meta, true)
    try {
      await onAdd({ meta_category: meta, display_name: v, icon: null, is_default: false })
      setDraft(meta, '')
    } finally {
      setBusyFor(meta, false)
    }
  }

  return (
    <div className="lead-statuses-panel">
      <p className="lead-statuses-intro">
        ניהול תתי-סטטוסים תחת כל קטגוריית-על. תתי-סטטוסים מופיעים כשמסמנים נקודת צבע על כרטיס ליד, ומשמשים לסינון ולגרפים.
      </p>
      {LEAD_META.map((m) => {
        const list = (statuses || []).filter((s) => s.meta_category === m.key)
        return (
          <div key={m.key} className="lead-statuses-group">
            <p className="lead-statuses-meta">{m.title}</p>
            {list.length === 0 ? (
              <p className="lead-statuses-empty">—</p>
            ) : (
              <div className="lead-statuses-chips">
                {list.map((s) => (
                  <span key={s.id} className="lead-statuses-chip">
                    <span className="lead-statuses-chip-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <span>{s.display_name}</span>
                    {!s.is_default && (
                      <button
                        type="button"
                        className="lead-statuses-chip-x"
                        onClick={() => onRemove(s.id)}
                        aria-label={`מחיקת ${s.display_name}`}
                        title="מחיקה"
                      >
                        <X size={11} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="lead-statuses-add">
              <input
                className="m-input"
                value={drafts[m.key] || ''}
                onChange={(e) => setDraft(m.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(m.key) }}
                placeholder={`תת-סטטוס ל"${m.title}"`}
              />
              <button
                type="button"
                className="lead-statuses-add-btn"
                onClick={() => submit(m.key)}
                disabled={!(drafts[m.key] || '').trim() || busy[m.key]}
                aria-label="הוספה"
              >
                <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import { LEAD_META } from '../../lib/leads'
import ConfirmModal from '../../modals/ConfirmModal'

/* Inline sub-status manager for the leads screen — mirrors what
   Settings already shows, in a more compact chip layout so the user
   can manage taxonomy without leaving the leads context. CRUD ties
   straight to useLeadStatuses via the parent. Chips inside a meta group
   can be drag-reordered (persists sort_order via onUpdate). */
export default function LeadStatusesPanel({ statuses, onAdd, onUpdate, onRemove }) {
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState({})
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // the status awaiting delete confirm
  const setDraft = (k, v) => setDrafts((d) => ({ ...d, [k]: v }))
  const setBusyFor = (k, v) => setBusy((b) => ({ ...b, [k]: v }))

  /* Reorder within one meta group: move dragId to target's slot, then
     renumber sort_order (10,20,30…) and persist only what changed. */
  const reorder = (list, fromId, toId) => {
    if (!onUpdate || !fromId || !toId || fromId === toId) return
    const ids = list.map((s) => s.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    next.forEach((s, i) => {
      const so = (i + 1) * 10
      if (s.sort_order !== so) onUpdate(s.id, { sort_order: so })
    })
  }

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
        const list = (statuses || [])
          .filter((s) => s.meta_category === m.key)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        return (
          <div key={m.key} className="lead-statuses-group">
            <p className="lead-statuses-meta">{m.title}</p>
            {list.length === 0 ? (
              <p className="lead-statuses-empty">—</p>
            ) : (
              <div className="lead-statuses-chips">
                {list.map((s) => (
                  <span
                    key={s.id}
                    className={`lead-statuses-chip${dragId === s.id ? ' dragging' : ''}${overId === s.id && dragId && dragId !== s.id ? ' drop-target' : ''}`}
                    draggable
                    onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setDragId(null); setOverId(null) }}
                    onDragOver={(e) => {
                      /* only a valid target within the same meta group */
                      if (dragId && list.some((x) => x.id === dragId)) { e.preventDefault(); if (overId !== s.id) setOverId(s.id) }
                    }}
                    onDrop={(e) => { e.preventDefault(); reorder(list, dragId, s.id); setDragId(null); setOverId(null) }}
                  >
                    <GripVertical size={12} strokeWidth={1.7} aria-hidden="true" className="lead-statuses-chip-grip" />
                    <span className="lead-statuses-chip-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <span>{s.display_name}</span>
                    {!s.is_default && (
                      <button
                        type="button"
                        className="lead-statuses-chip-x"
                        onClick={() => setPendingDelete(s)}
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

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="מחיקת תת-סטטוס"
        message={pendingDelete ? `למחוק את "${pendingDelete.display_name}"? לידים שמסומנים בו יישארו ללא תת-סטטוס.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDelete) onRemove(pendingDelete.id) }}
      />
    </div>
  )
}

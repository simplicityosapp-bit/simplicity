import { useState } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import { LEAD_META, metaTitle } from '../../lib/leads'
import { usePointerDnd } from '../../hooks/usePointerDnd'
import ConfirmModal from '../../modals/ConfirmModal'
import { useT } from '../../i18n/useT'

/* Inline sub-status manager for the leads screen — mirrors what
   Settings already shows, in a more compact chip layout so the user
   can manage taxonomy without leaving the leads context. CRUD ties
   straight to useLeadStatuses via the parent. Chips inside a meta group
   can be drag-reordered (persists sort_order via onUpdate). */
export default function LeadStatusesPanel({ statuses, onAdd, onUpdate, onRemove }) {
  const { t } = useT('leads')
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState({})
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

  /* Drop a chip onto a group's "add" row → move it INTO that meta group,
     appended at the end. This is the "שחרר כאן" target the create row exposes,
     so a status can be dropped at a new position even across groups / into an
     empty group (beta feedback 25/06). Cross-meta only relabels the taxonomy
     chip — leads keep their own status_meta, so they stay in their kanban
     column (no lead data is touched). */
  const moveToMeta = (fromId, meta) => {
    if (!onUpdate || !fromId) return
    const from = (statuses || []).find((s) => s.id === fromId)
    if (!from) return
    const target = (statuses || [])
      .filter((s) => s.meta_category === meta)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    if (from.meta_category === meta) {
      /* same group — just send it to the end (drop past the last chip). */
      if (target.length <= 1) return
      reorder(target, fromId, target[target.length - 1].id)
      return
    }
    const lastSort = target.length ? (target[target.length - 1].sort_order || target.length * 10) : 0
    onUpdate(fromId, { meta_category: meta, sort_order: lastSort + 10 })
  }

  /* Touch+mouse reorder: each chip is both draggable and a drop zone; the
     drop resolves the meta group from the two ids and reorders within it.
     The add row is also a drop zone (id "add:<meta>") for cross-group moves. */
  const dnd = usePointerDnd({
    onDrop: (fromId, toId) => {
      if (!fromId || !toId || fromId === toId) return
      if (typeof toId === 'string' && toId.startsWith('add:')) {
        moveToMeta(fromId, toId.slice(4))
        return
      }
      const from = (statuses || []).find((s) => s.id === fromId)
      const to = (statuses || []).find((s) => s.id === toId)
      if (!from || !to || from.meta_category !== to.meta_category) return
      const list = (statuses || [])
        .filter((s) => s.meta_category === from.meta_category)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      reorder(list, fromId, toId)
    },
  })

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
        {t('statusesPanel.intro')}
      </p>
      {LEAD_META.map((m) => {
        const list = (statuses || [])
          .filter((s) => s.meta_category === m.key)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        return (
          <div key={m.key} className="lead-statuses-group">
            <p className="lead-statuses-meta">{metaTitle(m.key)}</p>
            {list.length === 0 ? (
              <p className="lead-statuses-empty">—</p>
            ) : (
              <div className="lead-statuses-chips">
                {list.map((s) => (
                  <span
                    key={s.id}
                    className={`lead-statuses-chip${dnd.dragId === s.id ? ' dragging' : ''}${dnd.overZone === s.id && dnd.dragId && dnd.dragId !== s.id ? ' drop-target' : ''}`}
                    {...dnd.draggableProps(s.id)}
                    {...dnd.dropZoneProps(s.id)}
                  >
                    <GripVertical size={12} strokeWidth={1.7} aria-hidden="true" className="lead-statuses-chip-grip" />
                    <span className="lead-statuses-chip-dot" style={{ background: s.color || 'var(--stone)' }} />
                    <span>{s.display_name}</span>
                    {!s.is_default && (
                      <button
                        type="button"
                        className="lead-statuses-chip-x"
                        onClick={() => setPendingDelete(s)}
                        aria-label={t('statusesPanel.deleteChipAria', { name: s.display_name })}
                        title={t('statusesPanel.deleteChipTitle')}
                      >
                        <X size={11} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div
              className={`lead-statuses-add${dnd.overZone === `add:${m.key}` && dnd.dragId ? ' drop-target' : ''}`}
              {...dnd.dropZoneProps(`add:${m.key}`)}
            >
              {dnd.dragId ? (
                /* Mid-drag the create row becomes the "drop here" target. */
                <span className="lead-statuses-drop-hint">{t('statusesPanel.dropHere')}</span>
              ) : (
                <>
                  <input
                    className="m-input"
                    value={drafts[m.key] || ''}
                    onChange={(e) => setDraft(m.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(m.key) }}
                    placeholder={t('statusesPanel.addPlaceholder', { meta: metaTitle(m.key) })}
                  />
                  <button
                    type="button"
                    className="lead-statuses-add-btn"
                    onClick={() => submit(m.key)}
                    disabled={!(drafts[m.key] || '').trim() || busy[m.key]}
                    aria-label={t('statusesPanel.addAria')}
                  >
                    <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('statusesPanel.deleteTitle')}
        message={pendingDelete ? t('statusesPanel.deleteMessage', { name: pendingDelete.display_name }) : ''}
        confirmLabel={t('statusesPanel.deleteConfirm')}
        danger
        onConfirm={() => { if (pendingDelete) onRemove(pendingDelete.id) }}
      />
    </div>
  )
}

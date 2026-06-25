import { useMemo } from 'react'
import { Inbox, Check, X } from 'lucide-react'

/* ════════════════════════════════════════════════════════════════
   PENDING LEADS — public-page submissions awaiting manual approval.
   Renders nothing when empty. Approve → into the official list;
   reject → soft-delete (undoable via the global undo toast).
   ════════════════════════════════════════════════════════════════ */

/* leads column → the value on the lead row, for the builtin fields. */
const COLUMN_VALUE = (lead, col) => {
  if (col === 'notes') return lead.notes
  return lead[col]
}

export default function PendingLeadsSection({ pending = [], pages = [], onApprove, onReject }) {
  const pageById = useMemo(() => {
    const m = {}
    ;(pages || []).forEach((p) => { m[p.id] = p })
    return m
  }, [pages])

  if (!pending.length) return null

  /* Build display rows: [{ label, value }] for each lead, resolving free-field
     keys to their page label where possible, builtins to a fixed label. */
  const BUILTIN_LABEL = { name: 'שם', phone: 'טלפון', email: 'אימייל', notes: 'הערה' }

  const rowsFor = (lead) => {
    const page = lead.page_id ? pageById[lead.page_id] : null
    const fieldLabel = {}
    if (Array.isArray(page?.fields)) page.fields.forEach((f) => { fieldLabel[f.key] = f.label })

    const out = []
    // Builtin columns that carry a value.
    ;['name', 'phone', 'email', 'notes'].forEach((col) => {
      const v = COLUMN_VALUE(lead, col)
      if (v) out.push({ label: BUILTIN_LABEL[col], value: v })
    })
    // Free fields from the JSONB data blob.
    Object.entries(lead.data || {}).forEach(([k, v]) => {
      if (v) out.push({ label: fieldLabel[k] || k, value: String(v) })
    })
    return out
  }

  return (
    <section className="l-pending" aria-label="לידים הממתינים לאישור">
      <div className="l-pending-head">
        <Inbox size={16} strokeWidth={1.7} aria-hidden="true" />
        <span className="l-pending-title">ממתינים לאישור</span>
        <span className="l-pending-count mono">{pending.length}</span>
      </div>
      <div className="l-pending-list">
        {pending.map((lead) => {
          const page = lead.page_id ? pageById[lead.page_id] : null
          return (
            <div className="l-pending-card" key={lead.id}>
              <div className="l-pending-info">
                {page?.title ? <p className="l-pending-source">מתוך: {page.title}</p> : null}
                <dl className="l-pending-fields">
                  {rowsFor(lead).map((r) => (
                    <div className="l-pending-field" key={`${lead.id}-${r.label}`}>
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="l-pending-actions">
                <button type="button" className="l-pending-approve" onClick={() => onApprove(lead.id)}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" /> אישור
                </button>
                <button type="button" className="l-pending-reject" onClick={() => onReject(lead.id)} aria-label="דחייה">
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

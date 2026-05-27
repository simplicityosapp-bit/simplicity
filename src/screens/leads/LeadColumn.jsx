import { useState } from 'react'
import LeadCard from './LeadCard'

export default function LeadColumn({ title, color, metaKey, leads, onEdit, onConvert, onDropLead, sources, statuses }) {
  const [over, setOver] = useState(false)

  const handleDragOver = (e) => {
    /* preventDefault lets us be a drop target. effectAllowed must
       match (set on dragstart) — keep it 'move'. */
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!over) setOver(true)
  }
  const handleDragLeave = (e) => {
    /* Only clear on actually leaving the column (not crossing into a
       child element). */
    if (!e.currentTarget.contains(e.relatedTarget)) setOver(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setOver(false)
    const leadId = e.dataTransfer.getData('text/lead-id')
    if (leadId && onDropLead) onDropLead(leadId, metaKey)
  }

  return (
    <div
      className={`lead-col${over ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="lead-col-head">
        <span className="lead-col-dot" style={{ background: color }} aria-hidden="true" />
        <p className="lead-col-title">{title}</p>
        <span className="lead-col-count">{leads.length}</span>
      </div>
      <div className="lead-col-body">
        {leads.length ? (
          leads.map((l) => <LeadCard key={l.id} lead={l} onEdit={onEdit} onConvert={onConvert} sources={sources} statuses={statuses} />)
        ) : (
          <p className="lead-col-empty">אין לידים בעמודה זו</p>
        )}
      </div>
    </div>
  )
}

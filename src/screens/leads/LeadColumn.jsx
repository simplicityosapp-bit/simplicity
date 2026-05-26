import LeadCard from './LeadCard'

export default function LeadColumn({ title, color, leads, onEdit, sources, statuses }) {
  return (
    <div className="lead-col">
      <div className="lead-col-head">
        <span className="lead-col-dot" style={{ background: color }} aria-hidden="true" />
        <p className="lead-col-title">{title}</p>
        <span className="lead-col-count">{leads.length}</span>
      </div>
      <div className="lead-col-body">
        {leads.length ? (
          leads.map((l) => <LeadCard key={l.id} lead={l} onEdit={onEdit} sources={sources} statuses={statuses} />)
        ) : (
          <p className="lead-col-empty">אין לידים בעמודה זו</p>
        )}
      </div>
    </div>
  )
}

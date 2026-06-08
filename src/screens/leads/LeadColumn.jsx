import LeadCard from './LeadCard'

/* A meta column. Drop handling is pointer-based (touch + mouse) via the shared
   `dnd` instance: the column is a drop zone keyed by its meta, and each card is
   draggable. */
export default function LeadColumn({ title, color, metaKey, leads, onEdit, onConvert, onDelete, dnd, sources, statuses }) {
  const over = dnd?.overZone === metaKey
  return (
    <div
      className={`lead-col${over ? ' drag-over' : ''}`}
      {...(dnd ? dnd.dropZoneProps(metaKey) : {})}
    >
      <div className="lead-col-head">
        <span className="lead-col-dot" style={{ background: color }} aria-hidden="true" />
        <p className="lead-col-title">{title}</p>
        <span className="lead-col-count">{leads.length}</span>
      </div>
      <div className="lead-col-body">
        {leads.length ? (
          leads.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              onEdit={onEdit}
              onConvert={onConvert}
              onDelete={onDelete}
              sources={sources}
              statuses={statuses}
              dragProps={dnd ? dnd.draggableProps(l.id) : null}
              dragging={dnd?.dragId === l.id}
            />
          ))
        ) : (
          <p className="lead-col-empty">אין לידים בעמודה זו</p>
        )}
      </div>
    </div>
  )
}

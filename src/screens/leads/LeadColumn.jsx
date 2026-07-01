import LeadCard from './LeadCard'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* A meta column. Drop handling is pointer-based (touch + mouse) via the shared
   `dnd` instance: the column is a drop zone keyed by its meta, and each card is
   draggable. */
export default function LeadColumn({ title, color, metaKey, leads, onEdit, onConvert, onDelete, dnd, sources, statuses }) {
  const { t } = useT('leads')
  const over = dnd?.overZone === metaKey
  return (
    <Box
      className={`lead-col${over ? ' drag-over' : ''}`}
      {...(dnd ? dnd.dropZoneProps(metaKey) : {})}
    >
      <Box className="lead-col-head">
        <Txt className="lead-col-dot" style={{ background: color }} aria-hidden="true" />
        <Txt as="p" className="lead-col-title">{title}</Txt>
        <Txt className="lead-col-count">{leads.length}</Txt>
      </Box>
      <Box className="lead-col-body">
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
          <Txt as="p" className="lead-col-empty">{t('column.empty')}</Txt>
        )}
      </Box>
    </Box>
  )
}

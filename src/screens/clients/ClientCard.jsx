import { memo } from 'react'
import { Check } from 'lucide-react'
import { clientBalance, statusMetaOf } from '../../lib/clients'
import { isr } from '../../lib/finance'

const STATUS = {
  active: { label: 'פעיל', cls: 'active' },
  wandering: { label: 'ביניים', cls: 'wandering' },
  past: { label: 'לשעבר', cls: 'past' },
  no_status: { label: 'ללא סטטוס', cls: 'no_status' },
}

const initials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

function ClientCard({
  client, index, onOpen,
  selectMode = false, selected = false, onToggleSelect,
  projects = [], txns, sessions, members, groups, statuses = [],
}) {
  const meta = statusMetaOf(client)
  const isPast = meta === 'past'
  const status = STATUS[meta] || STATUS.no_status
  const sub = client.status_id ? statuses.find((s) => s.id === client.status_id) : null
  const statusLabel = sub ? `${sub.icon ? sub.icon + ' ' : ''}${sub.display_name}` : status.label
  const project = projects.find((p) => p.id === client.project_id)
  const { paid, balance, sessionsPaid, sessionsTotal } = clientBalance(client, txns, sessions, members, groups)
  const sessLabel = `${sessionsPaid}/${sessionsTotal || 0}`
  const isMember = !!members?.some((m) => m.client_id === client.id && !m.left_at)
  const hasSetup = isMember
    || ((Number(client.sessions) > 0 || !!client.group_id) && (Number(client.price_per_session) > 0 || Number(client.total_override) > 0))

  const handleCardClick = () => {
    if (selectMode) onToggleSelect?.(client.id)
    else onOpen?.(client.id)
  }

  return (
    <div
      className={`cc anim${isPast ? ' is-past' : ''}${selectMode ? ' select-mode' : ''}${selected ? ' selected' : ''}`}
      style={{ animationDelay: `${index * 0.04}s` }}
      onClick={handleCardClick}
    >
      {selectMode && (
        <button
          type="button"
          className={`cc-check${selected ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(client.id) }}
          aria-label={selected ? 'בטל בחירה' : 'בחר'}
          aria-pressed={selected}
        >
          {selected && <Check size={13} strokeWidth={2.4} aria-hidden="true" />}
        </button>
      )}
      <div className="cc-head">
        <div className="cc-av">{initials(client.name)}</div>
        <div className="cc-id">
          <p className="cc-name" title={client.name}>{client.name}</p>
          <div className="cc-meta">
            <span className={`cc-status cc-status-${status.cls}`}>{statusLabel}</span>
            {project && <span className="cc-proj">{project.name}</span>}
          </div>
        </div>
        {!selectMode && (
          <button
            type="button"
            className="cc-profile"
            onClick={(e) => {
              e.stopPropagation()
              onOpen?.(client.id)
            }}
          >
            <span>פרופיל</span>
            <span>מלא</span>
          </button>
        )}
      </div>

      <div className={`cc-stats${hasSetup ? '' : ' dim'}`}>
        <div className="cc-stat">
          <p className="cc-stat-l">פגישות</p>
          <p className="cc-stat-v mono">{sessLabel}</p>
        </div>
        <div className="cc-stat divided">
          <p className="cc-stat-l">שולם</p>
          <p className="cc-stat-v mono">{isr(paid)}</p>
        </div>
        <div className="cc-stat">
          <p className="cc-stat-l">יתרה</p>
          <p className="cc-stat-v mono">{isr(balance)}</p>
        </div>
      </div>
    </div>
  )
}

export default memo(ClientCard)

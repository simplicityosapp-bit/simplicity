import { memo } from 'react'
import { Check } from 'lucide-react'
import { clientBalance, effectiveClientMeta } from '../../lib/clients'
import { isr } from '../../lib/finance'
import MG from '../../components/MG'
import { useT } from '../../i18n/useT'

const STATUS = {
  active: { labelKey: 'status.active', cls: 'active' },
  wandering: { labelKey: 'status.wandering', cls: 'wandering' },
  past: { labelKey: 'status.past', cls: 'past' },
  no_status: { labelKey: 'status.noStatus', cls: 'no_status' },
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
  const { t } = useT('clients')
  const isMember = !!members?.some((m) => m.client_id === client.id && !m.left_at)
  /* C1 — group members derive their status from their group(s). */
  const meta = effectiveClientMeta(client, members, groups)
  const isPast = meta === 'past'
  const status = STATUS[meta] || STATUS.no_status
  /* A group-driven client shows the derived meta label, not a stale
     private sub-status. */
  const sub = !isMember && client.status_id ? statuses.find((s) => s.id === client.status_id) : null
  const statusLabel = sub ? `${sub.icon ? sub.icon + ' ' : ''}${sub.display_name}` : t(status.labelKey)
  const project = projects.find((p) => p.id === client.project_id)
  const { paid, balance, hasPersonal, personalDone, personalQuota, groupSessions } = clientBalance(client, txns, sessions, members, groups)
  /* Compact card shows PERSONAL sessions only; a pure group member shows
     the group summary instead. (The full profile shows both.) */
  const sessLabel = hasPersonal
    ? `${personalDone}/${personalQuota || 0}`
    : `${groupSessions.reduce((s, g) => s + g.held, 0)}/${groupSessions.reduce((s, g) => s + (g.quota || 0), 0) || 0}`
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
          aria-label={selected ? t('card.deselect') : t('card.selectAria')}
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
            <span className={`cc-status cc-status-${status.cls}`}><MG text={statusLabel} /></span>
            {project && <span className="cc-proj">{project.name}</span>}
          </div>
        </div>
      </div>

      <div className={`cc-stats${hasSetup ? '' : ' dim'}`}>
        <div className="cc-stat">
          <p className="cc-stat-l">{t('card.sessions')}</p>
          <p className="cc-stat-v mono">{sessLabel}</p>
        </div>
        <div className="cc-stat divided">
          <p className="cc-stat-l">{t('card.paid')}</p>
          <p className="cc-stat-v mono">{isr(paid)}</p>
        </div>
        <div className="cc-stat">
          <p className="cc-stat-l">{t('card.balance')}</p>
          <p className="cc-stat-v mono">{isr(balance)}</p>
        </div>
      </div>
    </div>
  )
}

export default memo(ClientCard)

import { memo } from 'react'
import { Check } from 'lucide-react'
import { clientBalance, effectiveClientMeta } from '../../lib/clients'
import { isr } from '@simplicity/core'
import MG from '../../components/MG'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

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
  projects = [], txns, sessions, members, groups, statuses = [], bal,
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
  /* `bal` is the precomputed balance from the clients screen's balanceByClient
     map (avoids re-scanning transactions per card); fall back to computing it
     for any caller that doesn't pass it. */
  const { paid, balance, hasPersonal, personalDone, personalQuota, groupSessions } = bal || clientBalance(client, txns, sessions, members, groups)
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
    <Box
      className={`cc anim${isPast ? ' is-past' : ''}${selectMode ? ' select-mode' : ''}${selected ? ' selected' : ''}`}
      style={{ animationDelay: `${index * 0.04}s` }}
      onClick={handleCardClick}
    >
      {selectMode && (
        <Btn
          type="button"
          className={`cc-check${selected ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(client.id) }}
          aria-label={selected ? t('card.deselect') : t('card.selectAria')}
          aria-pressed={selected}
        >
          {selected && <Check size={13} strokeWidth={2.4} aria-hidden="true" />}
        </Btn>
      )}
      <Box className="cc-head">
        <Box className="cc-av">{initials(client.name)}</Box>
        <Box className="cc-id">
          <Txt as="p" className="cc-name" title={client.name}>{client.name}</Txt>
          <Box className="cc-meta">
            <Txt className={`cc-status cc-status-${status.cls}`}><MG text={statusLabel} /></Txt>
            {project && <Txt className="cc-proj">{project.name}</Txt>}
          </Box>
        </Box>
      </Box>

      <Box className={`cc-stats${hasSetup ? '' : ' dim'}`}>
        <Box className="cc-stat">
          <Txt as="p" className="cc-stat-l">{t('card.sessions')}</Txt>
          <Txt as="p" className="cc-stat-v mono">{sessLabel}</Txt>
        </Box>
        <Box className="cc-stat divided">
          <Txt as="p" className="cc-stat-l">{t('card.paid')}</Txt>
          <Txt as="p" className="cc-stat-v mono">{isr(paid)}</Txt>
        </Box>
        <Box className="cc-stat">
          <Txt as="p" className="cc-stat-l">{t('card.balance')}</Txt>
          <Txt as="p" className="cc-stat-v mono">{isr(balance)}</Txt>
        </Box>
      </Box>
    </Box>
  )
}

export default memo(ClientCard)

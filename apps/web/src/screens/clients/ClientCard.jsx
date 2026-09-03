import { memo } from 'react'
import { Check, BellPlus } from 'lucide-react'
import { clientBalance, effectiveClientMeta, isr } from '@simplicity/core'
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
  client, index, onOpen, onRemind,
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
  const { paid, balance, tracks, perSession } = bal || clientBalance(client, txns, sessions, members, groups)
  /* Meetings, from the tracks the client is actually running. One track — a
     1-on-1 client, or a pure group member — reads as its own progress, which
     is what the card has always shown for each of them. Several tracks read
     as the count held across them and nothing more: adding a workshop's ten
     to a private twelve makes a denominator that is a target of nothing. The
     file breaks it down, and the card links to the file.
     A track with no quota (per-session billing, on either side) shows the
     bare held count; a "/0" denominator was never a target either.
     Ended groups are left out, the same rule the client file's own header
     applies — the running balance is what this line is about, and the group
     that closed keeps its history in the file (beta decision 04/06/2026).
     The card used to count them here and the file did not, so the same
     client reported two different numbers depending on where you looked. */
  const running = tracks.filter((tr) => !tr.ended)
  const sessLabel = running.length === 1
    ? (running[0].quota == null ? `${running[0].held}` : `${running[0].held}/${running[0].quota}`)
    : `${running.reduce((s, tr) => s + tr.held, 0)}`
  /* "Set up" = the billing is configured enough that the numbers below mean
     something; otherwise they dim, so a row of ₪0 doesn't read as real.
     The quota half of this test is package-only. A per-session client keeps
     sessions at 0 BY DESIGN, so requiring sessions > 0 dimmed every correctly
     configured one of them — a client with a price, held meetings and a real
     balance was being shown as an empty shell. What configures a per-session
     client is the price on its own. */
  const hasPrice = Number(client.price_per_session) > 0 || Number(client.total_override) > 0
  const hasSetup = isMember
    || (perSession && hasPrice)
    || ((Number(client.sessions) > 0 || !!client.group_id) && hasPrice)

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
        {/* Setting a reminder was a four-step trip: open the client, find the
            panel, add, pick the client back. It is the one thing you reach for
            with the card already in front of you, so it lives on the card.
            Hidden in select mode, where every tap belongs to the selection. */}
        {onRemind && !selectMode && (
          <Btn
            type="button"
            className="cc-remind"
            onClick={(e) => { e.stopPropagation(); onRemind(client) }}
            aria-label={t('card.remindAria')}
            title={t('card.remindAria')}
          >
            <BellPlus size={15} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        )}
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

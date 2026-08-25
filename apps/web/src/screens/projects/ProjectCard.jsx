import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Trash2, Pencil } from 'lucide-react'
import { isr } from '@simplicity/core'
import { buildRoute, ROUTES } from '../../lib/routes'
import { Box, Txt, Btn } from '../../components/ui'
import { useT } from '../../i18n/useT'

/* One project card: color dot + name + group-count tag, then three stats
   (clients / income for the active scope / open tasks) + edit + delete.
   Tapping the card opens the project detail screen. */
function ProjectCard({ project, clientsCount, income, openTasks, groupsCount, incomeLabel, index, onEdit, onDelete }) {
  const { t } = useT('projects')
  const navigate = useNavigate()
  const open = () => navigate(buildRoute(ROUTES.PROJECT, { id: project.id }))
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  /* Rows written before migration 0111 carry no status and are active. */
  const isEnded = project.status === 'ended'
  return (
    <Box
      className={`pc anim${isEnded ? ' is-ended' : ''}`}
      style={{ animationDelay: `${index * 0.06}s` }}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
    >
      <Box className="ph">
        <Txt className="pcolor" style={{ background: project.color || 'var(--sage)' }} />
        <Txt as="p" className="pn" title={project.name}>{project.name}</Txt>
        {/* A finished project says so first — it is the one thing about the
            card that changes how you read every number on it. Otherwise the
            tag carries the group count, and falls back to "פעיל" when there
            are no groups (a project can be perfectly active with none). */}
        {isEnded ? (
          <Txt className="ps-tag ended">{t('card.ended')}</Txt>
        ) : groupsCount ? (
          <Txt className="ps-tag">
            <Users size={11} strokeWidth={1.6} aria-hidden="true" /> {groupsCount}
          </Txt>
        ) : (
          <Txt className="ps-tag">{t('card.active')}</Txt>
        )}
        <Btn className="pc-edit" title={t('card.editTitle')} aria-label={t('card.editTitle')} onClick={stop(() => onEdit?.(project))}>
          <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        {/* Trash2, not X: X reads as "dismiss this card". This deletes the
            project. One icon per outcome, app-wide. */}
        <Btn className="pc-del" title={t('card.deleteTitle')} aria-label={t('card.deleteTitle')} onClick={stop(() => onDelete?.(project))}>
          <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
        </Btn>
      </Box>
      <Box className="pc-divider" />
      <Box className="pstats">
        <Box className="pstat">
          <Txt as="p" className="pstat-v mono">{clientsCount}</Txt>
          <Txt as="p" className="pstat-l">{t('card.clients')}</Txt>
        </Box>
        <Box className="pstat">
          <Txt as="p" className="pstat-v mono pstat-inc">{isr(income)}</Txt>
          <Txt as="p" className="pstat-l">{incomeLabel}</Txt>
        </Box>
        <Box className="pstat">
          <Txt as="p" className="pstat-v mono">{openTasks}</Txt>
          <Txt as="p" className="pstat-l">{t('card.tasks')}</Txt>
        </Box>
      </Box>
    </Box>
  )
}

export default memo(ProjectCard)

import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, X, Pencil } from 'lucide-react'
import { isr } from '../../lib/finance'
import { buildRoute, ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'

/* One project card: color dot + name + group-count tag, then three stats
   (clients / income for the active scope / open tasks) + edit + delete.
   Tapping the card opens the project detail screen. */
function ProjectCard({ project, clientsCount, income, openTasks, groupsCount, incomeLabel, index, onEdit, onDelete }) {
  const { t } = useT('projects')
  const navigate = useNavigate()
  const open = () => navigate(buildRoute(ROUTES.PROJECT, { id: project.id }))
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  return (
    <div
      className="pc anim"
      style={{ animationDelay: `${index * 0.06}s` }}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
    >
      <div className="ph">
        <span className="pcolor" style={{ background: project.color || 'var(--sage)' }} />
        <p className="pn" title={project.name}>{project.name}</p>
        {groupsCount ? (
          <span className="ps-tag">
            <Users size={11} strokeWidth={1.6} aria-hidden="true" /> {groupsCount}
          </span>
        ) : (
          <span className="ps-tag">{t('card.active')}</span>
        )}
        <button type="button" className="pc-edit" title={t('card.editTitle')} onClick={stop(() => onEdit?.(project))}>
          <Pencil size={13} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button type="button" className="pc-del" title={t('card.deleteTitle')} onClick={stop(() => onDelete?.(project))}>
          <X size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <div className="pc-divider" />
      <div className="pstats">
        <div className="pstat">
          <p className="pstat-v mono">{clientsCount}</p>
          <p className="pstat-l">{t('card.clients')}</p>
        </div>
        <div className="pstat">
          <p className="pstat-v mono pstat-inc">{isr(income)}</p>
          <p className="pstat-l">{incomeLabel}</p>
        </div>
        <div className="pstat">
          <p className="pstat-v mono">{openTasks}</p>
          <p className="pstat-l">{t('card.tasks')}</p>
        </div>
      </div>
    </div>
  )
}

export default memo(ProjectCard)

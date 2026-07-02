import { useMemo, useState } from 'react'
import { FolderOpen, FolderPlus } from 'lucide-react'
import { financeQuery, isr, currentMonthRange } from '@simplicity/core'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import { useSubscription } from '../../hooks/useSubscription'
import { useUpgradeNav } from '../../hooks/useUpgradeNav'
import ProjectCard from './ProjectCard'
import AddProjectModal from '../../modals/AddProjectModal'
import EditProjectModal from '../../modals/EditProjectModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import { Box, Txt, Btn } from '../../components/ui'
import { useT } from '../../i18n/useT'
import './ProjectsScreen.css'

export default function ProjectsScreen() {
  const { t, gender } = useT('projects')
  const { t: ts } = useT('subscription')
  const { projects, loading, error, addProject, updateProject, removeProject } = useProjects()
  const { limits } = useSubscription()
  const goUpgrade = useUpgradeNav()
  /* Free-tier project ceiling. Infinity while billing isn't enforced. */
  const atProjectLimit = (projects?.length || 0) >= limits.projects
  const { clients } = useClients()
  const { transactions } = useTransactions()
  const { tasks } = useTasks()
  const [view, setView] = useState('monthly')
  const [showAdd, setShowAdd] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editProject, setEditProject] = useState(null)

  const { totals, cards } = useMemo(() => {
    const range = view === 'monthly' ? currentMonthRange() : {}
    const allIncome = financeQuery({ type: 'income', ...range, source: transactions })
    const projIdSet = new Set(projects.map((p) => p.id))
    const clientProjMap = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const assignedClients = clients.filter((c) => c.project_id && projIdSet.has(c.project_id)).length
    const heroIncome = allIncome
      .filter((f) => projIdSet.has(f.project_id) || (f.client_id && clientProjMap.has(f.client_id)))
      .reduce((s, f) => s + f.amount, 0)
    /* groups aren't migrated yet → 0 for now. */
    const cards = projects.map((p) => {
      const projClientIds = new Set(clients.filter((c) => c.project_id === p.id).map((c) => c.id))
      // An explicit project_id wins (same precedence as IncomeByProject): only
      // fall back to the client's project when the row has NO project_id of its
      // own — otherwise a row tagged to project A but whose client sits in
      // project B would be counted in BOTH cards.
      const income = allIncome
        .filter((f) => f.project_id === p.id || (!f.project_id && f.client_id && projClientIds.has(f.client_id)))
        .reduce((s, f) => s + f.amount, 0)
      const openTasks = tasks.filter(
        (t) => t.status !== 'done' && (t.project_id === p.id || (!t.project_id && t.client_id && projClientIds.has(t.client_id))),
      ).length
      return { project: p, clientsCount: projClientIds.size, income, openTasks, groupsCount: 0 }
    })
    return { totals: { assignedClients, heroIncome }, cards }
  }, [view, projects, clients, transactions, tasks])

  const incomeLabel = view === 'monthly' ? t('hero.incomeMonthly') : t('hero.incomeCumulative')
  const cardIncomeLabel = view === 'monthly' ? t('cardIncome.monthly') : t('cardIncome.cumulative')

  return (
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('count', { count: projects.length })}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{t('phase')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('tagline')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('title')}</Txt>
        </Box>
        <Coachmark id="add-project" radius="50%">
          <Btn className="cta-add" aria-label={t('newAria')} onClick={() => (atProjectLimit ? goUpgrade() : setShowAdd(true))}>{t('new')}</Btn>
        </Coachmark>
      </Box>
      {atProjectLimit && (
        <Btn className="sub-limit-note" onClick={goUpgrade}>{ts('limit.projects')} · {ts('limit.upgrade')}</Btn>
      )}

      <Box as="section" className="p-hero">
        <Box className="s-hero">
          <Box className="mg-toggle" role="tablist" aria-label={t('range.aria')}>
            <Btn className={`mg-toggle-btn${view === 'monthly' ? ' on' : ''}`} onClick={() => setView('monthly')}>{t('range.monthly')}</Btn>
            <Btn className={`mg-toggle-btn${view === 'cumulative' ? ' on' : ''}`} onClick={() => setView('cumulative')}>{t('range.cumulative')}</Btn>
          </Box>
          <Txt as="p" className="p-hero-title">{t('hero.title')}</Txt>
          <Box className="p-hero-grid">
            <Box className="p-hero-stat">
              <Txt as="p" className="p-hero-stat-l">{t('hero.projects')}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{projects.length}</Txt>
            </Box>
            <Box className="p-hero-stat divided">
              <Txt as="p" className="p-hero-stat-l">{t('hero.clients')}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{totals.assignedClients}</Txt>
            </Box>
            <Box className="p-hero-stat">
              <Txt as="p" className="p-hero-stat-l">{incomeLabel}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{isr(totals.heroIncome)}</Txt>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box as="section" className="p-list">
        {loading ? (
          <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
        ) : error ? (
          <Box className="empty"><Txt as="p" className="empty-text">{t('loadError', { error })}</Txt></Box>
        ) : projects.length === 0 ? (
          <Box className="empty">
            <Txt className="empty-icon"><FolderOpen size={36} strokeWidth={1.4} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text">{t('empty.text')}</Txt>
            <Btn className="empty-action" onClick={() => setShowAdd(true)}>
              <FolderPlus size={18} strokeWidth={1.6} aria-hidden="true" /> {t('empty.add')}
            </Btn>
            <Box as="details" className="empty-reminder">
              <Txt as="summary">{t('empty.whyImportant')}</Txt>
              <Txt as="p" className="empty-reminder-body">{coachmarkText('add-project', gender).detail}</Txt>
            </Box>
          </Box>
        ) : (
          cards.map((c, i) => (
            <ProjectCard
              key={c.project.id}
              project={c.project}
              clientsCount={c.clientsCount}
              income={c.income}
              openTasks={c.openTasks}
              groupsCount={c.groupsCount}
              incomeLabel={cardIncomeLabel}
              index={i}
              onEdit={setEditProject}
              onDelete={setPendingDelete}
            />
          ))
        )}
      </Box>

      <AddProjectModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addProject} />
      <EditProjectModal
        key={editProject?.id}
        open={!!editProject}
        onClose={() => setEditProject(null)}
        project={editProject}
        onSave={updateProject}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('delete.title')}
        message={pendingDelete ? t('delete.message', { name: pendingDelete.name }) : ''}
        confirmLabel={t('delete.confirm')}
        danger
        onConfirm={() => { if (pendingDelete) removeProject(pendingDelete.id) }}
      />
    </Box>
  )
}

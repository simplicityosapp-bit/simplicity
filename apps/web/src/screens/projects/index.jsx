import { useMemo, useState } from 'react'
import { FolderOpen, FolderPlus, Folder, CloudOff, RotateCcw } from 'lucide-react'
import { financeQuery, isr, currentMonthRange, projectClientIdSet, scopeToProject, belongsToProject } from '@simplicity/core'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
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
  const { projects, loading, unreachable, refetching, error, refetch, addProject, updateProject, removeProject } = useProjects()
  const { limits } = useSubscription()
  const goUpgrade = useUpgradeNav()
  /* Free-tier project ceiling. Infinity while billing isn't enforced. */
  const atProjectLimit = (projects?.length || 0) >= limits.projects
  const { clients, loading: clientsLoading, unreachable: clientsDown } = useClients()
  const { groups, loading: groupsLoading, unreachable: groupsDown } = useGroups()
  const { transactions, loading: txLoading, unreachable: txDown } = useTransactions()
  const { tasks, loading: tasksLoading } = useTasks()
  const [view, setView] = useState('monthly')
  /* 'active' hides finished projects; 'all' brings them back. The SUMMARY is
     deliberately unfiltered either way — filing a project away is a decision
     about the list, and retro-editing the month's income would be a false
     financial report (owner decision 2026-08-25). */
  const [scope, setScope] = useState('active')
  const [showAdd, setShowAdd] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editProject, setEditProject] = useState(null)

  /* The card stats and the hero read from four tables. Any of them still in
     flight — or unreachable — means the numbers below are not yet answers. */
  const pending = loading || clientsLoading || groupsLoading || txLoading || tasksLoading
    || unreachable || clientsDown || groupsDown || txDown

  const { totals, cards } = useMemo(() => {
    const range = view === 'monthly' ? currentMonthRange() : {}
    const allIncome = financeQuery({ type: 'income', ...range, source: transactions })
    const projIdSet = new Set(projects.map((p) => p.id))
    const clientProjMap = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const assignedClients = clients.filter((c) => c.project_id && projIdSet.has(c.project_id)).length
    const heroIncome = allIncome
      .filter((f) => projIdSet.has(f.project_id) || (f.client_id && clientProjMap.has(f.client_id)))
      .reduce((s, f) => s + f.amount, 0)
    const cards = projects.map((p) => {
      const projClientIds = projectClientIdSet(clients, p.id)
      // belongsToProject carries the precedence rule (explicit project_id wins,
      // client fallback only for untagged rows) — see domain/projects.ts.
      const income = scopeToProject(allIncome, p.id, projClientIds)
        .reduce((s, f) => s + f.amount, 0)
      const openTasks = tasks.filter(
        (t) => t.status !== 'done' && belongsToProject(t, p.id, projClientIds),
      ).length
      /* Live count, same source the project screen and the mobile card read.
         It used to be a hardcoded 0 ("groups aren't migrated yet"), which left
         the card's group tag permanently unreachable — every project showed the
         static fallback instead of its real number. */
      const groupsCount = groups.filter((g) => g.project_id === p.id).length
      return { project: p, clientsCount: projClientIds.size, income, openTasks, groupsCount }
    })
    return { totals: { assignedClients, heroIncome }, cards }
  }, [view, projects, clients, groups, transactions, tasks])

  /* Applied to the LIST only — `totals` above is computed over every project
     on purpose. Rows written before migration 0111 carry no status and are
     active, so `!== 'ended'` rather than `=== 'active'`. */
  const endedCount = projects.filter((p) => p.status === 'ended').length
  const visibleCards = scope === 'all' ? cards : cards.filter((c) => c.project.status !== 'ended')

  const incomeLabel = view === 'monthly' ? t('hero.incomeMonthly') : t('hero.incomeCumulative')
  const cardIncomeLabel = view === 'monthly' ? t('cardIncome.monthly') : t('cardIncome.cumulative')

  return (
    <Box className="screen p-screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <Folder size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('title')}
          </Txt>
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
          {/* Every figure here is derived from four separate reads. Until they
              are all in, a zero is not a fact about the practice — it is the
              absence of an answer, and "₪0 הכנסות החודש" is a much worse thing
              to show a coach than a dash. `pending` holds the dash until the
              data can actually support the number. */}
          <Box className="p-hero-grid">
            <Box className="p-hero-stat">
              <Txt as="p" className="p-hero-stat-l">{t('hero.projects')}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{pending ? '—' : projects.length}</Txt>
            </Box>
            <Box className="p-hero-stat divided">
              <Txt as="p" className="p-hero-stat-l">{t('hero.clients')}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{pending ? '—' : totals.assignedClients}</Txt>
            </Box>
            <Box className="p-hero-stat">
              <Txt as="p" className="p-hero-stat-l">{incomeLabel}</Txt>
              <Txt as="p" className="p-hero-stat-v mono">{pending ? '—' : isr(totals.heroIncome)}</Txt>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Only worth showing once something is actually hidden. A coach with no
          finished projects gets no extra control to reason about. */}
      {endedCount > 0 && (
        <Box className="p-scope" role="tablist" aria-label={t('scope.aria')}>
          <Btn
            type="button"
            role="tab"
            aria-selected={scope === 'active'}
            className={`mg-toggle-btn${scope === 'active' ? ' on' : ''}`}
            onClick={() => setScope('active')}
          >
            {t('scope.active')}
          </Btn>
          <Btn
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            className={`mg-toggle-btn${scope === 'all' ? ' on' : ''}`}
            onClick={() => setScope('all')}
          >
            {t('scope.all')} · {endedCount}
          </Btn>
        </Box>
      )}

      <Box as="section" className="p-list">
        {loading ? (
          <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
        ) : unreachable ? (
          /* A read that failed — or that never ran, e.g. offline — falls back to
             an empty list, and the screen used to answer with the FIRST-RUN empty
             state: "אין עדיין פרויקטים", next to a hero confidently reading ₪0.
             That is a false statement about the user's business, not a glitch.
             The raw message rides in `title` so it helps a bug report without
             putting a stack trace in front of the user — same as reports/tasks. */
          <Box className="empty">
            <Txt className="empty-icon"><CloudOff size={36} strokeWidth={1.4} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text" title={error || undefined}>{t('loadError')}</Txt>
            <Btn className="empty-action" type="button" onClick={() => refetch()} disabled={refetching}>
              <RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" />
              {refetching ? t('retrying') : t('retry')}
            </Btn>
          </Box>
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
        ) : visibleCards.length === 0 ? (
          /* Every project the user has is finished. Distinct from the
             first-run empty state above — they have projects, just none
             running — so it offers the way to see them, not "add your first". */
          <Box className="empty">
            <Txt className="empty-icon"><FolderOpen size={36} strokeWidth={1.4} aria-hidden="true" /></Txt>
            <Txt as="p" className="empty-text">{t('empty.allEnded', { count: endedCount })}</Txt>
            <Btn className="empty-action" type="button" onClick={() => setScope('all')}>
              {t('scope.all')}
            </Btn>
          </Box>
        ) : (
          visibleCards.map((c, i) => (
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
